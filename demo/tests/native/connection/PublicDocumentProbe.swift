// Test instrumentation; not part of the native implementation.
final class PublicDocumentProbe: NSObject, WKScriptMessageHandlerWithReply {
    weak var page: WKWebView?
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard var report = (message.body as? [String: Any])?["report"] as? [String: Any] else { replyHandler(nil, "Invalid report"); return }
        report["nativeHistory"] = ["back": page?.backForwardList.backList.map { $0.url.absoluteString } ?? [], "current": page?.url?.absoluteString ?? ""]
        let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-document-result.json")
        do { try JSONSerialization.data(withJSONObject: report, options: .prettyPrinted).write(to: file); replyHandler(true, nil) }
        catch { replyHandler(nil, error.localizedDescription) }
    }
}
