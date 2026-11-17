const $ = (selector, root = document) => root.querySelector(selector);
const TOY = window.TOY;

/** The toy shop (demo/make-app.mjs): source size in KB, direct importers, importer-set color. */
const MODULES = {
  react: { kb: 60, by: ["everything"], set: "fw" },
  _app: { kb: 3, by: ["every page"], set: "app" },
  Header: { kb: 8, by: ["_app"], set: "app" },
  Button: { kb: 2, by: ["_app", "home", "product", "cart", "reviews", "size guide"], set: "all" },
  Carousel: { kb: 26, by: ["home", "product"], set: "hp" },
  Rating: { kb: 1, by: ["home", "product"], set: "hp" },
  Price: { kb: 1.5, by: ["home", "product", "cart"], set: "hpc" },
  useCart: { kb: 2, by: ["product", "cart", "size guide"], set: "pc" },
  Gallery: { kb: 30, by: ["product"], set: "p" },
  formatDate: { kb: 0.6, by: ["product", "reviews"], set: "p" },
  product: { kb: 5, by: ["page"], set: "p" },
  home: { kb: 5, by: ["page"], set: "app" },
  cart: { kb: 5, by: ["page"], set: "app" },
  ReviewsDialog: { kb: 6, by: ["product, lazy"], set: "dlg" },
  SizeGuide: { kb: 4, by: ["product + cart, lazy"], set: "dlg" },
  SizeTable: { kb: 3, by: ["size guide"], set: "dlg" },
};
const color = (name) => `var(--s-${MODULES[name].set})`;
const kb = (value) => (value < 1 ? `${value * 1000} B` : `${value} KB`);
const chipHtml = (name, withSize = true) => `<span class="chip" style="--c:${color(name)}">${name}${withSize ? `<span class="sz">${kb(MODULES[name].kb)}</span>` : ""}</span>`;

/* 02 · module graph */
function graph() {
  const roots = [
    ["_app", "wraps every page"],
    ["home", "page"],
    ["product", "page"],
    ["cart", "page"],
    ["ReviewsDialog", "lazy, from product"],
    ["SizeGuide", "lazy, from product + cart"],
  ];
  const shared = ["react", "Header", "Button", "Carousel", "Rating", "Price", "useCart", "Gallery", "formatDate", "SizeTable"];
  $("#graph").innerHTML = `<div class="g-roots">${roots.map(([name, note]) => `<div class="g-root">${name}<small>${note}</small></div>`).join("")}</div>
    <div class="g-mods">${shared.map((name) => `<div class="mod" style="--c:${color(name)}"><span>${name}</span><span class="sz">${kb(MODULES[name].kb)}</span><span class="by-k">imported by</span><span class="by">${MODULES[name].by.map((by) => `<i>${by}</i>`).join("")}</span></div>`).join("")}</div>`;
}

/* 03 · step figure: where each module of the product page lands */
const STEPS = [
  { cap: "The product page's modules, before bundling", mod: null, wp: "Next.js makes every page an entry that depends on <code>_app</code>, and splits shared code from 20 KB up.", rd: "vinext loads <code>_app</code> and every page with <code>import()</code> from one client entry. Rolldown splits with no size floor." },
  { cap: "React · every page", mod: "react", wp: "Into the <b>framework</b> chunk, as Next.js configures it.", rd: "Into the <b>framework</b> chunk, as vinext configures it." },
  { cap: "_app · wraps every page", mod: "_app", wp: "Its own entry file.", rd: "Its own chunk." },
  { cap: "Header · only _app uses it", mod: "Header", wp: "Into <code>_app</code>.", rd: "Into <code>_app</code>." },
  { cap: "Button · 2 KB · _app, every page, both dialogs", mod: "Button", wp: "Already in <code>_app</code>, and every page loads <code>_app</code> first: <b>stays there</b>.", rd: "<code>_app</code> and the pages are separate roots, so this set gets <b>a new chunk</b>." },
  { cap: "Carousel · 26 KB · home + product", mod: "Carousel", wp: "Shared and over 20 KB: <b>a shared chunk</b>.", rd: "Set home + product: <b>a new chunk</b>." },
  { cap: "Rating · 1 KB · home + product", mod: "Rating", wp: "Same pages as Carousel: joins its chunk.", rd: "Same set as Carousel: joins its chunk." },
  { cap: "Price · 1.5 KB · home + product + cart", mod: "Price", wp: "Joins the home + product chunk and is <b>copied</b> into the cart page's file.", rd: "Set home + product + cart: <b>a new chunk</b>." },
  { cap: "useCart · 2 KB · product + cart + size guide", mod: "useCart", wp: "Under 20 KB: <b>copied</b> into the product and cart files.", rd: "Set product + cart: <b>a new chunk</b>." },
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
const ROOTS = [["_app", "_app"], ["home", "home"], ["product", "product"], ["cart", "cart"], ["reviews", "reviews dialog"], ["sizeGuide", "size guide"]];
const DECIDE = {
  react: [["_app", "home", "product", "cart", "reviews", "sizeGuide"], "framework chunk", "framework chunk"],
  _app: [["_app"], "its own entry file", "its own chunk"],
  Header: [["_app"], "into _app", "into _app"],
  Button: [["_app", "home", "product", "cart", "reviews", "sizeGuide"], "stays in _app · pages load _app first", "new chunk · _app and pages are separate roots"],
  Carousel: [["home", "product"], "shared chunk · shared and over 20 KB", "new chunk for home + product"],
  Rating: [["home", "product"], "Carousel's chunk · same pages", "Carousel's chunk · same set"],
  Price: [["home", "product", "cart"], "home + product chunk, COPY in cart", "new chunk for home + product + cart"],
  useCart: [["product", "cart", "sizeGuide"], "COPY into product and cart · under 20 KB", "new chunk for product + cart"],
  Gallery: [["product"], "into product", "into product"],
  formatDate: [["product", "reviews"], "into product · the dialog opens only there", "into product · same decision"],
  product: [["product"], "its own entry file", "its own chunk"],
  css: [[], "one stylesheet per entry", "one stylesheet per chunk"],
};

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
function equalizeRows() {
  const left = [...$("#laneWp").children];
  const right = [...$("#laneRd").children];
  [...left, ...right].forEach((cell) => (cell.style.minHeight = ""));
  left.forEach((cell, index) => {
    const height = Math.max(cell.offsetHeight, right[index].offsetHeight);
    cell.style.minHeight = right[index].style.minHeight = `${height}px`;
  });
}
addEventListener("resize", () => equalizeRows());

/** Opens the decision card right under the module's chip in the tray, so the eye stays there. */
function openDecider() {
  const mod = STEPS[step].mod;
  const [by, wp, rd] = DECIDE[mod];
  decider.innerHTML = `<div class="dc-head">${mod === "css" ? '<span class="chip" style="--c:#e86bd0">stylesheets</span>' : chipHtml(mod)}<span class="dc-by">${by.length ? "used by" : ""}</span>${by.map((root) => `<span class="root-pill slot" data-root="${root}">${ROOTS.find(([id]) => id === root)[1]}</span>`).join("")}</div>
    <div class="dc-row wp"><i class="tok wp"></i><b>webpack</b><span>→ ${wp}</span></div>
    <div class="dc-row rd"><i class="tok rd"></i><b>Rolldown</b><span>→ ${rd}</span></div>`;
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
  const box = stage.getBoundingClientRect();
  [...decider.querySelectorAll(".root-pill.slot")].forEach((slot, index) => {
    later(index * 220, () => {
      const source = $(`#roots [data-root="${slot.dataset.root}"]`);
      const from = source.getBoundingClientRect();
      const to = slot.getBoundingClientRect();
      source.classList.add("ping");
      later(700, () => source.classList.remove("ping"));
      const clone = source.cloneNode(true);
      clone.classList.add("flyer");
      clone.classList.remove("ping");
      clone.style.cssText = `left:${from.left - box.left}px;top:${from.top - box.top}px`;
      stage.append(clone);
      clone.animate(
        [
          { transform: "none" },
          { transform: `translate(${(to.left - from.left) / 2}px, ${(to.top - from.top) / 2 - 14}px) scale(1.06)`, offset: 0.5 },
          { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)` },
        ],
        { duration: 650, easing: "cubic-bezier(.45,0,.25,1)" },
      ).onfinish = () => {
        clone.remove();
        slot.classList.add("in");
      };
    });
  });
}

/** A copy of the decided chip flies from its decision line into each file that receives it. */
function fly(key) {
  const mod = STEPS[step].mod;
  const row = decider.querySelector(`.dc-row.${key}`);
  const targets = mod === "css" ? [] : [...laneEl(key).querySelectorAll(`.chip[data-mod="${mod}"]`)].map((chip) => chip.closest(".file"));
  const box = stage.getBoundingClientRect();
  const from = row.getBoundingClientRect();
  for (const fileEl of targets) {
    const to = fileEl.querySelector(".file-mods").getBoundingClientRect();
    const clone = document.createElement("span");
    clone.className = "chip flyer";
    clone.style.cssText = `--c:${color(mod)};left:${from.left - box.left + 70}px;top:${from.top - box.top}px`;
    clone.textContent = mod;
    stage.append(clone);
    const dx = to.left - from.left - 70 + Math.min(to.width - 60, fileEl.querySelectorAll('.chip:not([style*="none"])').length * 70);
    const dy = to.top - from.top;
    clone.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: `translate(${dx / 2}px, ${dy / 2 - 24}px) scale(1.08)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 1, offset: 0.88 },
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
      ],
      { duration: 1100, easing: "cubic-bezier(.45,0,.25,1)" },
    ).onfinish = () => clone.remove();
    fileEl.classList.remove("glow");
    later(950, () => { void fileEl.offsetWidth; fileEl.classList.add("glow"); });
  }
  later(targets.length ? 950 : 200, () => { landed[key] = true; render(true); });
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
  render(false);
  const usages = DECIDE[STEPS[step].mod][0].length;
  const t = 700 + usages * 220;
  later(300, () => { openDecider(); render(false); });
  later(650, flyUsages);
  later(t + 600, () => decider.querySelector(".dc-row.wp").classList.add("show"));
  later(t + 1500, () => fly("wp"));
  later(t + 3000, () => decider.querySelector(".dc-row.rd").classList.add("show"));
  later(t + 3900, () => fly("rd"));
  later(t + 5900, () => { closeDecider(); render(false); });
  if (playing) later(t + 6700, advance);
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
    closeDecider();
    landed = { wp: true, rd: true };
    render(false);
    return;
  }
  if (step >= STEPS.length - 1) jump(0);
  animateStep();
}

function pack() {
  $("#roots").innerHTML = `<span class="roots-k">roots</span>${ROOTS.map(([id, label]) => `<span class="root-pill" data-root="${id}">${label}</span>`).join("")}`;
  buildLane("wp");
  buildLane("rd");
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
    if (act === "play") setPlaying(!playing);
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
onView($("#rg"), () => {
  [...document.querySelectorAll(".rg-step")].forEach((item, index) => (item.style.transitionDelay = `${index * 0.9}s`));
  $("#rg").classList.add("seen");
});
