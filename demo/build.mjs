// Builds the toy shop with webpack (Next.js 16.4 splitChunks settings) and with Vite 8 / Rolldown
// (vinext's Pages Router setup), plus Rolldown variants, and writes result.json:
// every output file with its modules and size, and what each page loads at start.
//   node make-app.mjs && node build.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const here = dirname(new URL(import.meta.url).pathname);
const src = join(here, "src");
const out = join(here, "out");
// Folders with node_modules: WEBPACK_ROOT has next@16.4 (webpack 5, css-loader), VITE_ROOT has vite@8.3.
const { WEBPACK_ROOT, VITE_ROOT, ROLLDOWN_R1_BINDING } = process.env;
if (!WEBPACK_ROOT || !VITE_ROOT) {
  console.error("Set WEBPACK_ROOT (next 16.4 + webpack 5 + css-loader) and VITE_ROOT (vite 8.3) to folders with those packages installed.");
  process.exit(2);
}
const fromWebpack = createRequire(join(WEBPACK_ROOT, "package.json"));
const webpack = fromWebpack("webpack");
const MiniCssExtractPlugin = fromWebpack("next/dist/compiled/mini-css-extract-plugin");
const { build: viteBuild } = await import(createRequire(join(VITE_ROOT, "package.json")).resolve("vite"));

const PAGES = ["home", "product", "cart"];
const TOY_MODULES = ["react", "styled", "translate", "Header", "Button", "IconButton", "Price", "Rating", "Carousel", "Gallery", "useCart", "formatDate", "SizeTable", "LoginDialog", "ReviewsDialog", "SizeGuide", "_app", "home", "product", "cart"];
/** Which toy stylesheets a CSS file contains: each one styles a class named after its module. */
const cssModules = (file) => {
  const text = readFileSync(file, "utf8");
  return TOY_MODULES.filter((name) => new RegExp(`\\.${name}[\\s,{]`).test(text));
};
/** Which toy modules a JS file really contains: each module's lookup table has a unique first row id. */
const modulesInFile = (file) => {
  const text = readFileSync(file, "utf8");
  return TOY_MODULES.filter((name) => ['"', "'", "`"].some((quote) => text.includes(`${quote}${name}-0${quote}`)));
};
const gz = (file) => gzipSync(readFileSync(file)).length;
/** Extra copies of toy modules among a page's start files: a module in three files counts 2. */
const extraCopies = (files, start) => {
  const count = new Map();
  for (const file of start) if (files[file].kind === "js") for (const name of files[file].modules) count.set(name, (count.get(name) ?? 0) + 1);
  return [...count.values()].reduce((sum, value) => sum + value - 1, 0);
};
/** IconButton extends Button: its last rule must come after Button's last rule in the page's stylesheets, in link order. */
const iconButtonWins = (dir, stylesheets) => {
  const text = stylesheets.map((file) => readFileSync(join(dir, file), "utf8")).join("\n");
  const last = (name) => Math.max(-1, ...[...text.matchAll(new RegExp(`\\.${name}[\\s,{]`, "g"))].map((match) => match.index));
  return last("IconButton") === -1 ? null : last("Button") < last("IconButton");
};
const moduleName = (id) => {
  const rel = relative(src, id.replace(/^\0/, "").split("?")[0]);
  if (rel.startsWith("node_modules/react")) return "react";
  if (rel === "main.js" || rel === "client-entry.js") return rel.replace(".js", "");
  return rel.split("/").pop().replace(/\.(js|css)$/, "");
};
const trashDir = (dir) => {
  try {
    statSync(dir);
    execFileSync("trash", [dir]);
  } catch {}
};

/** webpack with Next.js 16.4's client splitChunks configuration (build/webpack-config.js). */
async function buildWebpack() {
  const dir = join(out, "webpack");
  trashDir(dir);
  const entry = { main: join(src, "main.js"), "pages/_app": { import: join(src, "pages/_app.js"), dependOn: "main" } };
  for (const page of PAGES) entry[`pages/${page}`] = { import: join(src, `pages/${page}.js`), dependOn: "pages/_app" };
  const reactDir = join(src, "node_modules/react");
  const stats = await new Promise((resolve, reject) =>
    webpack(
      {
        mode: "production",
        context: here,
        entry,
        output: { path: dir, filename: "[name]-[contenthash:6].js", chunkFilename: "[name]-[contenthash:6].js", clean: true },
        module: { rules: [{ test: /\.css$/, use: [MiniCssExtractPlugin.loader, fromWebpack.resolve("css-loader")] }] },
        plugins: [new MiniCssExtractPlugin({ filename: "[name]-[contenthash:6].css", chunkFilename: "[name]-[contenthash:6].css" })],
        optimization: {
          runtimeChunk: { name: "webpack" },
          splitChunks: {
            chunks: (chunk) => !/^(polyfills|main|pages\/_app)$/.test(chunk.name),
            cacheGroups: {
              framework: { chunks: "all", name: "framework", test: (module) => (module.nameForCondition?.() ?? "").startsWith(reactDir), priority: 40, enforce: true },
              lib: { test: (module) => !module.type?.startsWith("css") && module.size() > 160000 && /node_modules[/\\]/.test(module.nameForCondition?.() || ""), priority: 30, minChunks: 1, reuseExistingChunk: true },
            },
            maxInitialRequests: 25,
            minSize: 20000,
          },
        },
      },
      (error, result) => (error || result.hasErrors() ? reject(error ?? new Error(result.toString("errors-only"))) : resolve(result)),
    ),
  );
  const json = stats.toJson({ chunks: true, chunkModules: true, entrypoints: true, assets: true });
  const files = {};
  for (const chunk of json.chunks) {
    const modules = [...new Set((chunk.modules ?? []).flatMap((module) => (module.modules ?? [module]).map((inner) => inner.nameForCondition ?? inner.identifier)).filter((id) => id && id.includes(src)).map(moduleName))];
    for (const file of chunk.files) {
      const kind = file.endsWith(".css") ? "css" : "js";
      files[file] = { kind, chunk: chunk.names[0] ?? `async-${chunk.id}`, initial: chunk.initial, modules: kind === "css" ? cssModules(join(dir, file)) : modulesInFile(join(dir, file)), raw: statSync(join(dir, file)).size, gzip: gz(join(dir, file)) };
    }
  }
  const pages = {};
  for (const page of PAGES) {
    const startFiles = new Set();
    for (const entryName of ["main", "pages/_app", `pages/${page}`]) for (const asset of json.entrypoints[entryName].assets) startFiles.add(asset.name);
    const start = [...startFiles];
    const stylesheets = start.filter((file) => file.endsWith(".css"));
    pages[page] = { start, stylesheets, copies: extraCopies(files, start), cssOrderOk: iconButtonWins(dir, stylesheets), lazy: lazyFilesWebpack(json, page) };
  }
  return { files, pages };
}
const existsCss = (name) => {
  try {
    return readdirSync(src, { recursive: true }).some((file) => String(file).endsWith(`/${name}.css`) || String(file) === `${name}.css`);
  } catch {
    return false;
  }
};
function lazyFilesWebpack(json, page) {
  const pageChunk = json.chunks.find((chunk) => chunk.names.includes(`pages/${page}`));
  const lazy = {};
  for (const group of json.chunks.filter((chunk) => !chunk.initial && chunk.parents?.includes(pageChunk.id))) {
    const name = (group.modules ?? []).map((module) => moduleName(module.nameForCondition ?? module.identifier)).find((m) => /Dialog|Guide/.test(m)) ?? `async-${group.id}`;
    lazy[name] = [...(lazy[name] ?? []), ...group.files];
  }
  return lazy;
}

/** Vite 8 + Rolldown with vinext's Pages Router shape: one client entry, pages and _app as import(). */
async function buildVite(variant, codeSplitting, extraRolldown = {}, extraPlugins = [], stylesheetRank = null) {
  const dir = join(out, variant);
  trashDir(dir);
  let bundle;
  await viteBuild({
    configFile: false,
    root: here,
    logLevel: "warn",
    build: {
      outDir: dir,
      manifest: true,
      minify: true,
      modulePreload: { polyfill: false },
      rolldownOptions: {
        input: { index: join(src, "client-entry.js") },
        preserveEntrySignatures: false,
        output: { codeSplitting, entryFileNames: "[name]-[hash].js", chunkFileNames: "[name]-[hash].js", assetFileNames: "[name]-[hash][extname]" },
        ...extraRolldown,
      },
    },
    plugins: [...extraPlugins, { name: "toy:capture", writeBundle(_options, output) { bundle = output; } }],
  });
  const files = {};
  for (const [fileName, chunk] of Object.entries(bundle)) {
    if (chunk.type === "chunk") {
      files[fileName] = { kind: "js", chunk: chunk.name, initial: chunk.isEntry, modules: modulesInFile(join(dir, fileName)), sourceModules: [...new Set(chunk.moduleIds.filter((id) => id.includes(src)).map(moduleName))], imports: chunk.imports, dynamicImports: chunk.dynamicImports, css: [...(chunk.viteMetadata?.importedCss ?? [])], facade: chunk.facadeModuleId ? moduleName(chunk.facadeModuleId) : null, raw: statSync(join(dir, fileName)).size, gzip: gz(join(dir, fileName)) };
    } else if (fileName.endsWith(".css")) {
      files[fileName] = { kind: "css", modules: cssModules(join(dir, fileName)), raw: statSync(join(dir, fileName)).size, gzip: gz(join(dir, fileName)) };
    }
  }
  // What vinext's server lists for a page: the chunk of client-entry, of _app and of the page file,
  // each with its static-import closure; CSS comes from the manifest entries of those files.
  const manifest = JSON.parse(readFileSync(join(dir, ".vite/manifest.json"), "utf8"));
  const closure = (key, seen = new Set()) => {
    const item = manifest[key];
    if (!item || seen.has(key)) return seen;
    seen.add(key);
    for (const next of item.imports ?? []) closure(next, seen);
    return seen;
  };
  const keyOf = (path) => relative(here, join(src, path));
  const pages = {};
  for (const page of PAGES) {
    const keys = new Set([...closure(keyOf("client-entry.js")), ...closure(keyOf("pages/_app.js")), ...closure(keyOf(`pages/${page}.js`))]);
    const js = [...keys].map((key) => manifest[key].file);
    // vinext lists stylesheets in module-graph order, dependencies first, from _app and the page file.
    const css = [];
    const visited = new Set();
    const visit = (key) => {
      if (!manifest[key] || visited.has(key)) return;
      visited.add(key);
      for (const next of manifest[key].imports ?? []) visit(next);
      for (const file of manifest[key].css ?? []) if (!css.includes(file)) css.push(file);
    };
    visit(keyOf("pages/_app.js"));
    visit(keyOf(`pages/${page}.js`));
    // R4: the patched vinext sorts the page's stylesheet links by the build's CSS rank.
    const rank = stylesheetRank?.();
    if (rank) css.sort((left, right) => (rank[left] ?? -1) - (rank[right] ?? -1));
    const lazy = {};
    for (const dialog of ["ReviewsDialog", "SizeGuide"]) {
      const key = keyOf(`dialogs/${dialog}.js`);
      if (manifest[key] && (manifest[keyOf(`pages/${page}.js`)]?.dynamicImports ?? []).includes(key)) lazy[dialog] = [...closure(key)].map((k) => manifest[k].file).filter((file) => !js.includes(file));
    }
    const start = [...js, ...css];
    pages[page] = { start, stylesheets: css, copies: extraCopies(files, start), cssOrderOk: iconButtonWins(dir, css), pageInManifest: Boolean(manifest[keyOf(`pages/${page}.js`)]), lazy };
  }
  return { files, pages };
}

/** vinext's App Router grouping ported to pages: modules that the same set of pages load at start share a chunk. */
function routeGroups(defaultBuild) {
  const chunkOfModule = new Map();
  for (const [file, item] of Object.entries(defaultBuild.files)) if (item.kind === "js") for (const name of item.sourceModules) chunkOfModule.set(name, file);
  const startModules = (rootModule) => {
    const modules = new Set();
    const stack = [chunkOfModule.get(rootModule)];
    const seen = new Set();
    while (stack.length) {
      const file = stack.pop();
      if (!file || seen.has(file)) continue;
      seen.add(file);
      for (const name of defaultBuild.files[file].sourceModules) modules.add(name);
      stack.push(...(defaultBuild.files[file].imports ?? []));
    }
    return modules;
  };
  const owners = new Map();
  for (const page of ["_app", ...PAGES]) for (const name of startModules(page)) owners.set(name, [...(owners.get(name) ?? []), page]);
  const groups = new Map();
  for (const [name, pages] of owners) {
    // Page files and _app keep their own chunk: vinext's server finds a page's files by its manifest entry.
    if (name === "react" || name === "client-entry" || name === "_app" || PAGES.includes(name)) continue;
    const signature = pages.includes("_app") ? "_app" : pages.sort().join("+");
    groups.set(signature, [...(groups.get(signature) ?? []), name]);
  }
  const plan = new Map();
  for (const [signature, members] of groups) if (members.length > 1) for (const name of members) plan.set(name, `rg-${signature.replace(/\+/g, "-")}`);
  // Same options as the real port: one group named by the plan, no size floor, no pulled-in dependencies.
  return [{ name: (id) => plan.get(moduleName(id)) ?? null, minSize: 0, maxModuleSize: 102_400, includeDependenciesRecursively: false, priority: 10 }];
}

/**
 * vinext PR #4726 for the Pages Router: a "pages-app" group with _app's static imports (vinext's
 * collectPagesAppChunkRoots), then small common chunks copied into their importers except stylesheets
 * (withInlineCommonChunks).
 */
function prPagesApp() {
  const isFramework = (id) => /node_modules[\\/]react[\\/]/.test(id);
  const appRoots = new Set();
  const plugin = {
    name: "toy:pages-app-roots",
    buildEnd() {
      const info = (id) => this.getModuleInfo(id);
      const ids = [...this.getModuleIds()];
      const appId = ids.find((id) => id.endsWith("/pages/_app.js"));
      const closure = (start) => {
        const seen = new Set();
        const stack = [...start];
        while (stack.length) {
          const id = stack.pop();
          if (seen.has(id)) continue;
          seen.add(id);
          stack.push(...(info(id)?.importedIds ?? []));
        }
        return seen;
      };
      const leadsToEntry = new Set([appId]);
      const entries = [];
      const firstGroup = [];
      for (const id of ids) {
        if (info(id)?.isEntry) entries.push(id);
        if (isFramework(id)) firstGroup.push(id);
        else if (info(id)?.dynamicImporters.length) leadsToEntry.add(id);
      }
      const firstGroupTakes = closure(firstGroup);
      for (const id of closure(entries)) if (!isFramework(id) && !firstGroupTakes.has(id)) leadsToEntry.add(id);
      const pending = [...leadsToEntry];
      while (pending.length) for (const importer of info(pending.pop())?.importers ?? []) if (!leadsToEntry.has(importer)) (leadsToEntry.add(importer), pending.push(importer));
      for (const id of info(appId)?.importedIds ?? []) if (!isFramework(id) && !leadsToEntry.has(id)) appRoots.add(id);
    },
  };
  return { plugin, group: { name: (id) => (appRoots.has(id) ? "pages-app" : null), minSize: 0 } };
}


const STYLESHEET = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

/**
 * R2o, first pass: from an ordinary build's chunk graph, each chunk that holds CSS becomes one CSS
 * group, ranked in topological order of the static imports (dependencies first; an import cycle is
 * one position).
 */
function planCssGroups(chunks) {
  const contentKey = new Map(Object.entries(chunks).map(([name, chunk]) => [name, [...chunk.modules].sort().join("\n")]));
  const names = Object.keys(chunks).sort((left, right) => (contentKey.get(left) < contentKey.get(right) ? -1 : 1));
  const imports = (name) => chunks[name].imports.filter((importee) => importee in chunks);
  const indexOf = new Map();
  const lowLink = new Map();
  const onStack = new Set();
  const stack = [];
  const componentOf = new Map();
  let counter = 0;
  const strongConnect = (name) => {
    indexOf.set(name, counter);
    lowLink.set(name, counter++);
    stack.push(name);
    onStack.add(name);
    for (const importee of imports(name)) {
      if (!indexOf.has(importee)) {
        strongConnect(importee);
        lowLink.set(name, Math.min(lowLink.get(name), lowLink.get(importee)));
      } else if (onStack.has(importee)) lowLink.set(name, Math.min(lowLink.get(name), indexOf.get(importee)));
    }
    if (lowLink.get(name) === indexOf.get(name)) {
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        componentOf.set(member, name);
      } while (member !== name);
    }
  };
  for (const name of names) if (!indexOf.has(name)) strongConnect(name);
  const members = new Map();
  for (const name of names) members.set(componentOf.get(name), [...(members.get(componentOf.get(name)) ?? []), name]);
  const pending = new Map([...members.keys()].map((component) => [component, 0]));
  const dependents = new Map();
  for (const name of names) {
    const from = componentOf.get(name);
    for (const importee of imports(name)) {
      const to = componentOf.get(importee);
      if (to === from) continue;
      const set = dependents.get(to) ?? new Set();
      if (!set.has(from)) (set.add(from), pending.set(from, pending.get(from) + 1));
      dependents.set(to, set);
    }
  }
  const order = [...members.keys()].sort((left, right) => names.indexOf(left) - names.indexOf(right));
  const ready = order.filter((component) => pending.get(component) === 0);
  const groups = [];
  while (ready.length) {
    const component = ready.shift();
    const styled = members.get(component).filter((name) => chunks[name].modules.some((id) => STYLESHEET.test(id)));
    if (styled.length) groups.push(styled);
    const unlocked = [];
    for (const dependent of dependents.get(component) ?? []) {
      pending.set(dependent, pending.get(dependent) - 1);
      if (pending.get(dependent) === 0) unlocked.push(dependent);
    }
    ready.push(...unlocked.sort((left, right) => names.indexOf(left) - names.indexOf(right)));
  }
  return groups;
}
/** R2o, first pass: a plugin that records module -> CSS group from the build's chunk graph. */
function cssOrderPlan(plan) {
  return {
    name: "toy:css-order-plan",
    generateBundle(_options, bundle) {
      const chunks = {};
      for (const [fileName, output] of Object.entries(bundle)) if (output.type === "chunk") chunks[fileName] = { modules: output.moduleIds, imports: output.imports };
      planCssGroups(chunks).forEach((group, rank) => {
        for (const name of group) for (const id of chunks[name].modules) if (STYLESHEET.test(id)) plan.set(relative(src, id), `css-order-${String(rank).padStart(4, "0")}`);
      });
    },
  };
}
/** R2o, second pass: one CSS group per planned chunk; R4 needs each stylesheet's rank. */
function cssOrderGroups(plan, rank) {
  return {
    group: { minSize: 0, name: (id) => (STYLESHEET.test(id) ? (plan.get(relative(src, id)) ?? null) : null) },
    plugin: {
      name: "toy:css-order-rank",
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          const match = output.type === "chunk" && /^css-order-(\d+)$/.exec(output.name);
          if (match) for (const css of output.viteMetadata?.importedCss ?? []) rank[css] = Number(match[1]);
        }
      },
    },
  };
}
/** R2 without order: each stylesheet goes to a group named after the roots (entries, import() targets) that reach it. */
const cssByRootSet = {
  minSize: 0,
  name(moduleId, ctx) {
    if (!STYLESHEET.test(moduleId)) return null;
    const roots = new Set();
    const seen = new Set();
    const pending = [moduleId];
    while (pending.length) {
      const id = pending.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const info = ctx.getModuleInfo(id);
      if (!info) continue;
      if (info.isEntry || info.dynamicImporters.length) roots.add(moduleName(id));
      pending.push(...info.importers);
    }
    return `css-${[...roots].sort().join("-")}`;
  },
};
/**
 * R3: Vite drops a chunk as pure CSS only when it has no exports; a chunk of stylesheets still exports
 * their unused init wrappers, so hide them.
 */
const cssOnlyChunksArePureCss = {
  name: "toy:css-only-chunks-are-pure-css",
  configResolved(config) {
    const cssPost = config.plugins.find((plugin) => plugin.name === "vite:css-post");
    const original = cssPost.renderChunk;
    const handler = typeof original === "function" ? original : original.handler;
    const wrapped = function (code, chunk, ...rest) {
      const ids = Object.keys(chunk.modules);
      const view = ids.length && ids.every((id) => STYLESHEET.test(id)) ? new Proxy(chunk, { get: (target, key) => (key === "exports" ? [] : Reflect.get(target, key)) }) : chunk;
      return handler.call(this, code, view, ...rest);
    };
    cssPost.renderChunk = typeof original === "function" ? wrapped : { ...original, handler: wrapped };
  },
};

const framework = { name: "framework", test: /node_modules[\\/]react[\\/]/, priority: 40 };
const inline = { maxSize: 20_000, exclude: STYLESHEET };
/** The PR #4726 setup, plus extra groups after its pages-app group. */
const prBuild = (variant, extraGroups = [], plugins = [], stylesheetRank = null) => {
  const pr = prPagesApp();
  return buildVite(variant, { minSize: 10_000, groups: [framework, pr.group, ...extraGroups], experimentalInlineCommonChunks: inline }, {}, [pr.plugin, ...plugins], stylesheetRank);
};

if (process.env.TOY_PATCHED_PASS) {
  // Runs in a child process: Rolldown loads its native binding once per process.
  const result = {};
  result.r1 = await prBuild("r1");
  result.naiveSplit = await prBuild("naive-split", [cssByRootSet], [cssOnlyChunksArePureCss]);
  const plan = new Map();
  await prBuild("patched-plan", [], [cssOrderPlan(plan)]);
  trashDir(join(out, "patched-plan"));
  const rank = {};
  const groups = cssOrderGroups(plan, rank);
  result.patched = await prBuild("patched", [groups.group], [groups.plugin, cssOnlyChunksArePureCss], () => rank);
  writeFileSync(join(here, "result-patched.json"), JSON.stringify(result));
  process.exit(0);
}
const result = { webpack: await buildWebpack() };
result.rolldown = await buildVite("rolldown", { groups: [framework] });
result.routeGroups = await buildVite("route-groups", { groups: [framework, ...routeGroups(result.rolldown)] });
result.chunkGroups = await buildVite("chunk-groups", {
  groups: [framework, { name: "app", test: (id) => !id.includes("node_modules"), priority: 10, entriesAware: true, entriesAwareMergeThreshold: 20_000, maxSize: 300_000 }],
});
result.inlineCommon = await buildVite("inline-common", { groups: [framework], experimentalInlineCommonChunks: { maxSize: 20_000 } });
result.pr4726 = await prBuild("pr-4726");
// R1 is a Rolldown 1.2.19 binding built with patches/rolldown-r1-sibling-order.patch; without it the patched builds are skipped.
if (ROLLDOWN_R1_BINDING) {
  execFileSync(process.execPath, [new URL(import.meta.url).pathname], { stdio: "inherit", env: { ...process.env, TOY_PATCHED_PASS: "1", NAPI_RS_NATIVE_LIBRARY_PATH: ROLLDOWN_R1_BINDING } });
  Object.assign(result, JSON.parse(readFileSync(join(here, "result-patched.json"), "utf8")));
  execFileSync("trash", [join(here, "result-patched.json")]);
}
writeFileSync(join(here, "result.json"), JSON.stringify(result, null, 1));
for (const [name, item] of Object.entries(result)) {
  const product = item.pages.product;
  console.log(`${name.padEnd(14)} files ${String(Object.keys(item.files).length).padStart(3)}  product start ${product.start.length} (${product.stylesheets.length} css)  copies ${product.copies}  css order ${{ true: "ok", false: "INVERTED", null: "no CSS" }[product.cssOrderOk]}${product.pageInManifest === false ? "  page missing from manifest" : ""}  lazy ${JSON.stringify(Object.fromEntries(Object.entries(product.lazy).map(([k, v]) => [k, v.length])))}`);
}
