import Capacitor
import WebKit

// Test-only entry: the application keeps CAPBridgeViewController unchanged.
@objc(DocumentConnectionPlugin)
final class DocumentConnectionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "DocumentConnectionPlugin"
    let jsName = "DocumentConnection"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)]
    private var documentController: DocumentBridgeController?

    override func load() {
        bridge?.webView?.configuration.userContentController.addUserScript(WKUserScript(
            source: "if (location.pathname === '/' || location.pathname === '/index.html') { window.stop(); setTimeout(() => window.Capacitor.nativePromise('DocumentConnection', 'open', {}), 100); }", injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    @objc func open(_ call: CAPPluginCall) {
        guard documentController == nil, let parent = bridge?.viewController,
              let host = bridge?.webView else { call.reject("Already opened or missing bridge"); return }
        let child = DocumentBridgeController()
        child.runtimeHost = host
        documentController = child
        call.resolve()
        DispatchQueue.main.async {
            parent.addChild(child)
            child.view.frame = parent.view.bounds
            child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            parent.view.addSubview(child.view)
            child.didMove(toParent: parent)
            if #available(iOS 16.4, *) { host.isInspectable = true }
        }
    }
}
