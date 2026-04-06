/**
 * GitHub-backed High Scores — shared module for all games.
 *
 * Reads scores from GitHub Pages (public, no auth).
 * Writes scores via GitHub Contents API (requires a PAT).
 *
 * Setup: visit any game page with ?ghpat=YOUR_TOKEN to store the PAT.
 * Create a fine-grained PAT at https://github.com/settings/tokens
 *   → Repository access: matziq/games only
 *   → Permissions: Contents: Read and write
 *
 * Usage in games:
 *   await GHScores.load('domino_combo', 'dcHighScoresList');
 *     → fetches remote scores, merges into localStorage, returns merged data
 *   await GHScores.save('domino_combo', 'dcHighScoresList');
 *     → pushes current localStorage data to GitHub
 */
(() => {
    'use strict';

    const OWNER = 'matziq';
    const REPO = 'games';
    const BRANCH = 'main';
    const PAT_KEY = 'gh_scores_pat';
    const API = 'https://api.github.com';

    // ── PAT management ──────────────────────────────────────────
    // Check URL for ?ghpat=TOKEN on every page load
    const params = new URLSearchParams(window.location.search);
    const urlPat = params.get('ghpat');
    if (urlPat) {
        localStorage.setItem(PAT_KEY, urlPat);
        // Clean the URL so the token isn't visible
        const clean = new URL(window.location);
        clean.searchParams.delete('ghpat');
        window.history.replaceState({}, '', clean);
    }

    function getPat() { return localStorage.getItem(PAT_KEY) || ''; }

    // ── Helpers ─────────────────────────────────────────────────
    function filePath(gameId) { return `scores/${gameId}.json`; }

    function pagesUrl(gameId) {
        return `https://${OWNER}.github.io/${REPO}/scores/${gameId}.json`;
    }

    function apiUrl(gameId) {
        return `${API}/repos/${OWNER}/${REPO}/contents/${filePath(gameId)}`;
    }

    /** Merge two score datasets (both can be arrays or config-keyed objects).
     *  Deduplicates by score+name+date, keeps top entries sorted desc. */
    function mergeData(local, remote, max) {
        if (!remote) return local;
        if (!local) return remote;

        // If both are objects (config-keyed), merge per key
        if (!Array.isArray(local) && !Array.isArray(remote)) {
            const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
            const merged = {};
            for (const k of keys) {
                merged[k] = mergeArrays(local[k] || [], remote[k] || [], max);
            }
            return merged;
        }

        // Both are arrays
        if (Array.isArray(local) && Array.isArray(remote)) {
            return mergeArrays(local, remote, max);
        }

        // Type mismatch — prefer local
        return local;
    }

    function mergeArrays(a, b, max) {
        const seen = new Set();
        const all = [];

        for (const entry of [...a, ...b]) {
            const key = `${entry.score}|${entry.name || ''}|${entry.date || ''}`;
            if (!seen.has(key)) {
                seen.add(key);
                all.push(entry);
            }
        }

        all.sort((x, y) => (y.score || 0) - (x.score || 0));
        if (max) all.length = Math.min(all.length, max);
        return all;
    }

    // ── Load: fetch from GitHub Pages, merge into localStorage ──
    async function load(gameId, localStorageKey, max) {
        max = max || 5;
        let local;
        try { local = JSON.parse(localStorage.getItem(localStorageKey)) || null; }
        catch { local = null; }

        let remote = null;
        try {
            const url = pagesUrl(gameId) + '?_=' + Date.now(); // cache-bust
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                remote = await res.json();
            }
        } catch { /* offline or 404 — use local only */ }

        if (remote) {
            const merged = mergeData(local, remote, max);
            localStorage.setItem(localStorageKey, JSON.stringify(merged));
            return merged;
        }
        return local;
    }

    // ── Save: push localStorage data to GitHub via API ──────────
    async function save(gameId, localStorageKey) {
        const pat = getPat();
        if (!pat) return; // no token — silently skip

        let data;
        try { data = JSON.parse(localStorage.getItem(localStorageKey)); }
        catch { return; }
        if (!data) return;

        const headers = {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
        };

        try {
            // 1. Get current file SHA (needed for update)
            let sha = null;
            let existingData = null;
            const getRes = await fetch(apiUrl(gameId) + `?ref=${BRANCH}`, { headers });
            if (getRes.ok) {
                const info = await getRes.json();
                sha = info.sha;
                // Decode existing content and merge with our data
                try {
                    existingData = JSON.parse(atob(info.content.replace(/\n/g, '')));
                } catch { existingData = null; }
            }

            // 2. Merge local + existing remote (in case another device wrote since load)
            const merged = existingData ? mergeData(data, existingData, 5) : data;
            // Also update localStorage with the merged result
            localStorage.setItem(localStorageKey, JSON.stringify(merged));

            // 3. Write merged data back
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(merged, null, 2))));
            const body = {
                message: `Update ${gameId} scores`,
                content,
                branch: BRANCH,
            };
            if (sha) body.sha = sha;

            const putRes = await fetch(apiUrl(gameId), {
                method: 'PUT',
                headers,
                body: JSON.stringify(body),
            });

            if (putRes.status === 409) {
                // Conflict — retry once
                const retry = await fetch(apiUrl(gameId) + `?ref=${BRANCH}`, { headers });
                if (retry.ok) {
                    const info = await retry.json();
                    body.sha = info.sha;
                    try {
                        const retryData = JSON.parse(atob(info.content.replace(/\n/g, '')));
                        const reMerged = mergeData(data, retryData, 5);
                        body.content = btoa(unescape(encodeURIComponent(JSON.stringify(reMerged, null, 2))));
                        localStorage.setItem(localStorageKey, JSON.stringify(reMerged));
                    } catch { /* use our data */ }
                    await fetch(apiUrl(gameId), {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(body),
                    });
                }
            }
        } catch { /* network error — scores saved locally, will sync next time */ }
    }

    // ── Public API ──────────────────────────────────────────────
    window.GHScores = { load, save, getPat };
})();
