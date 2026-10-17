package jp.rdlabo.capacitorworkers;

import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Internal runtime host. The application keeps its ordinary BridgeActivity. */
@CapacitorPlugin(name = "CapacitorWorkers")
public class CapacitorWorkersPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile WorkerNetwork network = new WorkerNetwork();
    private WebView runtime;
    private HostBridge hostBridge;
    private PluginCall starting;
    private Runnable timeout;

    private final WebViewListener networkLifecycle = new WebViewListener() {
        @Override public void onPageStarted(WebView webView) {
            bridge.execute(() -> {
                WorkerNetwork previous = network;
                network = new WorkerNetwork();
                previous.shutdown();
            });
        }
    };
    @Override public void load() {
        // Bridge.Builder assigns its listener list after loading plugins.
        // Register on the next UI turn so that assignment cannot discard us.
        main.post(() -> bridge.addWebViewListener(networkLifecycle));
    }

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
            hostBridge = new HostBridge(runtime);
            runtime.addJavascriptInterface(hostBridge, "CapacitorWorkersHost");
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

    // ---- Outbound network transport (see src/compat/fetch/transport.ts) ----

    private WorkerNetwork.Result result(PluginCall call) {
        WorkerNetwork owner = network;
        return new WorkerNetwork.Result() {
            @Override public void resolve(JSObject value) {
                bridge.execute(() -> {
                    if (owner != network) return;
                    if (value != null) call.resolve(value); else call.resolve();
                });
            }
            @Override public void reject(String message) {
                bridge.execute(() -> {
                    if (owner == network) call.reject(message);
                });
            }
        };
    }

    private static List<String[]> headerPairs(JSArray raw) throws Exception {
        List<String[]> headers = new ArrayList<>(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            JSONArray pair = raw.getJSONArray(i);
            if (pair == null || pair.length() != 2) throw new IllegalArgumentException();
            headers.add(new String[]{ pair.getString(0), pair.getString(1) });
        }
        return headers;
    }

    @PluginMethod public void networkOpen(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        String method = call.getString("method");
        JSArray raw = call.getArray("headers");
        Boolean hasBody = call.getBoolean("hasBody");
        String encode = call.getString("encodeResponseBody");
        if (id == null || url == null || method == null || raw == null || hasBody == null) {
            call.reject("Invalid networkOpen arguments");
            return;
        }
        List<String[]> headers;
        try {
            headers = headerPairs(raw);
        } catch (Exception error) {
            call.reject("Invalid request headers");
            return;
        }
        network.open(id, url, method, headers, hasBody, encode, result(call));
    }
    @PluginMethod public void networkWrite(PluginCall call) {
        String id = call.getString("id");
        String chunk = call.getString("chunk");
        if (id == null || chunk == null) { call.reject("Invalid networkWrite arguments"); return; }
        network.write(id, chunk, result(call));
    }
    @PluginMethod public void networkEnd(PluginCall call) {
        String id = call.getString("id");
        if (id == null) { call.reject("Invalid networkEnd arguments"); return; }
        network.end(id, result(call));
    }
    @PluginMethod public void networkRead(PluginCall call) {
        String id = call.getString("id");
        Integer maxBytes = call.getInt("maxBytes");
        if (id == null || maxBytes == null) { call.reject("Invalid networkRead arguments"); return; }
        network.read(id, maxBytes, result(call));
    }
    @PluginMethod public void networkClose(PluginCall call) {
        String id = call.getString("id");
        if (id == null) { call.reject("Invalid networkClose arguments"); return; }
        network.close(id, result(call));
    }

    private void close() {
        if (hostBridge != null) { hostBridge.network.shutdown(); hostBridge = null; }
        if (timeout != null) main.removeCallbacks(timeout);
        if (starting != null) { starting.reject("Document runtime disposed"); starting = null; }
        if (runtime != null) {
            runtime.stopLoading(); runtime.removeJavascriptInterface("CapacitorWorkersHost"); runtime.destroy(); runtime = null;
        }
    }
    @Override protected void handleOnDestroy() { bridge.removeWebViewListener(networkLifecycle); main.post(this::close); network.shutdown(); }

    /**
     * JavaScript interface exposed to the hidden document runtime. The bridge
     * is synchronous, so network results are delivered back into the WebView
     * via CapacitorWorkersHostCallback.deliver(callbackId, success, json).
     */
    private void deliverToHost(WebView owner, String callbackId, boolean success, String resultJson) {
        main.post(() -> {
            WebView view = runtime;
            if (view == null || view != owner) return;
            view.evaluateJavascript(
                "CapacitorWorkersHostCallback.deliver(" + JSONObject.quote(callbackId)
                    + "," + success + "," + (resultJson == null ? "null" : resultJson) + ")",
                null
            );
        });
    }
    private WorkerNetwork.Result hostResult(WebView owner, String callbackId) {
        return new WorkerNetwork.Result() {
            @Override public void resolve(JSObject value) {
                deliverToHost(owner, callbackId, true, value == null ? "null" : value.toString());
            }
            @Override public void reject(String message) {
                JSObject error = new JSObject();
                error.put("message", message);
                deliverToHost(owner, callbackId, false, error.toString());
            }
        };
    }
    private class HostBridge {
        private final WebView owner;
        private final WorkerNetwork network = new WorkerNetwork();
        HostBridge(WebView owner) { this.owner = owner; }
        @JavascriptInterface public void ready() {
            main.post(() -> {
                if (runtime == owner && starting != null) { main.removeCallbacks(timeout); starting.resolve(); starting = null; }
            });
        }
        @JavascriptInterface public void networkOpen(String callbackId, String id, String url, String method, String headersJson, boolean hasBody, String encodeResponseBody) {
            List<String[]> headers;
            try {
                headers = headerPairs(new JSArray(headersJson));
            } catch (Exception error) {
                deliverToHost(owner, callbackId, false, "{\"message\":\"Invalid request headers\"}");
                return;
            }
            network.open(id, url, method, headers, hasBody, encodeResponseBody, hostResult(owner, callbackId));
        }
        @JavascriptInterface public void networkWrite(String callbackId, String id, String chunkBase64) {
            network.write(id, chunkBase64, hostResult(owner, callbackId));
        }
        @JavascriptInterface public void networkEnd(String callbackId, String id) {
            network.end(id, hostResult(owner, callbackId));
        }
        @JavascriptInterface public void networkRead(String callbackId, String id, int maxBytes) {
            network.read(id, maxBytes, hostResult(owner, callbackId));
        }
        @JavascriptInterface public void networkClose(String callbackId, String id) {
            network.close(id, hostResult(owner, callbackId));
        }
    }
}
