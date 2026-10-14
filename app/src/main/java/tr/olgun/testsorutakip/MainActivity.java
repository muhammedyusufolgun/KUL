package tr.olgun.testsorutakip;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.net.URLEncoder;

public final class MainActivity extends Activity {
    private WebView webView;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(220,239,255));
        getWindow().setNavigationBarColor(Color.rgb(255,255,255));
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(240,247,255));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                if ("file".equalsIgnoreCase(request.getUrl().getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) { }
                return true;
            }
        });
        webView.addJavascriptInterface(new JsBridge(), "AndroidBridge");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }
    public class JsBridge {
        @JavascriptInterface public void shareWhatsApp(String number, String text) {
            if (number == null || !number.matches("90[0-9]{10}") || text == null) return;
            String uri;
            try { uri = "https://wa.me/" + number + "?text=" + URLEncoder.encode(text, "UTF-8"); }
            catch (java.io.UnsupportedEncodingException e) { return; }
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
                try {
                    intent.setPackage("com.whatsapp");
                    startActivity(intent);
                } catch (Exception e) {
                    try {
                        intent.setPackage("com.whatsapp.w4b");
                        startActivity(intent);
                    } catch (Exception e2) {
                        try { intent.setPackage(null); startActivity(intent); }
                        catch (Exception ignored) { }
                    }
                }
            });
        }
    }
    @Override public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("(function(){var x=document.getElementById('courseDetail');if(x&&!x.hidden){document.getElementById('backCourses').click();return true;}return false})()", value -> {
                if (!"true".equals(value)) MainActivity.super.onBackPressed();
            });
        } else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
