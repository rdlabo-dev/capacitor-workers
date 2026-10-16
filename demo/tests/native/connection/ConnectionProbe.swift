import WebKit
import Capacitor

// Test-only: uses the ordinary CAPBridgeViewController and a registered plugin.
@objc(ConnectionProbePlugin)
final class ConnectionProbePlugin: CAPPlugin, CAPBridgedPlugin, WKScriptMessageHandler {
    let identifier = "ConnectionProbePlugin"
    let jsName = "ConnectionProbe"
    let pluginMethods: [CAPPluginMethod] = []
    private var result: [String: Any] = [:]
    private var reportURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("connection-probe.json")
    }
    private var replayURL: URL?
    private var pages: [[String: Any]] = []
    private let lateHandler = LateSchemeHandler()

    override func load() {
        guard let page = bridge?.webView else { return }
        try? FileManager.default.removeItem(at: reportURL)
        let config = page.configuration
        result["controller"] = String(describing: type(of: bridge!.viewController!))
        result["existingHandler"] = String(describing: type(of: config.urlSchemeHandler(forURLScheme: "capacitor")!))
        config.setURLSchemeHandler(lateHandler, forURLScheme: "lateprobe")
        result["configurationCopyHasNewHandler"] = config.urlSchemeHandler(forURLScheme: "lateprobe") != nil
        result["liveConfigurationHasNewHandler"] = page.configuration.urlSchemeHandler(forURLScheme: "lateprobe") != nil
        page.configuration.userContentController.add(self, name: "connectionProbe")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self = self else { return }
            self.webView?.load(URLRequest(url: URL(string: "capacitor://localhost/probe/page")!))
        }
    }

    override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url, url.path.hasPrefix("/probe/") else { return nil }
        if replayURL == url { replayURL = nil; return nil }
        replayURL = url
        result["pluginInterceptedNavigation"] = true
        // A public plugin hook can cancel navigation, but cannot return a Response.
        DispatchQueue.main.async { [weak self] in
            self?.webView?.loadHTMLString("""
            <!doctype html><title>Connection probe</title><h1>Rendered</h1>
            <script>
            window.pageRuns = (window.pageRuns || 0) + 1;
            window.webkit.messageHandlers.connectionProbe.postMessage({
              pageRuns: window.pageRuns,
              url: location.href, baseURI: document.baseURI,
              relative: new URL('./next', document.baseURI).href,
              heading: document.querySelector('h1').textContent
            });
            </script>
            """, baseURL: url)
        }
        return true
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard var pageResult = message.body as? [String: Any] else { return }
        pageResult["back"] = webView?.backForwardList.backList.map { $0.url.absoluteString } ?? []
        pageResult["forward"] = webView?.backForwardList.forwardList.map { $0.url.absoluteString } ?? []
        pages.append(pageResult)
        result["pages"] = pages
        if pages.count < 3 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                guard let self = self else { return }
                if self.pages.count == 1 { self.webView?.evaluateJavaScript("location.href = './next'") }
                else {
                    self.result["canGoBackAfterLoad"] = self.webView?.canGoBack ?? false
                    self.webView?.goBack()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                        guard let self = self else { return }
                        self.result["finalURL"] = self.webView?.url?.absoluteString ?? ""
                        self.result["completed"] = true
                        self.saveReport()
                        self.webView?.configuration.userContentController.removeScriptMessageHandler(forName: "connectionProbe")
                    }
                }
            }
        }
        result["history"] = webView?.backForwardList.backList.map { $0.url.absoluteString } ?? []
        saveReport()
    }

    private func saveReport() {
        if let data = try? JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: reportURL) }
    }
}

final class LateSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) { urlSchemeTask.didFailWithError(URLError(.unsupportedURL)) }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
