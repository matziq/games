package org.matziq.emberkeep;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;

public final class MainActivity extends Activity {
    private WebView game;
    private boolean activityPaused;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xff080e11);
        game = new WebView(this);
        game.setBackgroundColor(0xff080e11);
        game.getSettings().setJavaScriptEnabled(true);
        game.getSettings().setUserAgentString(game.getSettings().getUserAgentString() + " EmberkeepAndroid");
        game.getSettings().setTextZoom(Math.round(100f * getResources().getConfiguration().fontScale));
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
                if (url.equals("https://emberkeep.local/index.html")) {
                    try {
                        return new WebResourceResponse("text/html", "UTF-8", getAssets().open("index.html"));
                    } catch (IOException error) {
                        return new WebResourceResponse("text/plain", "UTF-8", 500, "Asset unavailable",
                                null, new ByteArrayInputStream(new byte[0]));
                    }
                }
                if (url.startsWith("data:")) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Offline only",
                        null, new ByteArrayInputStream(new byte[0]));
            }
        });
        root.addView(game, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                                | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            } else {
                // Before Android 11 the decor fits system windows by default.
                return insets;
            }
        });
        setContentView(root);
        game.loadUrl("https://emberkeep.local/index.html");
    }

    @Override
    protected void onPause() {
        activityPaused = true;
        game.evaluateJavascript("if(typeof resetTouch==='function')resetTouch();"
                + "if(typeof state!=='undefined'&&state==='playing')togglePause();"
                + "if(typeof saveRun==='function')saveRun();",
                result -> { if (activityPaused) game.pauseTimers(); });
        game.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        activityPaused = false;
        if (game != null) {
            game.onResume();
            game.resumeTimers();
        }
    }

    @Override
    public void onBackPressed() {
        game.evaluateJavascript("if(typeof resetTouch==='function')resetTouch();"
                + "if(typeof state!=='undefined'&&state==='playing')togglePause();"
                + "if(typeof saveRun==='function')saveRun();", null);
        new AlertDialog.Builder(this).setTitle("Leave Emberkeep?")
                .setMessage("The game attempts to save locally when paused. Check the game for any save warning before leaving.")
                .setNegativeButton("Stay", (dialog, which) -> dialog.dismiss())
                .setPositiveButton("Leave", (dialog, which) -> finish()).show();
    }

    @Override
    protected void onDestroy() {
        activityPaused = false;
        game.destroy();
        super.onDestroy();
    }
}
