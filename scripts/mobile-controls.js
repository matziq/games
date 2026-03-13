/**
 * Mobile Controls — shared utility for all games.
 * Provides:
 *   1. Zoom in / out buttons (CSS transform)
 *   2. Fullscreen toggle button
 *
 * Include via <script src="../scripts/mobile-controls.js"></script> at the end
 * of any game HTML.  Works on desktop too (buttons simply shown for convenience).
 *
 * The controls attach to a small floating toolbar at the bottom-right corner.
 */
(() => {
    'use strict';

    /* ------------------------------------------------------------------ */
    /*  Configuration                                                      */
    /* ------------------------------------------------------------------ */
    const ZOOM_STEP = 0.15;     // each tap changes scale by ±15 %
    const ZOOM_MIN = 0.4;
    const ZOOM_MAX = 3.0;
    const ZOOM_KEY = '__mobileZoom';

    /* ------------------------------------------------------------------ */
    /*  State                                                              */
    /* ------------------------------------------------------------------ */
    let currentZoom = 1.0;

    /* ------------------------------------------------------------------ */
    /*  Styles                                                             */
    /* ------------------------------------------------------------------ */
    const css = document.createElement('style');
    css.textContent = `
    /* ===== Mobile Controls Toolbar ===== */
    #mc-toolbar {
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 99999;
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 4px;
      border-radius: 14px;
      background: rgba(0,0,0,0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 6px 20px rgba(0,0,0,0.4);
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }
    #mc-toolbar button {
      all: unset;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      font-size: 18px;
      font-weight: 700;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.1);
      transition: background 0.15s, transform 0.1s;
    }
    #mc-toolbar button:active {
      transform: scale(0.92);
      background: rgba(255,255,255,0.18);
    }
    #mc-toolbar .mc-zoom-label {
      font-size: 11px;
      color: rgba(255,255,255,0.65);
      min-width: 38px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
    }
    #mc-toolbar .mc-sep {
      width: 1px;
      height: 22px;
      background: rgba(255,255,255,0.15);
      margin: 0 2px;
    }
    /* Fullscreen icon swap */
    #mc-fs-btn .mc-exit { display: none; }
    :fullscreen #mc-fs-btn .mc-enter,
    :-webkit-full-screen #mc-fs-btn .mc-enter { display: none; }
    :fullscreen #mc-fs-btn .mc-exit,
    :-webkit-full-screen #mc-fs-btn .mc-exit { display: inline; }

    /* On very small screens make buttons slightly larger for fat fingers */
    @media (max-width: 480px) {
      #mc-toolbar button { width: 44px; height: 44px; font-size: 20px; }
      #mc-toolbar { bottom: 10px; right: 10px; }
    }
  `;
    document.head.appendChild(css);

    /* ------------------------------------------------------------------ */
    /*  Build toolbar                                                      */
    /* ------------------------------------------------------------------ */
    const bar = document.createElement('div');
    bar.id = 'mc-toolbar';
    bar.innerHTML = `
    <button id="mc-zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
    <span class="mc-zoom-label" id="mc-zoom-label">100%</span>
    <button id="mc-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
    <span class="mc-sep"></span>
    <button id="mc-zoom-reset" title="Reset zoom" aria-label="Reset zoom" style="font-size:13px;">↺</button>
    <span class="mc-sep"></span>
    <button id="mc-fs-btn" title="Toggle fullscreen" aria-label="Toggle fullscreen">
      <span class="mc-enter">⛶</span>
      <span class="mc-exit">✕</span>
    </button>
  `;

    /* ------------------------------------------------------------------ */
    /*  Zoom logic                                                         */
    /* ------------------------------------------------------------------ */
    /** Determine the element that should be scaled.
     *  Heuristic: first <canvas>, or #app, or #game, or body's first child. */
    function getZoomTarget() {
        return document.querySelector('canvas')
            || document.getElementById('app')
            || document.getElementById('game')
            || document.body.children[0];
    }

    function applyZoom(z) {
        currentZoom = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 100) / 100;

        const target = getZoomTarget();
        if (!target) return;

        if (currentZoom === 1) {
            target.style.transform = target.dataset.mcOrigTransform || '';
        } else {
            // Preserve any existing transform (e.g. geodes scale) and append our zoom
            const orig = target.dataset.mcOrigTransform || '';
            target.style.transform = orig ? `${orig} scale(${currentZoom})` : `scale(${currentZoom})`;
        }
        target.style.transformOrigin = 'center center';

        const label = document.getElementById('mc-zoom-label');
        if (label) label.textContent = `${Math.round(currentZoom * 100)}%`;
    }

    /* Save original transform so we can compose with it */
    function captureOriginalTransform() {
        const target = getZoomTarget();
        if (target && target.dataset.mcOrigTransform === undefined) {
            target.dataset.mcOrigTransform = target.style.transform || '';
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Pinch-to-zoom (two-finger gesture on the whole page)               */
    /* ------------------------------------------------------------------ */
    let pinchStartDist = 0;
    let pinchStartZoom = 1;

    function pinchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            pinchStartDist = pinchDist(e.touches);
            pinchStartZoom = currentZoom;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            const d = pinchDist(e.touches);
            const ratio = d / pinchStartDist;
            applyZoom(pinchStartZoom * ratio);
            e.preventDefault();
        }
    }, { passive: false });

    /* ------------------------------------------------------------------ */
    /*  Fullscreen logic                                                   */
    /* ------------------------------------------------------------------ */
    function toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen().catch(() => { });
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Auto-fullscreen on first user interaction                          */
    /* ------------------------------------------------------------------ */
    let autoFsTriggered = false;
    function tryAutoFullscreen() {
        if (autoFsTriggered) return;
        autoFsTriggered = true;
        // Only auto-fullscreen if not already in fullscreen
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        }
        // Remove listeners after first trigger
        document.removeEventListener('pointerdown', tryAutoFullscreen);
        document.removeEventListener('keydown', tryAutoFullscreen);
    }
    // Attach to first user gesture — pointerdown fires on any press (click, drag, tap)
    document.addEventListener('pointerdown', tryAutoFullscreen, { once: true });
    document.addEventListener('keydown', tryAutoFullscreen, { once: true });

    /* ------------------------------------------------------------------ */
    /*  Wire everything up once DOM ready                                  */
    /* ------------------------------------------------------------------ */
    function init() {
        document.body.appendChild(bar);
        captureOriginalTransform();

        document.getElementById('mc-zoom-in').addEventListener('click', () => applyZoom(currentZoom + ZOOM_STEP));
        document.getElementById('mc-zoom-out').addEventListener('click', () => applyZoom(currentZoom - ZOOM_STEP));
        document.getElementById('mc-zoom-reset').addEventListener('click', () => applyZoom(1));
        document.getElementById('mc-fs-btn').addEventListener('click', toggleFullscreen);

        // Touch-end duplicates for reliability on mobile
        ['mc-zoom-in', 'mc-zoom-out', 'mc-zoom-reset', 'mc-fs-btn'].forEach(id => {
            document.getElementById(id).addEventListener('touchend', (e) => {
                e.preventDefault();
                document.getElementById(id).click();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
