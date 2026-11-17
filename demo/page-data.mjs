// Writes ../data.js for the page from result.json: every output file of each build with its
// modules and sizes, and the files each page loads at start.
//   node page-data.mjs
import { readFileSync, writeFileSync } from "node:fs";
const result = JSON.parse(readFileSync(new URL("./result.json", import.meta.url), "utf8"));
const data = {};
for (const [build, { files, pages }] of Object.entries(result)) {
  data[build] = {
    files: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, { kind: file.kind, modules: file.modules, raw: file.raw, gzip: file.gzip }])),
    pages: Object.fromEntries(Object.entries(pages).map(([page, item]) => [page, { start: item.start, lazy: item.lazy, pageInManifest: item.pageInManifest }])),
  };
}
writeFileSync(new URL("../data.js", import.meta.url), `window.TOY = ${JSON.stringify(data)};\n`);
console.log(Object.entries(data).map(([build, item]) => `${build}: product ${item.pages.product.start.length}, home ${item.pages.home.start.length}, cart ${item.pages.cart.start.length}`).join("\n"));
