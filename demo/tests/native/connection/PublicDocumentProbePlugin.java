package jp.rdlabo.capacitorworkers.poc;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.webkit.WebView;
import android.os.Handler;
import android.os.Looper;
import java.nio.charset.StandardCharsets;
@CapacitorPlugin(name = "PublicDocumentProbe")
public class PublicDocumentProbePlugin extends Plugin {
    @Override public void load() {
        new Handler(Looper.getMainLooper()).post(() -> bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                try (java.io.InputStream stream = getContext().getAssets().open("public/probe.js")) {
                    view.evaluateJavascript(new String(stream.readAllBytes(), StandardCharsets.UTF_8), null);
                } catch (Exception error) { android.util.Log.e("PublicDocumentProbe", "Probe", error); }
            }
        }));
    }
}
