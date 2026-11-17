// Writes the toy shop into src/: three pages, _app, two lazy dialogs and shared modules
// with fixed source sizes, so both bundlers see the same graph.
//   node make-app.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const src = join(here, "src");

/** Source text of about `bytes` bytes: a lookup table the export reads, so nothing is tree-shaken. */
const filler = (name, bytes) => {
  const rows = [];
  let size = 0;
  for (let index = 0; size < bytes; index++) {
    const row = `  ["${name}-${index.toString(36)}", ${(index * 7919) % 10007}, "${"abcdefghij".repeat(3)}${index}"],\n`;
    rows.push(row);
    size += row.length;
  }
  return `const TABLE = [\n${rows.join("")}];\n`;
};

const MODULES = {
  // name: [path, source bytes, imports, has css]
  react: ["node_modules/react/index.js", 60_000, [], false],
  Header: ["components/Header.js", 8_000, ["Button"], true],
  Button: ["components/Button.js", 2_000, ["react"], true],
  Price: ["components/Price.js", 1_500, ["react"], true],
  Rating: ["components/Rating.js", 1_000, ["react"], true],
  Carousel: ["components/Carousel.js", 26_000, ["react"], true],
  Gallery: ["components/Gallery.js", 30_000, ["react"], true],
  useCart: ["lib/useCart.js", 2_000, ["react"], false],
  formatDate: ["lib/formatDate.js", 600, [], false],
  SizeTable: ["components/SizeTable.js", 3_000, ["react"], true],
  ReviewsDialog: ["dialogs/ReviewsDialog.js", 6_000, ["formatDate", "Button"], true],
  SizeGuide: ["dialogs/SizeGuide.js", 4_000, ["SizeTable", "useCart", "Button"], true],
  _app: ["pages/_app.js", 3_000, ["react", "Header"], true],
  home: ["pages/home.js", 5_000, ["Button", "Price", "Rating", "Carousel"], true],
  product: ["pages/product.js", 5_000, ["Button", "Price", "Rating", "Carousel", "Gallery", "useCart", "formatDate"], true],
  cart: ["pages/cart.js", 5_000, ["Button", "Price", "useCart"], true],
};
const LAZY = { product: ["ReviewsDialog", "SizeGuide"], cart: ["SizeGuide"] };

const rel = (from, to) => {
  const path = MODULES[to][0];
  if (to === "react") return "react";
  const fromDir = dirname(MODULES[from][0]);
  let relative = join(...fromDir.split("/").map(() => "..")) + "/" + path;
  return relative.startsWith(".") ? relative : `./${relative}`;
};

for (const [name, [path, bytes, imports, hasCss]] of Object.entries(MODULES)) {
  const file = join(src, path);
  mkdirSync(dirname(file), { recursive: true });
  const lines = [];
  imports.forEach((dependency, index) => lines.push(`import * as dep${index} from "${rel(name, dependency)}";`));
  if (hasCss) {
    const cssFile = file.replace(/\.js$/, ".css");
    writeFileSync(cssFile, `.${name} { color: #${(name.length * 999999).toString(16).slice(0, 6).padEnd(6, "0")}; padding: ${name.length}px; }\n`);
    lines.push(`import "./${path.split("/").pop().replace(/\.js$/, ".css")}";`);
  }
  for (const target of LAZY[name] ?? []) lines.push(`export const open${target} = () => import("${rel(name, target)}");`);
  lines.push(filler(name, bytes));
  const component = name.replace(/^_/, "App");
  lines.push(`export default function ${component}() {\n  return [${imports.map((_, index) => `dep${index}`).join(", ")}${imports.length ? ", " : ""}TABLE.length, "${name}"];\n}`);
  // Pages register themselves, as Next.js pages do with __NEXT_P.push, so no bundler drops them.
  if (path.startsWith("pages/")) lines.push(`(window.__NEXT_P = window.__NEXT_P || []).push(["/${name}", () => ${component}]);`);
  writeFileSync(file, `${lines.join("\n")}\n`);
}
if (MODULES.react) writeFileSync(join(src, "node_modules/react/package.json"), JSON.stringify({ name: "react", version: "0.0.0-toy", main: "index.js" }));

// webpack: one entry per page, pages depend on _app, _app on main (as Next.js does).
writeFileSync(join(src, "main.js"), `import "react";\nwindow.__boot = "main";\n`);
// Rolldown: one client entry that imports _app and every page dynamically (as vinext does).
writeFileSync(
  join(src, "client-entry.js"),
  `import "react";
const pageLoaders = {
  "/": () => import("./pages/home.js"),
  "/product": () => import("./pages/product.js"),
  "/cart": () => import("./pages/cart.js"),
};
const appLoader = () => import("./pages/_app.js");
window.__pageLoaders = pageLoaders;
window.__appLoader = appLoader;
`,
);
console.log(`wrote ${Object.keys(MODULES).length} modules to ${src}`);
