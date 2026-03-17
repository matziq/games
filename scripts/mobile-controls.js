/**
 * Mobile Controls — shared utility for all games.
 * Provides a fullscreen toggle button.
 *
 * Include via <script src="../scripts/mobile-controls.js"></script> at the end
 * of any game HTML.  Works on desktop too.
 *
 * The control is a floating button at the bottom-right corner.
 */
(() => {
    'use strict';

    /* ------------------------------------------------------------------ */
    /*  Styles                                                             */
    /* ------------------------------------------------------------------ */
    const css = document.createElement('style');
    css.textContent = `
    /* ===== Mobile Controls ===== */
    #mc-toolbar {
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 99999;
      display: flex;
      padding: 0;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    }
    #mc-fs-btn {
      all: unset;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 14px;
      font-size: 28px;
      font-weight: 700;
      color: rgba(255,255,255,0.9);
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.15);
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      transition: background 0.15s, transform 0.1s;
    }
    #mc-fs-btn:active {
      transform: scale(0.92);
      background: rgba(255,255,255,0.18);
    }
    /* Fullscreen icon swap */
    #mc-fs-btn .mc-exit { display: none; }
    :fullscreen #mc-fs-btn .mc-enter,
    :-webkit-full-screen #mc-fs-btn .mc-enter { display: none; }
    :fullscreen #mc-fs-btn .mc-exit,
    :-webkit-full-screen #mc-fs-btn .mc-exit { display: inline; }

    @media (max-width: 480px) {
      #mc-fs-btn { width: 62px; height: 62px; font-size: 32px; }
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
    <button id="mc-fs-btn" title="Toggle fullscreen" aria-label="Toggle fullscreen">
      <span class="mc-enter">⛶</span>
      <span class="mc-exit">✕</span>
    </button>
  `;

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
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        }
        document.removeEventListener('pointerdown', tryAutoFullscreen);
        document.removeEventListener('keydown', tryAutoFullscreen);
    }
    document.addEventListener('pointerdown', tryAutoFullscreen, { once: true });
    document.addEventListener('keydown', tryAutoFullscreen, { once: true });

    /* ------------------------------------------------------------------ */
    /*  Wire everything up once DOM ready                                  */
    /* ------------------------------------------------------------------ */
    function init() {
        document.body.appendChild(bar);
        document.getElementById('mc-fs-btn').addEventListener('click', toggleFullscreen);
        document.getElementById('mc-fs-btn').addEventListener('touchend', (e) => {
            e.preventDefault();
            toggleFullscreen();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
