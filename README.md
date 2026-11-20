# Same code, ten times the files

An explainer: why webpack (with Next.js's settings) packs a Pages Router app into a few dozen files, and Rolldown (as vinext 1.4 uses it) into hundreds.

Live: https://jantimon.github.io/demo-chunking-vinext-vs-webpack/

## Versions

Every branch is published to GitHub Pages under its own name (`/` in a name becomes `-`):

| URL | Branch |
|---|---|
| [/](https://jantimon.github.io/demo-chunking-vinext-vs-webpack/) | `main` (vinext 1.4.5) |
| [/1.4.5/](https://jantimon.github.io/demo-chunking-vinext-vs-webpack/1.4.5/) | `main` |
| [/vite-pr-4726/](https://jantimon.github.io/demo-chunking-vinext-vs-webpack/vite-pr-4726/) | `vite-pr-4726`: the step figure uses vinext PR #4726's chunking |
| [/rolldown-patch/](https://jantimon.github.io/demo-chunking-vinext-vs-webpack/rolldown-patch/) | `rolldown-patch`: adds section 08, the toy built with a patched Rolldown (R1) and plugins that split CSS in order (R2o, R3, R4). Not a release |
| `/<branch>/` | any other branch |

A push to any branch redeploys all of them (`.github/workflows/pages.yml`).

## Run it

Open `index.html` in a browser. No build step.

## The demo app

`demo/` holds the toy shop the figures use, built for real:

```sh
cd demo
node make-app.mjs    # writes src/: 3 pages, _app, 3 lazy dialogs, shared modules; each component imports its own CSS and the styled runtime
node build.mjs       # builds it with webpack and 5 Vite/Rolldown setups, writes result.json
node page-data.mjs   # writes ../data.js for the page
```

`build.mjs` loads webpack, css-loader, mini-css-extract-plugin (from Next.js) and Vite 8 from two existing installs: `WEBPACK_ROOT=<folder with next@16.4> VITE_ROOT=<folder with vite@8.3.8> node build.mjs`. The r1, naiveSplit and patched builds run only with `ROLLDOWN_R1_BINDING=<rolldown-binding .node file built from rolldown v1.2.19 with demo/patches/rolldown-r1-sibling-order.patch>`; they load it through `NAPI_RS_NATIVE_LIBRARY_PATH` in a child process.

| Build | Setup |
|---|---|
| webpack | Next.js 16.4 client `splitChunks`: framework group, lib group (> 160 KB), `minSize: 20000`, pages `dependOn` `_app` |
| rolldown | one client entry that loads `_app` and every page with `import()`, React in a framework group, as vinext 1.4 does |
| routeGroups | vinext's App Router grouping ported to pages: modules the same set of pages load at start share a chunk |
| chunkGroups | Rolldown `codeSplitting.groups` with `entriesAware` app groups |
| inlineCommon | Rolldown `experimentalInlineCommonChunks: { maxSize: 20000 }` |
| r1 | pr4726 with a Rolldown 1.2.19 binding built from `demo/patches/rolldown-r1-sibling-order.patch`: a shared module is copied once per chain of sibling chunks, not into each |
| naiveSplit | r1, plus every stylesheet in a group named after the pages and dialogs that load it, plus R3 |
| patched | r1, plus R2o (each CSS-carrying chunk's stylesheets in one CSS-only chunk, ranked dependencies first), R3 (Vite drops the empty JS file of a CSS-only chunk), R4 (stylesheet links sorted by that rank) |
| pr4726 | [vinext PR #4726](https://github.com/cloudflare/vinext/pull/4726): `_app`'s imports in one `pages-app` group, `minSize: 10000`, `experimentalInlineCommonChunks: { maxSize: 20000, exclude: <stylesheets> }`. The step figure on this branch uses it |

The numbers for the large app come from a real Pages Router app with 225 pages, measured on one laptop with Chrome's phone and network emulation.
