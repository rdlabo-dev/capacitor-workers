import WebKit
import Capacitor

// Test-only bridge; appended to SceneDelegate.swift by the experiment runner.
final class DocumentBridgeController: CAPBridgeViewController {
    private var documents: DocumentSchemeHandler?
    private var documentNavigation: DocumentNavigationDelegate?
    private var instance: InstanceConfiguration!
    override func capacitorDidLoad() {
        guard let page = webView, let documents = documents else { return }
        let navigation = DocumentNavigationDelegate(original: page.navigationDelegate, documents: documents)
        documentNavigation = navigation
        page.navigationDelegate = navigation
        documents.page = page
    }
    override func webViewConfiguration(for configuration: InstanceConfiguration) -> WKWebViewConfiguration {
        instance = configuration
        return super.webViewConfiguration(for: configuration)
    }
    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let assets = configuration.urlSchemeHandler(forURLScheme: "capacitor")!
        let handler = DocumentSchemeHandler(assets: assets)
        documents = handler
        // WKWebViewConfiguration cannot replace a registered handler. Recreate
        // Capacitor's configuration through its public factory, retaining its bridge controller.
        let actual = super.webViewConfiguration(for: instance)
        actual.userContentController = configuration.userContentController
        actual.setURLSchemeHandler(handler, forURLScheme: "capacitor")
        actual.userContentController.addScriptMessageHandler(handler, contentWorld: .page, name: "documentFetch")
        if let path = Bundle.main.path(forResource: "page-fetch", ofType: "js", inDirectory: "public"),
           let script = try? String(contentsOfFile: path, encoding: .utf8) {
            actual.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if let path = Bundle.main.path(forResource: "probe", ofType: "js", inDirectory: "public"),
           let script = try? String(contentsOfFile: path, encoding: .utf8) {
            actual.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        return super.webView(with: frame, configuration: actual)
    }
}

final class DocumentNavigationDelegate: NSObject, WKNavigationDelegate {
    private let original: WKNavigationDelegate?
    private let documents: DocumentSchemeHandler
    init(original: WKNavigationDelegate?, documents: DocumentSchemeHandler) { self.original = original; self.documents = documents }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.targetFrame?.isMainFrame == true { documents.documentURL = action.request.url }
        if let original = original, original.responds(to: NSSelectorFromString("webView:decidePolicyForNavigationAction:decisionHandler:")) {
            original.webView?(webView, decidePolicyFor: action, decisionHandler: decisionHandler)
        } else { decisionHandler(.allow) }
    }
    override func responds(to selector: Selector!) -> Bool { super.responds(to: selector) || (original?.responds(to: selector) ?? false) }
    override func forwardingTarget(for selector: Selector!) -> Any? { original?.responds(to: selector) == true ? original : super.forwardingTarget(for: selector) }
}

final class DocumentSchemeHandler: NSObject, WKURLSchemeHandler, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    private let assets: WKURLSchemeHandler
    private var runtime: WKWebView!
    weak var page: WKWebView?
    var documentURL: URL?
    private var documentTasks = Set<String>()
    private var requests: [String: [String: Any]] = [:]
    private var redirects = 0
    private var fetchReplies: [String: (Any?, String?) -> Void] = [:]
    private var fetchRequests: [String: [String: Any]] = [:]
    private var ready = false
    private var tasks: [String: WKURLSchemeTask] = [:]
    init(assets: WKURLSchemeHandler) {
        self.assets = assets
        super.init()
        let previousReport = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-document-result.json")
        try? FileManager.default.removeItem(at: previousReport)
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(assets, forURLScheme: "capacitor")
        config.userContentController.add(self, name: "documents")
        runtime = WKWebView(frame: .zero, configuration: config)
        if #available(iOS 16.4, *) { runtime.isInspectable = true }
        runtime.load(URLRequest(url: URL(string: "capacitor://localhost/runtime.html")!))
    }
    private func handles(_ task: WKURLSchemeTask) -> Bool {
        let url = task.request.url!
        return url.host == "localhost" && (url.path.hasPrefix("/pages/") || url.path.hasPrefix("/api/"))
    }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard handles(task) else { assets.webView(webView, start: task); return }
        let id = UUID().uuidString
        tasks[id] = task
        if task.request.url == documentURL { documentTasks.insert(id); documentURL = nil }
        if ready { dispatch(id, task) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            if let expired = self?.tasks.removeValue(forKey: id) {
                self?.requests.removeValue(forKey: id)
                self?.documentTasks.remove(id)
                expired.didFailWithError(URLError(.timedOut))
            }
        }
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        guard handles(task) else { assets.webView(webView, stop: task); return }
        for (id, current) in tasks where current === task {
            tasks.removeValue(forKey: id); requests.removeValue(forKey: id); documentTasks.remove(id)
        }
    }
    private func dispatch(_ id: String, _ task: WKURLSchemeTask) {
        var request: [String: Any] = ["id": id, "url": task.request.url!.absoluteString,
            "method": task.request.httpMethod ?? "GET", "headers": task.request.allHTTPHeaderFields ?? [:], "document": documentTasks.contains(id)]
        if let body = task.request.httpBody {
            request["body"] = body.base64EncodedString()
        } else if let stream = task.request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 8192)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count < 0 {
                    tasks.removeValue(forKey: id)
                    task.didFailWithError(stream.streamError ?? URLError(.cannotDecodeRawData))
                    return
                }
                if count == 0 { break }
                data.append(buffer, count: count)
            }
            request["body"] = data.base64EncodedString()
        }
        requests[id] = request
        let json = String(data: try! JSONSerialization.data(withJSONObject: request), encoding: .utf8)!
        runtime.evaluateJavaScript("window.dispatchDocument(\(json)); undefined") { [weak self] _, error in
            if let error = error, let failed = self?.tasks.removeValue(forKey: id) {
                self?.requests.removeValue(forKey: id); self?.documentTasks.remove(id)
                failed.didFailWithError(error)
            }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard var request = message.body as? [String: Any], message.frameInfo.isMainFrame else { replyHandler(nil, "Invalid request"); return }
        if let body = request["formNavigate"] as? [String: Any], let address = body["url"] as? String,
           let url = URL(string: address), url.scheme == "capacitor", url.host == "localhost",
           url.user == nil, url.password == nil, url.port == nil,
           url.path.hasPrefix("/pages/") || url.path.hasPrefix("/api/"),
           let encoded = body["body"] as? String, let bytes = Data(base64Encoded: encoded) {
            var navigation = URLRequest(url: url)
            navigation.httpMethod = "POST"
            navigation.httpBody = bytes
            navigation.allHTTPHeaderFields = body["headers"] as? [String: String]
            replyHandler(true, nil)
            page?.load(navigation)
            return
        }
        if var report = request["report"] as? [String: Any] {
            report["nativeHistory"] = ["back": page?.backForwardList.backList.map { $0.url.absoluteString } ?? [], "current": page?.url?.absoluteString ?? "", "forward": page?.backForwardList.forwardList.map { $0.url.absoluteString } ?? []]
            guard let data = try? JSONSerialization.data(withJSONObject: report, options: .prettyPrinted) else { replyHandler(nil, "Invalid report"); return }
            let destination = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-document-result.json")
            do { try data.write(to: destination); replyHandler(true, nil) } catch { replyHandler(nil, error.localizedDescription) }
            return
        }
        let id = UUID().uuidString
        request["id"] = id
        fetchReplies[id] = replyHandler
        fetchRequests[id] = request
        if ready { dispatchFetch(id) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            self?.fetchRequests.removeValue(forKey: id)
            self?.fetchReplies.removeValue(forKey: id)?(nil, "Fetch timeout")
        }
    }
    private func dispatchFetch(_ id: String) {
        guard let request = fetchRequests.removeValue(forKey: id),
              let data = try? JSONSerialization.data(withJSONObject: request), let json = String(data: data, encoding: .utf8) else { return }
        runtime.evaluateJavaScript("window.dispatchPageFetch(\(json)); undefined") { [weak self] _, error in
            if let error = error { self?.fetchReplies.removeValue(forKey: id)?(nil, error.localizedDescription) }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String, let data = text.data(using: .utf8),
              let result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        if result["ready"] as? Bool == true {
            ready = true
            for (id, task) in tasks { dispatch(id, task) }
            for id in Array(fetchRequests.keys) { dispatchFetch(id) }
            return
        }
        if let id = result["fetchId"] as? String {
            fetchReplies.removeValue(forKey: id)?(result, nil)
            return
        }
        guard let id = result["id"] as? String, let task = tasks.removeValue(forKey: id),
              let status = result["status"] as? Int, let headers = result["headers"] as? [String: String],
              let encoded = result["body"] as? String, let body = Data(base64Encoded: encoded) else { return }
        let isDocument = documentTasks.remove(id) != nil
        let original = requests.removeValue(forKey: id) ?? [:]
        if isDocument && [301, 302, 303, 307, 308].contains(status), let location = headers["location"], let url = URL(string: location) {
            redirects += 1
            guard redirects <= 20, url.scheme == "capacitor", url.host == "localhost", url.path.hasPrefix("/pages/") || url.path.hasPrefix("/api/") else {
                redirects = 0
                task.didFailWithError(URLError(.httpTooManyRedirects))
                return
            }
            var next = URLRequest(url: url)
            let method = original["method"] as? String ?? "GET"
            let becomesGET = ((status == 301 || status == 302) && method == "POST") || (status == 303 && method != "GET" && method != "HEAD")
            next.httpMethod = becomesGET ? "GET" : method
            next.allHTTPHeaderFields = original["headers"] as? [String: String]
            if becomesGET {
                for name in ["Content-Type", "Content-Length", "Content-Encoding", "Content-Language", "Content-Location"] { next.setValue(nil, forHTTPHeaderField: name) }
            } else if let encoded = original["body"] as? String { next.httpBody = Data(base64Encoded: encoded) }
            // Finish no intermediate document: replace the provisional load with
            // a new native request, preserving POST for 307/308.
            task.didFailWithError(URLError(.cancelled))
            page?.load(next)
            return
        }
        if isDocument { redirects = 0 }
        var diagnosticHeaders = headers
        diagnosticHeaders["x-native-request-body-bytes"] = String((original["body"] as? String).flatMap { Data(base64Encoded: $0) }?.count ?? 0)
        guard let response = HTTPURLResponse(url: task.request.url!, statusCode: status, httpVersion: nil, headerFields: diagnosticHeaders) else { return }
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }
}
