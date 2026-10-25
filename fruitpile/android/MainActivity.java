package com.matziq.fruitpile;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.DisplayCutout;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;

public final class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(11, 19, 36);
    private static final String BACK_SCRIPT =
        "(function(){try{return !!(window.fruitpileBack&&window.fruitpileBack());}catch(e){return false;}})()";
    private WebView game;
    private volatile Vibrator vibrator;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        Window window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(BACKGROUND));
        if (Build.VERSION.SDK_INT < 35) {
            window.setStatusBarColor(BACKGROUND);
            window.setNavigationBarColor(BACKGROUND);
        }
        if (Build.VERSION.SDK_INT >= 29) window.setNavigationBarContrastEnforced(false);
        if (Build.VERSION.SDK_INT >= 28) {
            // Let the dark background run under the notch in landscape; the root view below keeps the controls clear of it.
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attributes);
        }
        vibrator = findVibrator();
        game = new WebView(this);
        game.setBackgroundColor(BACKGROUND);
        game.setOverScrollMode(View.OVER_SCROLL_NEVER);
        game.setVerticalScrollBarEnabled(false);
        game.setHorizontalScrollBarEnabled(false);
        game.setHapticFeedbackEnabled(false);
        game.setLongClickable(false);
        game.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View view) {
                return true;
            }
        });
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        // The game draws its own fixed layout, so pinch zoom and the system font scale would only break it.
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= 29 && Build.VERSION.SDK_INT < 33) settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        game.addJavascriptInterface(new NativeBridge(), "FruitPileNative");
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
        root.setBackgroundColor(BACKGROUND);
        root.addView(game, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                int left;
                int top;
                int right;
                int bottom;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                    left = safe.left;
                    top = safe.top;
                    right = safe.right;
                    bottom = safe.bottom;
                } else {
                    left = insets.getSystemWindowInsetLeft();
                    top = insets.getSystemWindowInsetTop();
                    right = insets.getSystemWindowInsetRight();
                    bottom = insets.getSystemWindowInsetBottom();
                    DisplayCutout cutout = Build.VERSION.SDK_INT >= 28 ? insets.getDisplayCutout() : null;
                    if (cutout != null) {
                        left = Math.max(left, cutout.getSafeInsetLeft());
                        top = Math.max(top, cutout.getSafeInsetTop());
                        right = Math.max(right, cutout.getSafeInsetRight());
                        bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                    }
                }
                view.setPadding(left, top, right, bottom);
                return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
            }
        });
        enterImmersiveMode();
        game.loadUrl("file:///android_asset/index.html");
    }

    // Full-screen sticky immersive mode: system bars stay hidden and only appear briefly after an edge swipe.
    private void enterImmersiveMode() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.systemBars());
            }
        } else {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    private Vibrator findVibrator() {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                VibratorManager manager = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                return manager == null ? null : manager.getDefaultVibrator();
            }
            return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        } catch (RuntimeException error) {
            return null;
        }
    }

    // timings alternate delay, vibrate, delay, vibrate... in milliseconds.
    private void buzz(long[] timings) {
        Vibrator device = vibrator;
        if (device == null || timings == null || timings.length < 2 || !device.hasVibrator()) return;
        try {
            if (Build.VERSION.SDK_INT >= 26) device.vibrate(VibrationEffect.createWaveform(timings, -1));
            else device.vibrate(timings, -1);
        } catch (RuntimeException ignored) {
            // Haptics are optional; never let them interrupt the game.
        }
    }

    // Methods run on a WebView background thread. Only the bundled offline page can load, so the bridge is local-only.
    public final class NativeBridge {
        @JavascriptInterface
        public boolean canVibrate() {
            Vibrator device = vibrator;
            return device != null && device.hasVibrator();
        }

        @JavascriptInterface
        public void vibrate(int milliseconds) {
            buzz(new long[] {0, Math.max(1, Math.min(200, milliseconds))});
        }

        // "on,off,on,..." in milliseconds, like the web Vibration API.
        @JavascriptInterface
        public void vibratePattern(String csv) {
            if (csv == null) return;
            String[] parts = csv.split(",");
            int count = Math.min(parts.length, 8);
            long[] timings = new long[count + 1];
            boolean any = false;
            try {
                for (int i = 0; i < count; i++) {
                    long value = Math.max(0, Math.min(400, Long.parseLong(parts[i].trim())));
                    timings[i + 1] = value;
                    if (i % 2 == 0 && value > 0) any = true;
                }
            } catch (NumberFormatException error) {
                return;
            }
            if (any) buzz(timings);
        }

        // The page asks for the screen to stay on only while a run is actively being played.
        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        } else if (game != null) {
            // Notification shade, system dialogs and split-screen focus changes pause an active run.
            game.evaluateJavascript("window.dispatchEvent(new Event('blur'))", null);
        }
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

    // The page closes panels, pauses or resumes first; Back only leaves the app from the start menu.
    @Override
    public void onBackPressed() {
        game.evaluateJavascript(BACK_SCRIPT, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        game.destroy();
        super.onDestroy();
    }
}
