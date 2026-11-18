const $ = (selector, root = document) => root.querySelector(selector);
const TOY = window.TOY;

/** The toy shop (demo/make-app.mjs): source size in KB, direct importers, importer-set color. */
const ALL = ["_app", "home", "product", "cart", "login", "reviews", "size guide"];
const MODULES = {
  react: { kb: 60, by: ["everything"], set: "fw" },
  _app: { kb: 3, by: ["every page"], set: "app" },
  Header: { kb: 8, by: ["_app"], set: "app" },
  Button: { kb: 2, by: ALL, set: "all" },
  styled: { kb: 3, by: ["every component with CSS"], set: "all" },
  Carousel: { kb: 26, by: ["home", "product"], set: "hp" },
  Rating: { kb: 1, by: ["home", "product"], set: "hp" },
  Price: { kb: 1.5, by: ["home", "product", "cart"], set: "hpc" },
  translate: { kb: 1.5, by: ["home", "product", "cart", "login", "reviews", "size guide"], set: "tr" },
  IconButton: { kb: 1, by: ["product", "cart", "size guide"], set: "pc" },
  useCart: { kb: 2, by: ["product", "cart", "size guide"], set: "pc" },
  Gallery: { kb: 30, by: ["product"], set: "p" },
  formatDate: { kb: 0.6, by: ["product", "reviews"], set: "p" },
  product: { kb: 5, by: ["page"], set: "p" },
  home: { kb: 5, by: ["page"], set: "app" },
  cart: { kb: 5, by: ["page"], set: "app" },
  LoginDialog: { kb: 3, by: ["_app, lazy"], set: "dlg" },
  ReviewsDialog: { kb: 6, by: ["product, lazy"], set: "dlg" },
  SizeGuide: { kb: 4, by: ["product + cart, lazy"], set: "dlg" },
  SizeTable: { kb: 3, by: ["size guide"], set: "dlg" },
};
const color = (name) => `var(--s-${MODULES[name].set})`;
const kb = (value) => (value < 1 ? `${value * 1000} B` : `${value} KB`);
const chipHtml = (name, withSize = true) => `<span class="chip" style="--c:${color(name)}">${name}${withSize ? `<span class="sz">${kb(MODULES[name].kb)}</span>` : ""}</span>`;

/* 02 · module graph: hover or focus a card to see its importers (or a root's modules) */
const GRAPH_ROOTS = [
  ["_app", "wraps every page"],
  ["home", "page"],
  ["product", "page"],
  ["cart", "page"],
  ["LoginDialog", "lazy, from _app"],
  ["ReviewsDialog", "lazy, from product"],
  ["SizeGuide", "lazy, from product + cart"],
];
const BY_TO_ROOT = { _app: ["_app"], home: ["home"], product: ["product"], cart: ["cart"], login: ["LoginDialog"], reviews: ["ReviewsDialog"], "size guide": ["SizeGuide"], everything: GRAPH_ROOTS.map(([id]) => id), "every component with CSS": GRAPH_ROOTS.map(([id]) => id) };
function graph() {
  const shared = ["react", "styled", "Header", "Button", "IconButton", "Carousel", "Rating", "Price", "translate", "useCart", "Gallery", "formatDate", "SizeTable"];
  const rootsOf = (name) => [...new Set(MODULES[name].by.flatMap((by) => BY_TO_ROOT[by] ?? []))];
  const host = $("#graph");
  host.innerHTML = `<div class="g-roots">${GRAPH_ROOTS.map(([name, note]) => `<div class="g-root" tabindex="0" data-root="${name}">${name}<small>${note}</small></div>`).join("")}</div>
    <div class="g-mods">${shared.map((name) => `<div class="mod" tabindex="0" data-mod="${name}" data-roots="${rootsOf(name).join(" ")}" style="--c:${color(name)}"><span>${name}</span><span class="sz">${kb(MODULES[name].kb)}</span><span class="by-k">imported by</span><span class="by">${MODULES[name].by.map((by) => `<i>${by}</i>`).join("")}</span></div>`).join("")}</div>`;
  const mods = [...host.querySelectorAll(".mod")];
  const roots = [...host.querySelectorAll(".g-root")];
  const light = (lit) => {
    host.classList.toggle("hovering", lit.size > 0);
    [...mods, ...roots].forEach((card) => card.classList.toggle("lit", lit.has(card)));
  };
  for (const mod of mods) {
    const show = () => light(new Set([mod, ...roots.filter((root) => mod.dataset.roots.split(" ").includes(root.dataset.root))]));
    mod.addEventListener("mouseenter", show);
    mod.addEventListener("focus", show);
  }
  for (const root of roots) {
    const show = () => light(new Set([root, ...mods.filter((mod) => mod.dataset.roots.split(" ").includes(root.dataset.root))]));
    root.addEventListener("mouseenter", show);
    root.addEventListener("focus", show);
  }
  host.addEventListener("mouseleave", () => light(new Set()));
  host.addEventListener("focusout", (event) => { if (!host.contains(event.relatedTarget)) light(new Set()); });
}

/* 03 · step figure: where each module of the product page lands */
const STEPS = [
  { cap: "The product page's modules, before bundling", mod: null, wp: "Next.js makes every page an entry that depends on <code>_app</code>, and splits shared code from 20 KB up.", rd: "vinext loads <code>_app</code> and every page with <code>import()</code> from one client entry. Rolldown splits with no size floor." },
  { cap: "React · every page", mod: "react", wp: "Into the <b>framework</b> chunk, as Next.js configures it.", rd: "Into the <b>framework</b> chunk, as vinext configures it." },
  { cap: "_app · wraps every page", mod: "_app", wp: "Its own entry file.", rd: "Its own chunk." },
  { cap: "Header · only _app uses it", mod: "Header", wp: "Into <code>_app</code>.", rd: "Into <code>_app</code>." },
  { cap: "Button · 2 KB · _app, every page, every dialog", mod: "Button", wp: "Already in <code>_app</code>, and every page loads <code>_app</code> first: <b>stays there</b>.", rd: "<code>_app</code> and the pages are separate roots, so this set gets <b>a new chunk</b>." },
  { cap: "styled · 3 KB · every component with CSS", mod: "styled", wp: "<code>Header</code> uses it, so it is in <code>_app</code> already: <b>stays there</b>.", rd: "Same set as <code>Button</code>: joins its chunk." },
  { cap: "Carousel · 26 KB · home + product", mod: "Carousel", wp: "Shared and over 20 KB: <b>a shared chunk</b>.", rd: "Set home + product: <b>a new chunk</b>." },
  { cap: "Rating · 1 KB · home + product", mod: "Rating", wp: "Same pages as Carousel: joins its chunk.", rd: "Same set as Carousel: joins its chunk." },
  { cap: "Price · 1.5 KB · home + product + cart", mod: "Price", wp: "Joins the home + product chunk and is <b>copied</b> into the cart page's file.", rd: "Set home + product + cart: <b>a new chunk</b>." },
  { cap: "translate · 1.5 KB · home, product, cart, three dialogs", mod: "translate", wp: "Joins the home + product chunk and is <b>copied</b> into the cart and login dialog files.", rd: "No other module has this set: <b>a new chunk</b>." },
  { cap: "IconButton · 1 KB · product + cart + size guide", mod: "IconButton", wp: "Under 20 KB: into the product file, <b>copied</b> into the cart file.", rd: "Set product + cart, as the size guide opens only there: <b>a new chunk</b>." },
  { cap: "useCart · 2 KB · product + cart + size guide", mod: "useCart", wp: "Under 20 KB: <b>copied</b> into the product and cart files.", rd: "Same set as <code>IconButton</code>: joins its chunk." },
  { cap: "Gallery · 30 KB · only product", mod: "Gallery", wp: "Into the product page's file.", rd: "Into the product page's chunk." },
  { cap: "formatDate · 0.6 KB · product + reviews dialog", mod: "formatDate", wp: "The dialog only opens from product, which has it already: stays in product.", rd: "Same decision: the product page's chunk." },
  { cap: "The product page itself", mod: "product", wp: "Its own entry file.", rd: "Its own chunk." },
  { cap: "Stylesheets", mod: "css", wp: "One stylesheet per entry.", rd: "One stylesheet per chunk with CSS." },
];
const ORDER = STEPS.map((step) => step.mod).filter((mod) => mod && mod !== "css");
const stepOf = (mod) => STEPS.findIndex((step) => step.mod === mod);
// Output names are <name>-<hash>.<ext>; Rolldown's 8-character hashes may contain "-".
const stem = (file) => file.replace(/^.*\//, "").replace(/-[\w-]{6,8}\.(js|css)$/, "");

function laneModel(build) {
  const { files, pages } = TOY[build];
  const start = pages.product.start;
  const js = start.filter((file) => files[file].kind === "js");
  const css = start.filter((file) => files[file].kind === "css");
  const order = (file) => Math.min(99, ...files[file].modules.filter((mod) => ORDER.includes(mod)).map(stepOf));
  const rows = js.sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((file) => ({
    file,
    modules: files[file].modules.filter((mod) => ORDER.includes(mod)).sort((a, b) => stepOf(a) - stepOf(b)),
    css: css.find((sheet) => stem(sheet) === stem(file)) ?? null,
    infra: !files[file].modules.some((mod) => ORDER.includes(mod)),
  }));
  if (build === "webpack") {
    const cartFile = pages.cart.start.find((file) => files[file].kind === "js" && files[file].modules.includes("cart"));
    // The cart page's copies sit with the module files; runtime files stay last, as in the Rolldown lane.
    const firstInfra = rows.findIndex((row) => row.infra);
    rows.splice(firstInfra === -1 ? rows.length : firstInfra, 0, { file: cartFile, modules: files[cartFile].modules.filter((mod) => ORDER.includes(mod)), css: null, infra: false, other: "cart page only" });
  }
  return { rows, js: js.length, css: css.length };
}
const LANES = { wp: laneModel("webpack"), rd: laneModel("rolldown") };

/**
 * Both lanes share virtual rows: a file's row is its largest module, so webpack's 161 sits next to
 * Rolldown's Carousel chunk, and a lane shows a gap where the other bundler needs an extra file.
 */
const rowKey = (row, infraIndex) =>
  row.infra ? `infra${infraIndex}` : row.modules.reduce((a, b) => (MODULES[b].kb > MODULES[a].kb ? b : a));
const keyOrder = (key) => (key.startsWith("infra") ? 90 + Number(key.slice(5)) : stepOf(key));
for (const lane of Object.values(LANES)) {
  let infra = 0;
  lane.rows.forEach((row) => (row.key = rowKey(row, row.infra ? infra++ : 0)));
}
const ROW_KEYS = [...new Set([...LANES.wp.rows, ...LANES.rd.rows].map((row) => row.key))].sort((a, b) => keyOrder(a) - keyOrder(b));

function buildLane(key) {
  const host = $(key === "wp" ? "#laneWp" : "#laneRd");
  host.innerHTML = ROW_KEYS.map((rowKeyName) => LANES[key].rows.find((row) => row.key === rowKeyName) ?? { gap: true, key: rowKeyName })
    .map((row) => row.gap ? `<div class="file gap" data-row="${row.key}"></div>` : `<div data-row="${row.key}" class="file${row.infra ? " infra has" : ""}${row.other ? " other" : ""}" data-file="${row.file}">
      <div class="file-top"><span class="fname"><i class="ficon js">JS</i><span class="long">${row.other ? `${stem(row.file)}.js · ${row.other}` : row.file.replace(/^.*\//, "")}</span><span class="short">${stem(row.file)}${row.other ? " · copies" : ""}</span></span>${row.infra ? '<span class="tag">runtime</span>' : ""}</div>
      <div class="file-mods">${row.modules.map((mod) => `<span class="chip${row.other ? " copy" : ""}" data-mod="${mod}" style="--c:${color(mod)};display:none">${mod}</span>`).join("")}</div>
      ${row.css ? `<span class="css-tag" style="display:none"><i class="ficon css">CSS</i>${row.css.replace(/^.*\//, "")}</span>` : ""}
    </div>`)
    .join("");
}

/** The decision shown next to the module: who imports it, then one line per bundler. */
const ROOTS = [["_app", "_app"], ["home", "home"], ["product", "product"], ["cart", "cart"], ["login", "login dialog"], ["reviews", "reviews dialog"], ["sizeGuide", "size guide"]];
const EVERY_ROOT = ROOTS.map(([id]) => id);
const DECIDE = {
  react: [EVERY_ROOT, "framework chunk", "framework chunk"],
  _app: [["_app"], "its own entry file", "its own chunk"],
  Header: [["_app"], "into _app", "into _app"],
  Button: [EVERY_ROOT, "stays in _app · pages load _app first", "new chunk · _app and pages are separate roots"],
  styled: [EVERY_ROOT, "stays in _app · Header uses it", "Button's chunk · same set"],
  Carousel: [["home", "product"], "shared chunk · shared and over 20 KB", "new chunk for home + product"],
  Rating: [["home", "product"], "Carousel's chunk · same pages", "Carousel's chunk · same set"],
  Price: [["home", "product", "cart"], "home + product chunk, COPY in cart", "new chunk for home + product + cart"],
  translate: [["home", "product", "cart", "login", "reviews", "sizeGuide"], "home + product chunk, COPY in cart and login", "new chunk for its own set"],
  IconButton: [["product", "cart", "sizeGuide"], "into product, COPY in cart · under 20 KB", "new chunk for product + cart"],
  useCart: [["product", "cart", "sizeGuide"], "COPY into product and cart · under 20 KB", "IconButton's chunk · same set"],
  Gallery: [["product"], "into product", "into product"],
  formatDate: [["product", "reviews"], "into product · the dialog opens only there", "into product · same decision"],
  product: [["product"], "its own entry file", "its own chunk"],
  css: [[], "one stylesheet per entry", "one stylesheet per chunk"],
};

/** Steps whose decision repeats an earlier pattern: autoplay runs them at about twice the speed. */
const FAST = new Set(["Header", "styled", "Rating", "IconButton", "useCart", "Gallery", "formatDate", "product"]);
let pace = 1;
let step = 0;
let playing = false;
let timers = [];
let landed = { wp: true, rd: true };
const tray = $("#tray");
const stage = $("#pack");
const decider = document.createElement("div");
decider.className = "decider";
decider.setAttribute("aria-hidden", "true");
stage.append(decider);

const later = (ms, fn) => timers.push(setTimeout(fn, ms));
const stopTimers = () => { timers.forEach(clearTimeout); timers = []; };
const laneEl = (key) => $(key === "wp" ? "#laneWp" : "#laneRd");
const placedFor = (key) => {
  const placed = new Set(STEPS.slice(1, step).map((item) => item.mod));
  if (landed[key] && STEPS[step].mod) placed.add(STEPS[step].mod);
  return placed;
};

function render(animate) {
  const current = STEPS[step];
  const before = new Set(STEPS.slice(1, step).map((item) => item.mod));
  tray.innerHTML = ORDER.map((mod) => chipHtml(mod)).join("");
  [...tray.children].forEach((chip, index) => {
    const mod = ORDER[index];
    chip.dataset.mod = mod;
    chip.classList.toggle("done", before.has(mod) || (mod === current.mod && landed.wp && landed.rd && !decider.classList.contains("open")));
    chip.classList.toggle("now", mod === current.mod && decider.classList.contains("open"));
  });
  for (const key of ["wp", "rd"]) {
    const placed = placedFor(key);
    for (const fileEl of laneEl(key).children) {
      let any = fileEl.classList.contains("infra");
      for (const chip of fileEl.querySelectorAll(".chip")) {
        const show = placed.has(chip.dataset.mod);
        const wasHidden = chip.style.display === "none";
        chip.style.display = show ? "" : "none";
        if (show && wasHidden && animate) {
          chip.classList.remove("land");
          void chip.offsetWidth;
          chip.classList.add("land");
        }
        any ||= show;
      }
      const css = fileEl.querySelector(".css-tag");
      if (css) {
        const show = placed.has("css");
        if (show && css.style.display === "none" && animate) css.classList.add("land");
        css.style.display = show ? "" : "none";
      }
      fileEl.classList.toggle("has", any);
    }
    $(key === "wp" ? "#noteWp" : "#noteRd").innerHTML = landed[key] ? current[key] : "";
    const model = LANES[key];
    const done = step === STEPS.length - 1 && landed.wp && landed.rd;
    const count = $(key === "wp" ? "#countWp" : "#countRd");
    count.innerHTML = done ? `Product page: ${model.js + model.css} files <span class="count-kinds">${model.js}<i class="ficon js">JS</i> ${model.css}<i class="ficon css">CSS</i></span>` : "";
    count.classList.toggle("final", done);
  }
  equalizeRows();
  $("#packCap").textContent = step === STEPS.length - 1 && landed.rd ? `Product page: ${LANES.wp.js + LANES.wp.css} files with webpack, ${LANES.rd.js + LANES.rd.css} with Rolldown` : current.cap;
  [...$("#packDots").children].forEach((dot, index) => dot.setAttribute("aria-current", index === step));
  const playButton = $('[data-act="play"]');
  playButton.classList.toggle("is-playing", playing);
  playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
}

/** Gives both cells of a virtual row the height of the taller one. */
/**
 * Both cells of a virtual row get the height of the taller one in the final state, measured once
 * with every chip and stylesheet shown, so the figure never changes height while it plays.
 */
let rowHeights = null;
function measureFinalRows() {
  const cells = [...document.querySelectorAll("#laneWp > .file, #laneRd > .file")];
  const hidden = [...document.querySelectorAll("#pack .files .chip, #pack .files .css-tag")].filter((node) => node.style.display === "none");
  hidden.forEach((node) => (node.style.display = ""));
  cells.forEach((cell) => (cell.style.minHeight = ""));
  const left = [...$("#laneWp").children];
  const right = [...$("#laneRd").children];
  rowHeights = left.map((cell, index) => Math.max(cell.offsetHeight, right[index].offsetHeight));
  hidden.forEach((node) => (node.style.display = "none"));
  equalizeRows();
  reserveTextHeights();
}
/** The caption, the lane notes and the counts get the height of their tallest text across all steps. */
function reserveTextHeights() {
  const finalCount = (key) => `Product page: ${LANES[key].js + LANES[key].css} files <span class="count-kinds">${LANES[key].js}<i class="ficon js">JS</i> ${LANES[key].css}<i class="ficon css">CSS</i></span>`;
  const targets = [
    [$("#packCap"), [...STEPS.map((item) => item.cap), `Product page: ${LANES.wp.js + LANES.wp.css} files with webpack, ${LANES.rd.js + LANES.rd.css} with Rolldown`]],
    [$("#noteWp"), STEPS.map((item) => item.wp)],
    [$("#noteRd"), STEPS.map((item) => item.rd)],
    [$("#countWp"), [finalCount("wp")]],
    [$("#countRd"), [finalCount("rd")]],
  ];
  for (const [node, texts] of targets) {
    const keep = node.innerHTML;
    const keepFinal = node.classList.contains("final");
    node.style.minHeight = "";
    if (node.classList.contains("count")) node.classList.add("final");
    let max = 0;
    for (const text of texts) {
      node.innerHTML = text;
      max = Math.max(max, node.offsetHeight);
    }
    node.innerHTML = keep;
    node.classList.toggle("final", keepFinal);
    node.style.minHeight = `${max}px`;
  }
}
function equalizeRows() {
  if (!rowHeights) return;
  const left = [...$("#laneWp").children];
  const right = [...$("#laneRd").children];
  left.forEach((cell, index) => (cell.style.minHeight = right[index].style.minHeight = `${rowHeights[index]}px`));
}
let packWidth = 0;
addEventListener("resize", () => {
  if (Math.abs(stage.clientWidth - packWidth) < 2) return;
  packWidth = stage.clientWidth;
  measureFinalRows();
});

/** True when at least a third of the element is on screen and not covered by the next section. */
function isShown(element) {
  const rect = element.getBoundingClientRect();
  const section = element.closest("section");
  const next = section?.nextElementSibling;
  const coverTop = next ? next.getBoundingClientRect().top : Infinity;
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, innerHeight, coverTop);
  return (bottom - top) / Math.min(rect.height, innerHeight) > 0.33;
}

/** Opens the decision card right under the module's chip in the tray, so the eye stays there. */
function openDecider() {
  const mod = STEPS[step].mod;
  const [by, wp, rd] = DECIDE[mod];
  decider.innerHTML = `<div class="dc-head">${mod === "css" ? '<span class="chip" style="--c:#e86bd0">stylesheets</span>' : chipHtml(mod)}<span class="dc-by">${by.length ? "used by" : ""}</span>${by.map((root) => `<span class="root-pill slot" data-root="${root}">${ROOTS.find(([id]) => id === root)[1]}</span>`).join("")}</div>
    <div class="dc-row wp"><i class="tok wp"></i><svg class="bi webpack" aria-hidden="true"><use href="#bi-webpack"/></svg><b>webpack</b><span>→ ${wp}</span></div>
    <div class="dc-row rd"><i class="tok rd"></i><svg class="bi rolldown" aria-hidden="true"><use href="#bi-rolldown"/></svg><b>Rolldown</b><span>→ ${rd}</span></div>`;
  const anchor = mod === "css" ? tray : tray.querySelector(`[data-mod="${mod}"]`);
  const box = stage.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const width = Math.min(500, box.width - 24);
  const left = Math.max(12, Math.min(at.left - box.left - 8, box.width - width - 12));
  const slot = $("#decideSlot").getBoundingClientRect();
  Object.assign(decider.style, { left: `${left}px`, top: `${slot.top - box.top}px`, width: `${width}px` });
  decider.classList.add("open");
}
function closeDecider() {
  decider.classList.remove("open");
  decider.querySelectorAll(".dc-row").forEach((row) => row.classList.remove("show"));
}

/** Each root that imports the module flies from the roots row into the card, one after the other. */
function flyUsages() {
  [...decider.querySelectorAll(".root-pill.slot")].forEach((slot, index) => {
    later(index * 220 * pace, () => {
      const source = $(`#roots [data-root="${slot.dataset.root}"]`);
      source.classList.add("ping");
      later(700 * pace, () => source.classList.remove("ping"));
      flip(slot, source.getBoundingClientRect(), 650 * pace, 14, () => slot.classList.add("in"));
    });
  });
}

/**
 * FLIP: the element is shown in its final place at once, then animated from where it starts
 * (`from`, a viewport rect) back to that place. The animation is relative to the element's own
 * position, so scrolling or a moving section during the flight cannot make it land in the wrong spot.
 */
function flip(element, from, duration, arc, show) {
  show();
  const to = element.getBoundingClientRect();
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  element.classList.add("flipping");
  element.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(1.08)` },
      { transform: `translate(${dx / 2}px, ${dy / 2 - arc}px) scale(1.08)`, offset: 0.5 },
      { transform: "none" },
    ],
    { duration, easing: "cubic-bezier(.45,0,.25,1)" },
  ).onfinish = () => element.classList.remove("flipping");
}

/** The decided chip flies from its decision line into each file that receives it. */
function fly(key) {
  const mod = STEPS[step].mod;
  if (mod === "css") {
    later(200, () => { landed[key] = true; render(true); });
    return;
  }
  const from = decider.querySelector(`.dc-row.${key} span`).getBoundingClientRect();
  for (const chip of laneEl(key).querySelectorAll(`.chip[data-mod="${mod}"]`)) {
    const fileEl = chip.closest(".file");
    flip(chip, from, 1000 * pace, 24, () => {
      chip.classList.remove("land");
      chip.style.display = "";
      fileEl.classList.add("has");
    });
    fileEl.classList.remove("glow");
    later(950 * pace, () => { void fileEl.offsetWidth; fileEl.classList.add("glow"); });
  }
  later(1000 * pace, () => { landed[key] = true; render(false); });
}

/** One step in sub-steps: lift the module, decide for webpack, fly, decide for Rolldown, fly. */
function animateStep() {
  stopTimers();
  closeDecider();
  if (!STEPS[step].mod) {
    landed = { wp: true, rd: true };
    render(false);
    if (playing) later(2600, advance);
    return;
  }
  landed = { wp: false, rd: false };
  pace = playing && FAST.has(STEPS[step].mod) ? 0.45 : 1;
  stage.classList.toggle("fast", pace < 1);
  render(false);
  const usages = DECIDE[STEPS[step].mod][0].length;
  const t = (700 + usages * 220) * pace;
  later(300 * pace, () => { openDecider(); render(false); });
  later(650 * pace, flyUsages);
  later(t + 600 * pace, () => decider.querySelector(".dc-row.wp").classList.add("show"));
  later(t + 1500 * pace, () => fly("wp"));
  later(t + 3000 * pace, () => decider.querySelector(".dc-row.rd").classList.add("show"));
  later(t + 3900 * pace, () => fly("rd"));
  later(t + 5900 * pace, () => { closeDecider(); render(false); });
  if (playing) later(t + 6700 * pace, advance);
}
function advance() {
  if (step >= STEPS.length - 1) {
    playing = false;
    render(false);
    return;
  }
  step += 1;
  animateStep();
}
/** Back, dots and ?step=N show a step in its end state, without the sub-steps. */
function jump(target) {
  stopTimers();
  pace = 1;
  stage.classList.remove("fast");
  closeDecider();
  step = Math.max(0, Math.min(STEPS.length - 1, target));
  landed = { wp: true, rd: true };
  stage.classList.add("instant");
  render(false);
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove("instant")));
}
function setPlaying(value) {
  playing = value;
  if (!playing) {
    stopTimers();
    pace = 1;
    stage.classList.remove("fast");
    closeDecider();
    landed = { wp: true, rd: true };
    render(false);
    return;
  }
  if (step >= STEPS.length - 1) jump(0);
  animateStep();
}

let suspended = false;
function watchPackVisibility() {
  let queued = false;
  const check = () => {
    queued = false;
    const shown = isShown(stage);
    if (!shown && playing) {
      // Finish the current step at once, so nothing moves while the figure is out of sight.
      suspended = true;
      setPlaying(false);
    } else if (shown && suspended) {
      suspended = false;
      if (step < STEPS.length - 1) {
        playing = true;
        step += 1;
        animateStep();
      }
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
}

function pack() {
  $("#roots").innerHTML = `<span class="roots-k">roots</span>${ROOTS.map(([id, label]) => `<span class="root-pill" data-root="${id}">${label}</span>`).join("")}`;
  buildLane("wp");
  buildLane("rd");
  measureFinalRows();
  packWidth = stage.clientWidth;
  document.fonts?.ready.then(measureFinalRows);
  watchPackVisibility();
  $("#packDots").innerHTML = STEPS.map((_, index) => `<button type="button" aria-label="Step ${index}"></button>`).join("");
  [...$("#packDots").children].forEach((dot, index) => dot.addEventListener("click", () => { setPlaying(false); jump(index); }));
  const next = () => {
    playing = false;
    if (step < STEPS.length - 1) {
      step += 1;
      animateStep();
    }
  };
  $("#packControls").addEventListener("click", (event) => {
    const act = event.target.closest("button")?.dataset.act;
    if (act === "back") { setPlaying(false); jump(step - 1); }
    if (act === "next") next();
    if (act === "play") { suspended = false; setPlaying(!playing); }
    if (act === "replay") { jump(0); setPlaying(true); }
  });
  addEventListener("keydown", (event) => {
    const rect = stage.getBoundingClientRect();
    const coveredFrom = stage.closest("section").nextElementSibling?.getBoundingClientRect().top ?? innerHeight;
    if (rect.bottom < 0 || rect.top > Math.min(innerHeight, coveredFrom)) return;
    if (event.key === "ArrowRight") next();
    else if (event.key === "ArrowLeft") { setPlaying(false); jump(step - 1); }
    else if (event.key === " ") { event.preventDefault(); setPlaying(!playing); }
  });
  const fromUrl = Number(new URLSearchParams(location.search).get("step"));
  if (fromUrl) {
    jump(fromUrl);
    return;
  }
  jump(0);
  let started = false;
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !started) {
      started = true;
      setPlaying(true);
    }
  }, { threshold: 0.45 }).observe(stage);
}

/* 05 · animated download waterfall of both median runs, one time axis */
function waterfallFigure(redraw = false) {
  const data = window.WATERFALL;
  const MAX = 2800;
  const GROUPS = [
    ["lcp", "product image · Medium → High"],
    ["html", "HTML"],
    ["css", "CSS · Highest"],
    ["js", null],
    ["font", "fonts"],
    ["img", "other images"],
    ["other", "API, other"],
  ];
  const lanes = [...document.querySelectorAll(".wf-lane")].map((lane) => {
    const side = lane.dataset.side;
    const svg = lane.querySelector("svg");
    const { rows, fcp, lcp } = data[side];
    const ordered = GROUPS.flatMap(([type]) => rows.filter((row) => row[0] === type).sort((a, b) => a[1] - b[1] || a[3] - b[3]));
    const width = Math.round(Math.min(1000, Math.max(300, lane.clientWidth || 1000)));
    const compact = width < 600;
    const labelWidth = compact ? 96 : 196;
    const imageHeight = 14;
    const lineHeight = side === "vinext" ? 0.42 : 2.2;
    const height = imageHeight + 8 + (ordered.length - 1) * lineHeight + 36;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const x = (t) => labelWidth + (t / MAX) * (width - labelWidth - 10);
    const ns = "http://www.w3.org/2000/svg";
    const make = (tag, attrs) => { const node = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); svg.append(node); return node; };
    for (let t = 0; t <= MAX; t += 500) {
      make("line", { x1: x(t), x2: x(t), y1: 0, y2: height - 20, class: "wf-grid" });
      make("text", { x: x(t), y: height - 4, class: "wf-tick", "text-anchor": "middle" }).textContent = `${t / 1000} s`;
    }
    const bars = [];
    let y = 0;
    let groupStart = 0;
    let lastType = null;
    const groupLabel = (type, top, bottom) => {
      const label = type === "js"
        ? `${compact ? "JS" : "scripts"} · ${side === "webpack" ? "Low" : "High"}`
        : compact ? { lcp: "image · Med→High", html: "HTML", css: "CSS", font: "fonts", img: "images", other: "other" }[type] : GROUPS.find(([g]) => g === type)[1];
      const count = ordered.filter((row) => row[0] === type).length;
      if (bottom - top < 6 && type !== "lcp") return;
      make("text", { x: labelWidth - 8, y: (top + bottom) / 2 + 4, class: `wf-group ${type === "js" ? `js-${side === "webpack" ? "wp" : "rd"}` : type}`, "text-anchor": "end" }).textContent = type === "lcp" || compact ? label : `${label} (${count})`;
    };
    ordered.forEach((row, index) => {
      const [type, start, response, end] = row;
      if (type !== lastType) {
        if (lastType) groupLabel(lastType, groupStart, y);
        if (lastType) y += type === "lcp" ? 0 : 3;
        groupStart = y;
        lastType = type;
      }
      const h = type === "lcp" ? imageHeight : Math.max(lineHeight * 0.9, 0.4);
      const cls = type === "js" ? `js-${side === "webpack" ? "wp" : "rd"}` : type;
      const wait = make("rect", { x: x(start), y, width: 0, height: h, class: `wf-bar wait ${cls}` });
      const load = make("rect", { x: x(response), y, width: 0, height: h, class: `wf-bar ${cls}` });
      bars.push({ start, response, end, wait, load });
      y += type === "lcp" ? imageHeight + 8 : lineHeight;
      if (index === ordered.length - 1) groupLabel(type, groupStart, y);
    });
    const marks = [["fcp", fcp, "0"], ["lcp", lcp, "4 3"]].map(([kind, t, dash]) => {
      const line = make("line", { x1: x(t), x2: x(t), y1: 0, y2: height - 18, class: `wf-mark ${kind}`, "stroke-dasharray": dash });
      return { t, line };
    });
    const image = rows.find((row) => row[0] === "lcp");
    const imageLabel = make("text", { x: x(image[3]) + 6, y: 11, class: "wf-imglabel" });
    imageLabel.textContent = compact ? `${(image[3] / 1000).toFixed(2)} s` : `product image arrives ${(image[3] / 1000).toFixed(2)} s`;
    const cursor = make("line", { x1: x(0), x2: x(0), y1: 0, y2: height - 18, class: "wf-cursor" });
    return { bars, marks, imageLabel, image, cursor, x };
  });
  const draw = (t) => {
    for (const lane of lanes) {
      for (const bar of lane.bars) {
        const waitEnd = Math.min(t, bar.response);
        bar.wait.setAttribute("width", Math.max(0, lane.x(waitEnd) - lane.x(bar.start)));
        const loadEnd = Math.min(t, bar.end);
        bar.load.setAttribute("width", Math.max(0, lane.x(loadEnd) - lane.x(bar.response)));
      }
      for (const mark of lane.marks) mark.line.classList.toggle("on", t >= mark.t);
      lane.imageLabel.classList.toggle("on", t >= lane.image[3]);
      lane.cursor.setAttribute("x1", lane.x(t));
      lane.cursor.setAttribute("x2", lane.x(t));
      lane.cursor.classList.toggle("off", t >= MAX);
    }
    $("#wfClock").textContent = `${(Math.min(t, MAX) / 1000).toFixed(2)} s`;
  };
  // Plays at a third of real time, so the image's wait is visible.
  let frame = 0;
  // The clock only advances while the figure is visible, so it resumes where it stopped.
  const play = () => {
    cancelAnimationFrame(frame);
    let t = 0;
    let last = performance.now();
    const tick = (now) => {
      if (isShown($("#wf"))) t += (now - last) / 3;
      last = now;
      draw(t | 0);
      if (t < MAX) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
  wfWidth = $("#wf").clientWidth;
  if (redraw || matchMedia("(prefers-reduced-motion: reduce)").matches) draw(MAX);
  else {
    draw(0);
    onView($("#wf"), play);
  }
  $("#wfReplay").onclick = play;
}
let wfWidth = 0;
addEventListener("resize", () => {
  const width = $("#wf").clientWidth;
  if (Math.abs(width - wfWidth) < 40) return;
  wfWidth = width;
  document.querySelectorAll(".wf-svg").forEach((svg) => (svg.innerHTML = ""));
  waterfallFigure(true);
});

/* 04 · squares and bars, filled when they scroll into view */
function onView(element, run) {
  new IntersectionObserver(([entry], observer) => {
    if (entry.isIntersecting) {
      run();
      observer.disconnect();
    }
  }, { threshold: 0.35 }).observe(element);
}
function squares() {
  for (const host of document.querySelectorAll(".squares")) {
    const count = Number(host.dataset.n);
    host.innerHTML = "<i></i>".repeat(count);
  }
  onView($("#scale"), () => {
    for (const host of document.querySelectorAll(".squares")) {
      const cells = [...host.children];
      const perTick = Math.max(1, Math.ceil(cells.length / 60));
      let index = 0;
      const tick = () => {
        for (let k = 0; k < perTick && index < cells.length; k++) cells[index++].classList.add("on");
        if (index < cells.length) requestAnimationFrame(tick);
      };
      tick();
    }
  });
}

/* Stacked sections: a section taller than the viewport sticks once its bottom reaches the viewport's bottom. */
function stack() {
  const sections = [...document.querySelectorAll(".stack > section")];
  const setStickTop = () => sections.forEach((section) => section.style.setProperty("--stick-top", `${Math.min(0, innerHeight - section.offsetHeight)}px`));
  const observer = new ResizeObserver(setStickTop);
  sections.forEach((section) => observer.observe(section));
  addEventListener("resize", setStickTop);
}

stack();
graph();
pack();
squares();
onView($("#race"), () => $("#race").classList.add("seen"));
waterfallFigure();
onView($("#rg"), () => {
  [...document.querySelectorAll(".rg-step")].forEach((item, index) => (item.style.transitionDelay = `${index * 0.9}s`));
  $("#rg").classList.add("seen");
});
