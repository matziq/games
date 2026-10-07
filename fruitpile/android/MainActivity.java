package com.matziq.fruitpile;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;

public final class MainActivity extends Activity {
    private WebView game;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(11, 19, 36));
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        game.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.equals("file:///android_asset/index.html") || url.startsWith("data:")) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Offline only",
                    java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 19, 36));
        root.addView(game, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                    view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                } else {
                    view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
                }
                return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
            }
        });
        game.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        game.evaluateJavascript("window.dispatchEvent(new Event('blur'))", null);
        game.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        game.onResume();
    }

    @Override
    public void onBackPressed() {
        game.evaluateJavascript(
            "document.getElementById('btnPause').click()", null);
    }

    @Override
    protected void onDestroy() {
        game.destroy();
        super.onDestroy();
    }
}
