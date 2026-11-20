// Writes ../grouping.js for figure #cssfloor: every shared group of the real app's product page
// and where it ends up in webpack's build and in Rolldown's builds.
//   node grouping-data.mjs
// Reads the builds from disk (paths below); prints the counts per outcome.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const HOME = homedir();
const WEBPACK = join(HOME, "Development/digitec/isomorph-webpack/applications/shop/_next");
const WEBPACK_BOTH_OFF = join(HOME, "Development/digitec/isomorph-cssfloor/.css-floor/both/shop/_next");
const WEBPACK_MIN_SIZE_ONLY = join(HOME, "Development/digitec/isomorph-cssfloor/.css-floor/req300/shop/_next");
const VINEXT = {
  pr4726: join(HOME, "Development/digitec/isomorph-vinext-pr/applications/shop/dist/client"),
  v145: join(HOME, "Development/digitec/isomorph-vinext/applications/shop/dist/client"),
};
const PAGE = "/product/[titleAndProductId]";

// The build manifest lists each chunk's files as [stylesheet, script]; a chunk can hold only CSS.
function pageChunks(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "build-manifest.json"), "utf8"));
  const chunks = new Map();
  for (const list of [manifest.pages["/_app"], manifest.pages[PAGE]]) {
    for (let index = 0; index < list.length; index++) {
      const file = list[index];
      const chunk = { js: null, css: null };
      if (file.endsWith(".css")) {
        chunk.css = file;
        if (list[index + 1]?.endsWith(".js")) chunk.js = list[++index];
      } else chunk.js = file;
      chunks.set(chunk.js ?? chunk.css, chunk);
    }
  }
  return { chunks: [...chunks.values()], extra: [...manifest.polyfillFiles, ...manifest.lowPriorityFiles] };
}

// Module id -> byte length of its function, from `(self.webpackChunk_N_E=…).push([[ids],{id:fn}])`.
function chunkModules(file) {
  const pushed = [];
  const self = { webpackChunk_N_E: { push: (entry) => pushed.push(entry) } };
  try {
    vm.runInNewContext(readFileSync(file, "utf8"), { self, globalThis: self, window: self }, { timeout: 2000 });
  } catch {}
  const modules = new Map();
  for (const [, table] of pushed) for (const [id, fn] of Object.entries(table ?? {})) modules.set(id, String(fn).length);
  return modules;
}

function cssSources(dir, file) {
  const map = JSON.parse(readFileSync(join(dir, "static/sourcemaps", `${file}.map`), "utf8"));
  return map.sources.filter((source) => !source.endsWith(".css") && !source.includes("<no source>"));
}

const size = (dir, file) => (file ? statSync(join(dir, file)).size : 0);
const isEntry = (chunk) => /chunks\/(webpack|framework|main)-|chunks\/pages\//.test(chunk.js ?? "");

// Where each group of the both-off build ends up in another build: in a shared chunk of its own,
// merged into a shared chunk that another group owns, or copied into the page's own files.
function landInto(dir, off, tokens) {
  const ref = pageChunks(dir);
  const moduleHome = new Map();
  const cssHome = new Map();
  for (const chunk of ref.chunks) {
    if (chunk.js) for (const id of chunkModules(join(dir, chunk.js)).keys()) if (!moduleHome.has(id) || isEntry(moduleHome.get(id))) moduleHome.set(id, chunk);
    if (chunk.css) for (const source of cssSources(dir, chunk.css)) cssHome.set(source, chunk);
  }
  const targets = tokens.map((token) => {
    const landing = new Map();
    const add = (target, bytes) => target && landing.set(target, (landing.get(target) ?? 0) + bytes);
    for (const [id, bytes] of token.modules) add(moduleHome.get(id), bytes);
    for (const source of token.cssSources) add(cssHome.get(source), token.cssBytes / token.cssSources.length);
    return [...landing].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  });
  // A shared chunk keeps the largest group that matches its file types as its own.
  const shared = ref.chunks.filter((chunk) => !isEntry(chunk));
  const owner = new Map();
  for (const chunk of shared) {
    const candidates = tokens.filter((token, index) => targets[index] === chunk).sort((a, b) => b.bytes - a.bytes);
    const pick = candidates.find((token) => token.css === Boolean(chunk.css) && token.js === Boolean(chunk.js)) ?? candidates[0];
    if (pick) owner.set(pick, chunk);
  }
  return {
    ref,
    unowned: shared.filter((chunk) => ![...owner.values()].includes(chunk)),
    outcomes: tokens.map((token, index) => {
      const chunk = owner.get(token);
      if (chunk) return { outcome: "own", js: Boolean(chunk.js), css: Boolean(chunk.css) };
      return { outcome: shared.includes(targets[index]) ? "merged" : "copied" };
    }),
  };
}

function webpack() {
  const off = pageChunks(WEBPACK_BOTH_OFF);
  const tokens = off.chunks.filter((chunk) => !isEntry(chunk)).map((chunk) => {
    const sources = chunk.css ? cssSources(WEBPACK_BOTH_OFF, chunk.css) : [];
    return {
      js: Boolean(chunk.js),
      css: Boolean(chunk.css),
      bytes: size(WEBPACK_BOTH_OFF, chunk.js) + size(WEBPACK_BOTH_OFF, chunk.css),
      modules: chunk.js ? chunkModules(join(WEBPACK_BOTH_OFF, chunk.js)) : new Map(),
      cssSources: sources,
      cssBytes: size(WEBPACK_BOTH_OFF, chunk.css),
    };
  });
  const normal = landInto(WEBPACK, off, tokens);
  const minSizeOnly = landInto(WEBPACK_MIN_SIZE_ONLY, off, tokens);

  const files = (chunks, extra) => ({ js: chunks.filter((chunk) => chunk.js).length + extra.length, css: chunks.filter((chunk) => chunk.css).length });
  // Start files: the entry chunks, plus shared chunks of the normal build whose code the both-off build keeps in the page's own file.
  const start = files([...normal.ref.chunks.filter(isEntry), ...normal.unowned], normal.ref.extra);
  return {
    html: files(normal.ref.chunks, normal.ref.extra),
    start,
    startFromPage: normal.unowned.length,
    bothOff: files(off.chunks, off.extra),
    tokens: tokens.map((token, index) => {
      const end = normal.outcomes[index];
      // Path through the tree: too small (20 KB rule alone leaves it without a file), else capped, else own file.
      const path = end.outcome === "own" ? "own" : minSizeOnly.outcomes[index].outcome === "own" ? "cap" : "small";
      return { kb: Math.round(token.bytes / 100) / 10, css: token.css, path, end: end.outcome, addJs: Boolean(end.js), addCss: Boolean(end.css) };
    }),
  };
}

function rolldown(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, ".vite/manifest.json"), "utf8"));
  const keys = Object.keys(manifest);
  const entries = [
    keys.find((key) => manifest[key].isEntry),
    keys.find((key) => key.startsWith("pages/_app")),
    keys.find((key) => /^pages\/product\/\[titleAndProductId\]\/index/.test(key)),
  ];
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    stack.push(...(manifest[key].imports ?? []));
  }
  const css = new Set();
  for (const key of seen) for (const file of manifest[key].css ?? []) css.add(file);
  const tokens = [...seen].filter((key) => !entries.includes(key)).map((key) => ({
    kb: Math.round(statSync(join(dir, manifest[key].file)).size / 100) / 10,
    css: (manifest[key].css ?? []).length,
  }));
  const seedCss = entries.reduce((sum, key) => sum + (manifest[key].css ?? []).length, 0);
  const tokenCss = tokens.reduce((sum, token) => sum + token.css, 0);
  return {
    html: { js: seen.size, css: css.size },
    start: { js: entries.length, css: seedCss },
    cssCopies: seedCss + tokenCss - css.size,
    tokens: tokens.map((token) => ({ kb: token.kb, css: token.css > 0 })),
  };
}

const data = { webpack: webpack(), pr4726: rolldown(VINEXT.pr4726), v145: rolldown(VINEXT.v145) };
writeFileSync(new URL("../grouping.js", import.meta.url), `window.GROUPING = ${JSON.stringify(data)};\n`);

const count = (tokens, test) => tokens.filter(test).length;
const wp = data.webpack;
console.log(`webpack HTML ${wp.html.js} JS / ${wp.html.css} CSS, start ${wp.start.js} / ${wp.start.css} (${wp.startFromPage} split from the page file), both rules off ${wp.bothOff.js} / ${wp.bothOff.css}, groups ${wp.tokens.length}`);
for (const path of ["small", "cap", "own"]) for (const end of ["copied", "merged", "own"]) {
  const tokens = wp.tokens.filter((token) => token.path === path && token.end === end);
  if (tokens.length) console.log(`  ${path} -> ${end}: ${tokens.length} groups, ${count(tokens, (token) => token.css)} with CSS, ${count(tokens, (token) => token.kb >= 20)} ≥ 20 KB${end === "own" ? `, adds ${count(tokens, (token) => token.addJs)} scripts, ${count(tokens, (token) => token.addCss)} stylesheets` : ""}`);
}
for (const build of ["pr4726", "v145"]) {
  const item = data[build];
  console.log(`${build} HTML ${item.html.js} JS / ${item.html.css} CSS, start ${item.start.js} / ${item.start.css}, groups ${item.tokens.length}, with CSS ${count(item.tokens, (token) => token.css)}, CSS files listed twice ${item.cssCopies}`);
}
