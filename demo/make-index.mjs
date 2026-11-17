// Writes demo/index.html from result.json: the shared source, the two entry setups, and every
// output file of every build with its modules, so GitHub Pages shows the real build results.
//   node make-index.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const result = JSON.parse(readFileSync(join(here, "result.json"), "utf8"));
const REPO = "https://github.com/jantimon/demo-chunking-vinext-vs-webpack/blob/main/demo";
const BUILDS = [
  ["webpack", "webpack", "webpack 5 with Next.js 16.4's client splitChunks settings. Entries: main.js, pages/_app (dependOn main), each page (dependOn pages/_app)."],
  ["rolldown", "rolldown", "Vite 8 / Rolldown as vinext 1.4 sets it up for the Pages Router: one client entry that loads _app and every page with import(); React in a framework group."],
  ["routeGroups", "route-groups", "Rolldown plus vinext's App Router grouping ported to pages: modules that the same set of pages load at start share one chunk. Page files and _app keep their own chunk."],
  ["chunkGroups", "chunk-groups", "Rolldown plus codeSplitting groups: framework, and app code grouped by the set of entries that use it (entriesAware, 20 KB merge threshold, 300 KB max)."],
  ["inlineCommon", "inline-common", "Rolldown plus experimentalInlineCommonChunks: { maxSize: 20000 }: small common chunks are copied into the chunks that use them, like webpack's minSize."],
];
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const kb = (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

const sourceFiles = readdirSync(join(here, "src"), { recursive: true })
  .map(String)
  .filter((file) => statSync(join(here, "src", file)).isFile())
  .sort();
const sourceRows = sourceFiles
  .map((file) => `<tr><td><a href="src/${file}">${esc(file)}</a></td><td>${kb(statSync(join(here, "src", file)).size)}</td><td>${file === "main.js" ? "webpack only: the runtime entry" : file === "client-entry.js" ? "Rolldown only: the vinext-style client entry" : "both"}</td></tr>`)
  .join("");

const buildSections = BUILDS.map(([key, dir, about]) => {
  const { files, pages } = result[key];
  const rows = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, file]) => `<tr><td><a href="out/${dir}/${name}">${esc(name)}</a></td><td>${file.kind}</td><td>${kb(file.raw)}</td><td>${kb(file.gzip)}</td><td>${file.modules.map((mod) => `<code>${mod}</code>`).join(" ") || "<span class=\"faint\">runtime</span>"}</td></tr>`)
    .join("");
  const pageRows = Object.entries(pages)
    .map(([page, item]) => `<tr><td>${page}</td><td>${item.start.length}</td><td>${item.start.map((name) => `<a href="out/${dir}/${name}">${esc(name.replace(/^.*\//, ""))}</a>`).join(", ")}${item.pageInManifest === false ? ' <span class="warn">page missing from the manifest</span>' : ""}</td></tr>`)
    .join("");
  return `<section class="d-build" id="${key}">
  <h2>${key}</h2>
  <p>${esc(about)}</p>
  <h3>What each page loads at start</h3>
  <div class="d-table"><table><tr><th>Page</th><th>Files</th><th>Which</th></tr>${pageRows}</table></div>
  <h3>Every output file</h3>
  <div class="d-table"><table><tr><th>File</th><th>Kind</th><th>Size</th><th>gzip</th><th>Modules inside</th></tr>${rows}</table></div>
</section>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Demo: the toy shop, built five ways</title>
<meta name="description" content="The same source built with webpack (Next.js settings) and Vite/Rolldown (vinext setup), with every output file and the modules inside it.">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css">
<style>
.d-main { grid-column: wide; padding: 48px 0 80px; }
.d-main h1 { font-size: clamp(36px, 6vw, 64px); }
.d-main p { max-width: 46em; }
.d-table { overflow-x: auto; margin: 10px 0 24px; border: 1px solid var(--line); border-radius: 12px; }
.d-table table { border-collapse: collapse; width: 100%; font: 13px/1.45 var(--mono); }
.d-table th, .d-table td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.d-table th { color: var(--muted); font-weight: 500; }
.d-table code { font-size: 12px; }
.d-build { border-top: 1px solid var(--line); padding-top: 28px; margin-top: 28px; display: block; background: none; }
.d-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.d-two pre { margin: 0; padding: 14px; border-radius: 12px; background: var(--bg2); border: 1px solid var(--line); overflow-x: auto; font-size: 12.5px; line-height: 1.5; }
.faint { color: var(--faint); } .warn { color: var(--s-pc); }
@media (max-width: 760px) { .d-two { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main class="wrap"><div class="d-main">
<p class="kicker"><a href="../">← Back to the article</a></p>
<h1>The toy shop, built five ways</h1>
<p>Every build compiles <strong>the same source files</strong>. Only the entry and the bundler settings differ, and each mirrors its framework: Next.js makes every page a webpack entry that depends on <code>_app</code>; vinext gives Rolldown one client entry that loads <code>_app</code> and each page with <code>import()</code>. The toy has no UI: each module is a lookup table of a fixed size, so the outputs show where code goes, nothing else.</p>

<h2>The two entries</h2>
<div class="d-two">
<pre>// webpack, as Next.js 16.4 sets it up
entry: {
  main: "src/main.js",
  "pages/_app": { import: "src/pages/_app.js", dependOn: "main" },
  "pages/home": { import: "src/pages/home.js", dependOn: "pages/_app" },
  "pages/product": { … dependOn: "pages/_app" },
  "pages/cart": { … dependOn: "pages/_app" },
}
splitChunks: { framework, lib (&gt; 160 KB), minSize: 20000, maxInitialRequests: 25 }</pre>
<pre>// Rolldown, as vinext 1.4 sets it up (src/client-entry.js)
const pageLoaders = {
  "/": () =&gt; import("./pages/home.js"),
  "/product": () =&gt; import("./pages/product.js"),
  "/cart": () =&gt; import("./pages/cart.js"),
};
const appLoader = () =&gt; import("./pages/_app.js");
codeSplitting: { groups: [framework] }   // no size floor</pre>
</div>
<p>Full settings: <a href="${REPO}/build.mjs">build.mjs</a>. The source is generated by <a href="${REPO}/make-app.mjs">make-app.mjs</a>.</p>

<h2>The source</h2>
<div class="d-table"><table><tr><th>File</th><th>Size</th><th>Used by</th></tr>${sourceRows}</table></div>

${buildSections}
</div></main>
</body>
</html>
`;
writeFileSync(join(here, "index.html"), html);
console.log(`demo/index.html: ${sourceFiles.length} source files, ${BUILDS.length} builds`);
