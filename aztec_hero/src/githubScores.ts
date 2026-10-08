const OWNER = 'matziq';
const REPO = 'games';
const BRANCH = 'main';
const PAT_KEY = 'gh_scores_pat';

type Score = { score: number; name?: string; date?: string; escaped?: boolean };

function mergeScores(local: Score[], remote: Score[], max: number): Score[] {
  const seen = new Set<string>();
  return [...local, ...remote]
    .filter((entry) => {
      const key = `${entry.score}|${entry.name ?? ''}|${entry.date ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

const urlPat = new URLSearchParams(location.search).get('ghpat');
if (urlPat) {
  localStorage.setItem(PAT_KEY, urlPat);
  const clean = new URL(location.href);
  clean.searchParams.delete('ghpat');
  history.replaceState({}, '', clean);
}

async function load(gameId: string, storageKey: string, max = 5): Promise<void> {
  const local = JSON.parse(localStorage.getItem(storageKey) || '[]') as Score[];
  const response = await fetch(`https://${OWNER}.github.io/${REPO}/scores/${gameId}.json?ts=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return;
  const remote = await response.json() as Score[];
  localStorage.setItem(storageKey, JSON.stringify(mergeScores(local, remote, max)));
}

async function save(gameId: string, storageKey: string): Promise<void> {
  const token = localStorage.getItem(PAT_KEY);
  if (!token) return;
  const data = JSON.parse(localStorage.getItem(storageKey) || '[]') as Score[];
  const path = `scores/${gameId}.json`;
  const endpoint = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const current = await fetch(`${endpoint}?ref=${BRANCH}`, { headers });
  const currentFile = current.ok ? await current.json() as { sha: string; content: string } : null;
  const remote = currentFile ? JSON.parse(atob(currentFile.content.replace(/\n/g, ''))) as Score[] : [];
  const merged = mergeScores(data, remote, 5);
  localStorage.setItem(storageKey, JSON.stringify(merged));
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(merged, null, 2))));
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Update ${gameId} scores`,
      content,
      branch: BRANCH,
      ...(currentFile ? { sha: currentFile.sha } : {})
    })
  });
  if (!response.ok) throw new Error(`Score sync failed with HTTP ${response.status}`);
}

window.GHScores = { load, save };
