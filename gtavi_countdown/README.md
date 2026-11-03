# GTA VI Countdown

A standalone countdown page with a live GTA VI news panel. The page has no build step, package dependencies, or local server requirement; open `index.html` in a modern browser or serve this folder with any static HTTP server.

## Behavior

- The countdown updates every second to November 19, 2026 at midnight Eastern Time.
- The progress bar measures elapsed time from the December 4, 2023 announcement timestamp to the release timestamp. If the release time has passed, the countdown stops at zero and the progress reaches 100%.
- News is loaded on page start and refreshed every 15 minutes. The page tries Rockstar's Newswire feed first and uses a Google News RSS mirror through rss2json if the official feed fails. If both are unavailable, the static article already in the HTML remains visible and the status reports that the feed is unavailable.
- News descriptions, typography, and fonts can require an internet connection. The article links open Rockstar pages in a new tab.

Keep the release timestamp, release copy, progress-bar date labels, and this README in sync if the release date changes.
