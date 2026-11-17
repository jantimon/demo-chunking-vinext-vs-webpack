# Same code, ten times the files

An explainer: why webpack (with Next.js's settings) packs a Pages Router app into a few dozen files, and Rolldown (as vinext 1.4 uses it) into hundreds.

Live: https://jantimon.github.io/demo-chunking-vinext-vs-webpack/

## Run it

Open `index.html` in a browser. No build step.

## The demo app

`demo/` holds the toy shop the figures use, built for real:

```sh
cd demo
node make-app.mjs    # writes src/: 3 pages, _app, 2 lazy dialogs, shared modules
node build.mjs       # builds it with webpack and 4 Vite/Rolldown setups, writes result.json
node page-data.mjs   # writes ../data.js for the page
```

`build.mjs` loads webpack, css-loader, mini-css-extract-plugin (from Next.js) and Vite 8 from two existing installs: `WEBPACK_ROOT=<folder with next@16.4> VITE_ROOT=<folder with vite@8.3> node build.mjs`.

| Build | Setup |
|---|---|
| webpack | Next.js 16.4 client `splitChunks`: framework group, lib group (> 160 KB), `minSize: 20000`, pages `dependOn` `_app` |
| rolldown | one client entry that loads `_app` and every page with `import()`, React in a framework group, as vinext 1.4 does |
| routeGroups | vinext's App Router grouping ported to pages: modules the same set of pages load at start share a chunk |
| chunkGroups | Rolldown `codeSplitting.groups` with `entriesAware` app groups |
| inlineCommon | Rolldown `experimentalInlineCommonChunks: { maxSize: 20000 }` |

The numbers for the large app come from a real Pages Router app with 225 pages, measured on one laptop with Chrome's phone and network emulation.
