import Capacitor
import WebKit

@objc(CapacitorWorkersPlugin)
public final class CapacitorWorkersPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CapacitorWorkersPlugin"
    public let jsName = "CapacitorWorkers"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "networkOpen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "networkWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "networkEnd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "networkRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "networkClose", returnType: CAPPluginReturnPromise)
    ]
    private var network = NetworkBridge()
    private var networkLifecycle: NetworkLifecycle?
    public override func load() {
        guard let content = webView?.configuration.userContentController else { return }
        let lifecycle = NetworkLifecycle { [weak self] in
            guard let bridge = self?.bridge as? CapacitorBridge else { return }
            bridge.dispatchQueue.async { [weak self] in
                guard let self else { return }
                let previous = self.network
                previous.invalidate()
                self.network = NetworkBridge()
                Task { await previous.shutdown() }
            }
        }
        networkLifecycle = lifecycle
        content.add(lifecycle, name: "CapacitorWorkersNetworkReset")
        content.addUserScript(WKUserScript(
            source: "window.webkit.messageHandlers.CapacitorWorkersNetworkReset.postMessage(null)",
            injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
    }
    private var documentController: DocumentBridgeController?
    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let bridge = self.bridge, let parent = bridge.viewController, let host = bridge.webView else { call.reject("Missing Capacitor bridge"); return }
            guard self.documentController == nil else { call.reject("Document rendering already started"); return }
            guard let entry = call.getString("entry"), entry.hasPrefix("/"), !entry.hasPrefix("//"), !entry.contains("\\"),
                  let baseURL = call.getString("baseURL"), let assets = call.getArray("assets", String.self), let script = call.getString("pageScript"), !script.isEmpty else { call.reject("Invalid document configuration"); return }
            let child = DocumentBridgeController()
            child.runtimeHost = host
            child.localURL = bridge.config.localURL
            child.settings = ["entry": entry, "baseURL": baseURL, "assets": assets, "pageScript": script]
            self.documentController = child
            parent.addChild(child)
            child.view.frame = parent.view.bounds
            child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            parent.view.addSubview(child.view)
            child.didMove(toParent: parent)
            call.resolve()
        }
    }
    @objc func stop(_ call: CAPPluginCall) {
        let owner = network
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.resolve(); return }
            self.close()
            Task { await owner.closeAll(); call.resolve() }
        }
    }
    @objc func networkOpen(_ call: CAPPluginCall) { network.networkOpen(call) }
    @objc func networkWrite(_ call: CAPPluginCall) { network.networkWrite(call) }
    @objc func networkEnd(_ call: CAPPluginCall) { network.networkEnd(call) }
    @objc func networkRead(_ call: CAPPluginCall) { network.networkRead(call) }
    @objc func networkClose(_ call: CAPPluginCall) { network.networkClose(call) }
    private func close() {
        guard let child = documentController else { return }
        child.close(); child.willMove(toParent: nil); child.view.removeFromSuperview(); child.removeFromParent()
        documentController = nil
    }
    deinit {
        documentController?.close()
        let network = network
        Task { await network.shutdown() }
    }
}

// The handler does not retain the plugin. A new main-frame document receives a
// fresh network owner before its application scripts can open connections.
private final class NetworkLifecycle: NSObject, WKScriptMessageHandler {
    private let reset: () -> Void
    init(reset: @escaping () -> Void) { self.reset = reset }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        reset()
    }
}
