"use strict";
const fs = require("node:fs");
const path = require("node:path");
const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination) || path.extname(destination).toLowerCase() !== ".html") {
  console.error("Usage: node build-release.cjs <absolute-output.html>");
  process.exitCode = 1;
} else {
  let html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  for (const name of ["engine.js", "audio-samples.js", "audio.js", "game.js"]) {
    const source = fs.readFileSync(path.join(__dirname, name), "utf8").replace(/<\/script/gi, "<\\/script");
    html = html.replace(`<script src="./${name}"></script>`, () => `<script>\n${source}\n</script>`);
  }
  html = html.replace('href="../index.html"', 'href="https://memconfigmgr.org/games/"')
    .replace('href="./README.md"', 'href="https://github.com/matziq/games/blob/main/Aztec/README.md"');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, html);
  console.log(`Standalone release: ${destination}`);
}
