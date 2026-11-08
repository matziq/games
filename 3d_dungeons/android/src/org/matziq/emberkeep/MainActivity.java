package org.matziq.emberkeep;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;

public final class MainActivity extends Activity {
    private WebView game;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        game = new WebView(this);
        game.setBackgroundColor(0xff080e11);
        game.getSettings().setJavaScriptEnabled(true);
        game.getSettings().setDomStorageEnabled(true);
        game.getSettings().setMediaPlaybackRequiresUserGesture(true);
        game.getSettings().setAllowFileAccess(true);
        game.getSettings().setAllowContentAccess(false);
        game.getSettings().setAllowFileAccessFromFileURLs(false);
        game.getSettings().setAllowUniversalAccessFromFileURLs(false);
        game.getSettings().setSupportZoom(false);
        game.setWebChromeClient(new WebChromeClient());
        game.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("file:///android_asset/") || url.startsWith("data:")) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Offline only",
                        null, new ByteArrayInputStream(new byte[0]));
            }
        });
        game.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets.consumeSystemWindowInsets();
        });
        setContentView(game);
        game.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        game.evaluateJavascript("if(typeof resetTouch==='function')resetTouch();"
                + "if(typeof state!=='undefined'&&state==='playing')togglePause();", null);
        game.onPause();
        game.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (game != null) {
            game.onResume();
            game.resumeTimers();
        }
    }

    @Override
    public void onBackPressed() {
        game.evaluateJavascript("if(typeof resetTouch==='function')resetTouch();"
                + "if(typeof state!=='undefined'&&state==='playing')togglePause();", null);
        new AlertDialog.Builder(this).setTitle("Leave Emberkeep?")
                .setMessage("This run is not saved. Stay to resume your adventure.")
                .setNegativeButton("Stay", (dialog, which) -> dialog.dismiss())
                .setPositiveButton("Leave", (dialog, which) -> finish()).show();
    }

    @Override
    protected void onDestroy() {
        game.destroy();
        super.onDestroy();
    }
}
