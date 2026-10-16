package jp.rdlabo.capacitorworkers;

import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URI;

/** Internal runtime host. The application keeps its ordinary BridgeActivity. */
@CapacitorPlugin(name = "CapacitorWorkers")
public class CapacitorWorkersPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView runtime;
    private PluginCall starting;
    private Runnable timeout;

    @PluginMethod public void start(PluginCall call) {
        main.post(() -> {
            if (runtime != null) { call.reject("Document rendering already started"); return; }
            String bootstrap = call.getString("bootstrapURL");
            try {
                URI url = new URI(bootstrap);
                URI local = new URI(bridge.getLocalUrl());
                if (!url.getScheme().equals(local.getScheme()) || !url.getAuthority().equals(local.getAuthority()) || !url.getPath().equals("/index.html")) throw new IllegalArgumentException();
            } catch (Exception error) { call.reject("Invalid document bootstrap URL"); return; }
            starting = call;
            runtime = new WebView(getContext());
            runtime.getSettings().setJavaScriptEnabled(true);
            runtime.getSettings().setDomStorageEnabled(true);
            runtime.addJavascriptInterface(new Object() {
                @JavascriptInterface public void ready() {
                    main.post(() -> {
                        if (starting != null) { main.removeCallbacks(timeout); starting.resolve(); starting = null; }
                    });
                }
            }, "CapacitorWorkersHost");
            runtime.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return bridge.getLocalServer().shouldInterceptRequest(request);
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return !request.getUrl().toString().equals(bootstrap);
                }
            });
            timeout = () -> { if (starting != null) { starting.reject("Document host startup timed out"); starting = null; close(); } };
            main.postDelayed(timeout, 30000);
            runtime.loadUrl(bootstrap);
        });
    }
    @PluginMethod public void stop(PluginCall call) { main.post(() -> { close(); call.resolve(); }); }
    private void close() {
        if (timeout != null) main.removeCallbacks(timeout);
        if (starting != null) { starting.reject("Document runtime disposed"); starting = null; }
        if (runtime != null) {
            runtime.stopLoading(); runtime.removeJavascriptInterface("CapacitorWorkersHost"); runtime.destroy(); runtime = null;
        }
    }
    @Override protected void handleOnDestroy() { main.post(this::close); }
}
