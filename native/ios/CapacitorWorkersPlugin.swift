import Capacitor
import WebKit

@objc(CapacitorWorkersPlugin)
public final class CapacitorWorkersPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CapacitorWorkersPlugin"
    public let jsName = "CapacitorWorkers"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
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
        DispatchQueue.main.async { [weak self] in self?.close(); call.resolve() }
    }
    private func close() {
        guard let child = documentController else { return }
        child.close(); child.willMove(toParent: nil); child.view.removeFromSuperview(); child.removeFromParent()
        documentController = nil
    }
    deinit { documentController?.close() }
}
