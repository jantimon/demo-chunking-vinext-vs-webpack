/* 07 · request cost: every request runs through the same browser code; boxes heat up with the CPU it costs */
(() => {
  const CR = "https://source.chromium.org/chromium/chromium/src/+/main:";
  const WK = "https://github.com/WebKit/WebKit/blob/main/";
  const APPLE = "https://developer.apple.com/documentation/";
  const cr = (path) => [path.split("/").pop(), CR + path];
  const wk = (path) => [path.split("/").pop(), WK + path];
  const MOJO = [cr("mojo/core/ipcz_driver/transport.cc"), cr("third_party/ipcz/src/ipcz/node_link.cc")];
  const CR_LOOP = [cr("base/task/sequence_manager/sequence_manager_impl.cc"), cr("base/message_loop/message_pump_apple.mm")];
  const WK_IPC = [wk("Source/WebKit/Platform/IPC/Connection.cpp"), wk("Source/WebKit/Platform/IPC/cocoa/ConnectionCocoa.mm")];
  const WK_LOOP = [wk("Source/WTF/wtf/RunLoop.cpp")];
  const INSPECTOR = "Playwright drives WebKit through its inspector, which reports every request. Safari does not run it, so it is not counted.";

  // us: CPU per extra JS or CSS file in µs (slope over five builds). m: measured ms in the webpack and vinext profiles (median of 6 loads).
  const BROWSERS = {
    chromium: {
      label: "Chromium 156",
      files: { webpack: { js: 87, css: 94 }, vinext: { js: 696, css: 184 } },
      bands: [
        { name: "Page process", boxes: [
          { n: "IPC (Mojo)", us: 154, m: [73, 179], d: "Messages to and from the browser and network processes: request start, response head, body data, completion.", src: MOJO },
          { n: "Event loop", us: 87, m: [61, 126], d: "Posting and running the tasks that each message creates.", src: CR_LOOP },
          { n: "URL + origin", us: 56, m: [11, 57], d: "Parsing each URL (blink::KURL) and checking its origin (SecurityOrigin).", src: [cr("third_party/blink/renderer/platform/weborigin/kurl.cc"), cr("third_party/blink/renderer/platform/weborigin/security_origin.cc")] },
          { n: "Resource loading", us: 50, m: [12, 50], d: "Blink's ResourceFetcher and ResourceLoader start, track and finish each request.", src: [cr("third_party/blink/renderer/platform/loader/fetch/resource_fetcher.cc"), cr("third_party/blink/renderer/platform/loader/fetch/resource_loader.cc"), cr("third_party/blink/renderer/platform/loader/fetch/url_loader/background_url_loader.cc")] },
          { n: "Response delivery", us: 22, m: [3, 19], d: "Taking the response head and body from the network process.", src: [cr("third_party/blink/renderer/platform/loader/fetch/url_loader/resource_request_sender.cc"), cr("third_party/blink/renderer/platform/loader/fetch/response_body_loader.cc")] },
        ] },
        { name: "Browser process", boxes: [
          { n: "Event loop", us: 112, m: [43, 120], d: "Waking the UI and IO threads for each request.", src: CR_LOOP, note: "Electron sends each request through the browser process (ProxyingURLLoaderFactory). Chrome likely does less work here; we did not measure Chrome itself." },
          { n: "IPC (Mojo)", us: 71, m: [39, 88], d: "Passing the page's requests on to the network process.", src: [["proxying_url_loader_factory.cc", "https://github.com/electron/electron/blob/main/shell/browser/net/proxying_url_loader_factory.cc"], ...MOJO], note: "Electron sends each request through the browser process (ProxyingURLLoaderFactory). Chrome likely does less work here; we did not measure Chrome itself." },
          { n: "URL + cookies", us: 16, m: [5, 16], d: "URL parsing, origin checks and cookie bookkeeping.", src: [cr("url/origin.cc")] },
        ] },
        { name: "Network process", boxes: [
          { n: "IPC (Mojo)", us: 92, m: [25, 89], d: "Sending response head, body and completion to the page, and notifications to the browser process.", src: MOJO },
          { n: "Socket + HTTP/2", us: 52, m: [22, 58], d: "Reading from the socket and splitting it into HTTP/2 streams. All requests share one connection.", src: [cr("net/socket/tcp_socket_posix.cc"), cr("net/spdy/spdy_session.cc"), cr("net/spdy/spdy_stream.cc")] },
          { n: "URLLoader", us: 28, m: [10, 30], d: "network::URLLoader hands each response to the page.", src: [cr("services/network/url_loader.cc")] },
          { n: "URL + origin", us: 22, m: [2, 20], d: "GURL parsing and url::Origin checks.", src: [cr("url/gurl.cc"), cr("url/origin.cc")] },
          { n: "Request setup", us: 14, m: [5, 17], d: "CORS checks, the loader and the HTTP transaction for each request.", src: [cr("services/network/cors/cors_url_loader.cc"), cr("services/network/url_loader_factory.cc"), cr("net/http/http_network_transaction.cc")] },
          { n: "Event loop", us: 14, m: [7, 17], d: "Posting and running tasks on the network threads.", src: CR_LOOP },
          { n: "Cookies + cache", us: 11, m: [4, 13], d: "Cookie lookup and the HTTP cache transaction for each request.", src: [cr("net/cookies/cookie_monster.cc"), cr("net/http/http_cache_transaction.cc")] },
          { n: "Brotli", us: 11, m: [12, 22], d: "Unpacking each compressed response. Also grows with the bytes.", src: [cr("net/filter/brotli_source_stream.cc")] },
          { n: "Other", us: 46, m: [16, 47], d: "Network code spread over many functions, none large on its own.", src: [] },
        ] },
      ],
      flat: [
        { n: "JS parse + compile", m: [267, 254] },
        { n: "JS execution", m: [165, 175] },
        { n: "Layout + paint", m: [169, 159] },
        { n: "CSS + style", m: [56, 60] },
        { n: "Garbage collection", m: [49, 148], hot: true, d: "V8's major garbage collection runs on vinext and not on webpack. It is a step, not a cost per request: a webpack build with 568 files triggers it too, one with 213 files does not." },
        { n: "Module loader", m: [0, 33], d: "Only module scripts use it: vinext's 576. webpack's scripts are classic scripts." },
      ],
    },
    webkit: {
      label: "WebKit",
      files: { webpack: { js: 86, css: 94 }, vinext: { js: 695, css: 184 } },
      bands: [
        { name: "Page process", boxes: [
          { n: "IPC", us: 76, m: [88, 141], d: "Messages to and from the network and UI processes for each request.", src: WK_IPC },
          { n: "URL + origin", us: 28, m: [12, 31], d: "Parsing each URL and checking its origin.", src: [wk("Source/WTF/wtf/URL.cpp"), wk("Source/WebCore/page/SecurityOrigin.cpp")] },
          { n: "Resource loading", us: 24, m: [18, 33], d: "CachedResourceLoader and WebResourceLoader start and finish each request.", src: [wk("Source/WebCore/loader/cache/CachedResourceLoader.cpp"), wk("Source/WebKit/WebProcess/Network/WebLoaderStrategy.cpp"), wk("Source/WebKit/WebProcess/Network/WebResourceLoader.cpp")] },
          { n: "HTML parser", us: 12, m: [2, 12], d: "Parser work for each script and link tag.", src: [wk("Source/WebCore/html/parser/HTMLDocumentParser.cpp")] },
          { n: "Other", us: 35, m: [33, 59], d: "Code spread over many functions, none large on its own.", src: [] },
          { n: "Playwright only", us: 153, m: [76, 183], excl: true, d: INSPECTOR, src: [wk("Source/WebCore/inspector/agents/InspectorNetworkAgent.cpp")] },
        ] },
        { name: "UI process", boxes: [
          { n: "IPC", us: 32, m: [91, 113], d: "Messages between the UI process and the other two.", src: WK_IPC },
          { n: "Event loop", us: 21, m: [95, 111], d: "Run loop wake-ups.", src: WK_LOOP },
          { n: "Other", us: 29, m: [29, 52], d: "Code spread over many functions, none large on its own.", src: [] },
          { n: "Playwright only", us: 105, m: [30, 102], excl: true, d: INSPECTOR, src: [wk("Source/WebCore/inspector/agents/InspectorNetworkAgent.cpp")] },
        ] },
        { name: "Network process", boxes: [
          { n: "Connection object", us: 323, m: [123, 348], d: "Network.framework builds a connection object for every request: protocol stack set-up and a new HTTP/2 stream, although all requests share one connection.", src: [["Network.framework (closed source)", APPLE + "network"]] },
          { n: "NSURLSession task", us: 208, m: [51, 201], d: "The NSURLSession task for each request and WebKit's delegate callbacks.", src: [wk("Source/WebKit/NetworkProcess/cocoa/NetworkSessionCocoa.mm"), wk("Source/WebKit/NetworkProcess/cocoa/NetworkDataTaskCocoa.mm"), ["URLSession (closed source)", APPLE + "foundation/urlsession"]] },
          { n: "IPC", us: 131, m: [45, 139], d: "Sending response head, body and completion to the page process.", src: WK_IPC },
          { n: "Socket + HTTP/2", us: 73, m: [40, 86], d: "Socket reads, HTTP/2 frames, HTTP messages and TLS.", src: [["Network.framework (closed source)", APPLE + "network"]] },
          { n: "WebKit loader", us: 61, m: [20, 62], d: "NetworkResourceLoader and its request and response objects.", src: [wk("Source/WebKit/NetworkProcess/NetworkResourceLoader.cpp")] },
          { n: "Event loop", us: 60, m: [28, 66], d: "Run loop and dispatch queue work.", src: WK_LOOP },
          { n: "Notifications", us: 57, m: [1, 43], d: "Each response read posts an NSNotification, and the lookup scans the registered observers. Observers grow with the requests in flight, so this grows faster than the request count: 1 ms at 180 files, 16 ms at 567, 43 ms at 879.", src: [["NotificationCenter (closed source)", APPLE + "foundation/notificationcenter"]] },
          { n: "Cookies", us: 25, m: [8, 26], d: "A cookie lookup for each request (NSHTTPCookieStorage).", src: [["HTTPCookieStorage (closed source)", APPLE + "foundation/httpcookiestorage"]] },
          { n: "URL + logging", us: 23, m: [14, 28], d: "URL parsing and os_log calls.", src: [wk("Source/WTF/wtf/URL.cpp")] },
          { n: "Other", us: 40, m: [14, 42], d: "Code spread over many functions, none large on its own.", src: [] },
        ] },
      ],
      flat: [
        { n: "JS parse + compile", m: [381, 359] },
        { n: "JS execution", m: [248, 225] },
        { n: "Layout + paint", m: [154, 148] },
        { n: "CSS + style", m: [199, 263], hot: true, d: "Higher on vinext, but it does not follow the number of stylesheets: a build with 208 stylesheets and one with 78 take about the same time. The cause is unknown." },
        { n: "Module loader", m: [0, 6], d: "Only module scripts use it: vinext's 576. webpack's scripts are classic scripts." },
      ],
    },
  };

  const figure = document.querySelector("#reqcost");
  if (!figure) return;
  const NS = "http://www.w3.org/2000/svg";
  const el = (parent, tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  };
  const HEAT = [[0, [58, 58, 70]], [0.12, [138, 80, 44]], [0.5, [255, 106, 43]], [1, [255, 214, 130]]];
  const heatRgb = (share) => {
    const value = Math.max(0, Math.min(1, share));
    const upper = HEAT.findIndex(([stop]) => stop >= value);
    if (upper <= 0) return HEAT[0][1];
    const [s0, c0] = HEAT[upper - 1];
    const [s1, c1] = HEAT[upper];
    const mix = (value - s0) / (s1 - s0);
    return c0.map((channel, index) => Math.round(channel + (c1[index] - channel) * mix));
  };
  const READ = 2000;
  const RATE = 140;
  const TRAVEL = 2200;
  const W = 400;
  const X0 = 34;
  const COL_GAP = 8;
  const COL_W = (W - 4 - X0 - 2 * COL_GAP) / 3;
  const BOX_H = 46;
  const ms = (value) => (value >= 100 ? Math.round(value) : value >= 10 ? Math.round(value) : value.toFixed(1)).toString();
  const total = (files) => files.js + files.css;
  const perRequest = (browser) => browser.bands.flatMap((band) => band.boxes).filter((box) => !box.excl).reduce((sum, box) => sum + box.us, 0);

  let current = "chromium";
  let panels = [];
  let END = 0;

  function buildPanel(side, browser) {
    const panel = figure.querySelector(`.rc-panel[data-side="${side}"]`);
    const svg = panel.querySelector(".rc-svg");
    svg.replaceChildren();
    const files = browser.files[side];
    const count = total(files);
    const vinextCount = total(browser.files.vinext);
    const maxMs = Math.max(...browser.bands.flatMap((band) => band.boxes.filter((box) => !box.excl).map((box) => (box.us * vinextCount) / 1000)));
    const rail = el(svg, "line", { x1: 14, x2: 14, y1: 40, y2: 40, class: "rc-rail" });
    const queue = {};
    [["js", 26, "scripts"], ["css", 210, "stylesheets"]].forEach(([kind, x, label]) => {
      el(svg, "rect", { x, y: 0, width: 184, height: 34, rx: 9, class: "gt-basket" });
      el(svg, "rect", { x: x + 10, y: 10, width: 26, height: 14, rx: 3, class: `gt-chip ${kind}` });
      el(svg, "text", { x: x + 23, y: 20.5, "text-anchor": "middle", class: `gt-chipt ${kind}` }, kind.toUpperCase());
      const line = el(svg, "text", { x: x + 44, y: 22.5 });
      queue[kind] = el(line, "tspan", { class: "rc-qn" }, String(files[kind]));
      el(line, "tspan", { class: "rc-ql", dx: 6 }, `${label} left`);
    });
    let y = 48;
    const bands = browser.bands.map((band, bandIndex) => {
      const rows = Math.ceil(band.boxes.length / 3);
      const height = 30 + rows * (BOX_H + COL_GAP);
      el(svg, "rect", { x: 26, y, width: W - 26, height, rx: 12, class: "rc-band" });
      el(svg, "text", { x: X0, y: y + 19, class: "rc-bandname" }, band.name);
      const sum = el(svg, "text", { x: W - 10, y: y + 19, "text-anchor": "end", class: "rc-bandsum" }, "0 ms");
      const boxes = band.boxes.map((box, index) => {
        const bx = X0 + (index % 3) * (COL_W + COL_GAP);
        const by = y + 28 + Math.floor(index / 3) * (BOX_H + COL_GAP);
        const group = el(svg, "g", { class: `rc-box${box.excl ? " excl" : ""}`, tabindex: 0, role: "button", "aria-label": `${band.name}, ${box.n}: ${box.us} µs per request` });
        const rect = el(group, "rect", { x: bx, y: by, width: COL_W, height: BOX_H, rx: 8 });
        el(group, "text", { x: bx + 8, y: by + 17, class: "rc-bn" }, box.n);
        const value = el(group, "text", { x: bx + 8, y: by + 37, class: "rc-bv" }, box.excl ? "–" : "0 ms");
        el(group, "text", { x: bx + COL_W - 7, y: by + 37, "text-anchor": "end", class: "rc-bu" }, `${box.us} µs`);
        group.addEventListener("pointerenter", () => tip.show(group, browser, band, box));
        group.addEventListener("pointerleave", () => tip.later());
        group.addEventListener("focus", () => tip.show(group, browser, band, box));
        group.addEventListener("blur", () => tip.later());
        group.addEventListener("click", () => tip.show(group, browser, band, box, true));
        return { box, rect, value };
      });
      const top = y;
      y += height + 8;
      return { top, boxes, sum, index: bandIndex };
    });
    const railEnd = y - 8;
    el(svg, "text", { x: 26, y: y + 14, class: "rc-flathead" }, "Not a cost per request · measured in this build");
    y += 22;
    browser.flat.forEach((item, index) => {
      const bx = X0 - 8 + (index % 3) * (COL_W + COL_GAP + 3);
      const by = y + Math.floor(index / 3) * 44;
      const group = el(svg, "g", { class: `rc-flat${item.hot ? " hot" : ""}`, tabindex: item.d ? 0 : -1, role: item.d ? "button" : "img", "aria-label": `${item.n}: ${item.m[side === "webpack" ? 0 : 1]} ms` });
      el(group, "rect", { x: bx, y: by, width: COL_W + 3, height: 38, rx: 7 });
      el(group, "text", { x: bx + 8, y: by + 15, class: "rc-fn" }, item.n);
      el(group, "text", { x: bx + 8, y: by + 31, class: "rc-fv" }, `${item.m[side === "webpack" ? 0 : 1]} ms`);
      if (item.d) {
        group.addEventListener("pointerenter", () => tip.flat(group, browser, item));
        group.addEventListener("pointerleave", () => tip.later());
        group.addEventListener("focus", () => tip.flat(group, browser, item));
        group.addEventListener("blur", () => tip.later());
        group.addEventListener("click", () => tip.flat(group, browser, item, true));
      }
    });
    y += Math.ceil(browser.flat.length / 3) * 44;
    svg.setAttribute("viewBox", `0 0 ${W} ${y}`);
    const layer = el(svg, "g");
    const travelPx = railEnd - 40;
    const shares = bands.map((band) => (band.top + 6 - 40) / travelPx);
    const done = READ + ((count - 1) / RATE) * 1000 + TRAVEL;
    return { side, browser, files, count, vinextCount, maxMs, rail, railEnd, queue, bands, shares, layer, pool: [], done, totalNode: panel.querySelector(".rc-total") };
  }

  const passed = (time, share, count) => Math.max(0, Math.min(count, Math.floor(((time - READ - TRAVEL * share) * RATE) / 1000) + 1));
  const isCss = (index, view) => Math.floor(((index + 1) * view.files.css) / view.count) > Math.floor((index * view.files.css) / view.count);

  function chip(view, index, kind) {
    let node = view.pool[index];
    if (!node) node = view.pool[index] = el(view.layer, "rect", { x: -7, y: -4.5, width: 14, height: 9, rx: 2 });
    node.setAttribute("class", `gt-chip ${kind}`);
    node.style.display = "";
    return node;
  }

  function render(time) {
    for (const view of panels) {
      const sent = passed(time, 0, view.count);
      const cssSent = Math.floor((sent * view.files.css) / view.count);
      view.queue.js.textContent = String(view.files.js - (sent - cssSent));
      view.queue.css.textContent = String(view.files.css - cssSent);
      let all = 0;
      view.bands.forEach((band, bandIndex) => {
        const through = passed(time, view.shares[bandIndex], view.count);
        let sum = 0;
        for (const { box, rect, value } of band.boxes) {
          if (box.excl) continue;
          const spent = (through * box.us) / 1000;
          sum += spent;
          const [r, g, b] = heatRgb(spent / view.maxMs);
          rect.style.stroke = through ? `rgb(${r},${g},${b})` : "";
          rect.style.fill = through ? `rgb(${r} ${g} ${b} / ${0.08 + 0.3 * Math.min(1, spent / view.maxMs)})` : "";
          value.textContent = `${ms(spent)} ms`;
        }
        band.sum.textContent = `${ms(sum)} ms`;
        all += sum;
      });
      const arrived = passed(time, 1, view.count);
      const [r, g, b] = heatRgb(arrived / view.vinextCount);
      view.rail.setAttribute("y2", String(sent ? view.railEnd : 40));
      view.rail.style.stroke = `rgb(${r},${g},${b})`;
      view.rail.style.strokeWidth = String(2 + 5 * (arrived / view.vinextCount));
      let used = 0;
      const first = Math.max(0, Math.ceil(((time - READ - TRAVEL) * RATE) / 1000));
      for (let index = first; index < sent; index++) {
        const share = (time - READ - (index / RATE) * 1000) / TRAVEL;
        if (share < 0 || share >= 1) continue;
        chip(view, used++, isCss(index, view) ? "css" : "js").setAttribute("transform", `translate(14 ${40 + share * (view.railEnd - 40)})`);
      }
      for (let index = used; index < view.pool.length; index++) view.pool[index].style.display = "none";
      view.totalNode.innerHTML = `<b>${Math.round(all)} ms</b> CPU for <span>${sent} of ${view.count} requests</span>`;
    }
    const cap = figure.querySelector(".rc-cap");
    const [wp, vx] = panels;
    const extra = (perRequest(wp.browser) * (vx.count - wp.count)) / 1000;
    const html = time >= END
      ? `<span>${vx.count - wp.count} more requests: <b>+${Math.round(extra)} ms CPU</b> in ${wp.browser.label}</span>`
      : "Each chip is one request, a script or a stylesheet. Each box adds its cost per request";
    if (cap.innerHTML !== html) cap.innerHTML = html;
  }

  const tipNode = figure.querySelector(".rc-tip");
  const tip = {
    timer: 0,
    pinned: false,
    place(group, html, pin) {
      clearTimeout(this.timer);
      if (pin) this.pinned = true;
      tipNode.innerHTML = html;
      tipNode.hidden = false;
      const box = group.getBoundingClientRect();
      const host = figure.getBoundingClientRect();
      const width = tipNode.offsetWidth;
      const left = Math.max(8, Math.min(host.width - width - 8, box.left - host.left + box.width / 2 - width / 2));
      const below = box.bottom - host.top + 8;
      const above = box.top - host.top - tipNode.offsetHeight - 8;
      tipNode.style.left = `${left}px`;
      tipNode.style.top = `${box.bottom + tipNode.offsetHeight + 16 > innerHeight && above > 0 ? above : below}px`;
    },
    show(group, browser, band, box, pin) {
      const per = perRequest(browser);
      const wpCount = total(browser.files.webpack);
      const vxCount = total(browser.files.vinext);
      const links = box.src.length ? `<p class="rc-src">Source: ${box.src.map(([name, href]) => `<a href="${href}" target="_blank" rel="noopener"><code>${name}</code></a>`).join(" · ")}</p>` : "";
      const cost = box.excl
        ? `<p class="rc-row">${box.us} µs per request in this test, 0 in Safari</p>`
        : `<p class="rc-big">${box.us} µs per request · <b>${Math.round((box.us / per) * 100)} %</b> of the ${(per / 1000).toFixed(2)} ms one request costs</p>
           <p class="rc-row"><span class="wp-t">webpack</span> ${wpCount} × ${box.us} µs = ${ms((wpCount * box.us) / 1000)} ms · <span class="rd-t">vinext</span> ${vxCount} × ${box.us} µs = ${ms((vxCount * box.us) / 1000)} ms</p>`;
      this.place(group, `<p class="rc-tk">${browser.label} · ${band.name}</p><p class="rc-th">${box.n}</p><p>${box.d}</p>${cost}
        <p class="rc-row rc-faint">Whole profile: webpack ${box.m[0]} ms, vinext ${box.m[1]} ms</p>${box.note ? `<p class="rc-note">${box.note}</p>` : ""}${links}`, pin);
    },
    flat(group, browser, item, pin) {
      this.place(group, `<p class="rc-tk">${browser.label} · not a cost per request</p><p class="rc-th">${item.n}</p><p>${item.d}</p><p class="rc-row"><span class="wp-t">webpack</span> ${item.m[0]} ms · <span class="rd-t">vinext</span> ${item.m[1]} ms</p>`, pin);
    },
    later() {
      if (this.pinned) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => (tipNode.hidden = true), 250);
    },
    hide() {
      this.pinned = false;
      clearTimeout(this.timer);
      tipNode.hidden = true;
    },
  };
  tipNode.addEventListener("pointerenter", () => clearTimeout(tip.timer));
  tipNode.addEventListener("pointerleave", () => tip.later());
  document.addEventListener("keydown", (event) => event.key === "Escape" && tip.hide());
  document.addEventListener("pointerdown", (event) => {
    if (!tipNode.contains(event.target) && !event.target.closest?.(".rc-box, .rc-flat")) tip.hide();
  });

  function build() {
    const browser = BROWSERS[current];
    panels = ["webpack", "vinext"].map((side) => buildPanel(side, browser));
    END = Math.max(...panels.map((view) => view.done)) + 200;
    figure.querySelectorAll(".rc-tab").forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.browser === current)));
  }

  let frame = 0;
  let clock = 0;
  function play() {
    cancelAnimationFrame(frame);
    clock = 0;
    let last = performance.now();
    const tick = (now) => {
      if (isShown(figure)) clock += Math.min(64, now - last);
      last = now;
      render(Math.min(clock, END));
      if (clock < END) frame = requestAnimationFrame(tick);
    };
    render(0);
    frame = requestAnimationFrame(tick);
  }
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const params = new URLSearchParams(location.search);
  if (params.get("rc") === "webkit") current = "webkit";
  const frozen = Number(params.get("rct"));
  const start = () => (still ? render(END) : frozen ? render(Math.min(frozen, END)) : play());
  figure.querySelectorAll(".rc-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      if (tab.dataset.browser === current) return;
      current = tab.dataset.browser;
      tip.hide();
      build();
      start();
    }),
  );
  figure.querySelector(".rc-replay").addEventListener("click", () => {
    tip.hide();
    still ? render(END) : play();
  });
  build();
  render(frozen ? Math.min(frozen, END) : still ? END : 0);
  if (!still && !frozen) onView(figure, play);
})();
