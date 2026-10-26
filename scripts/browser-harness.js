/* Shared browser setup for the Pepaws Porch tests (the full game and the
   quick demo): a static server for game/, a stand-in for the artifact runtime
   (window.claude: record store, user, downloads, permissions), and pages that
   collect console errors and profile-template contract warnings. */
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../game");
/* The PDF tools load from cdnjs. Point PDF_LIBS at a folder holding
   html2canvas.min.js (1.4.1) and jspdf.umd.min.js (2.5.1) to serve them
   locally; without it the tests use the network. */
const LIBS = process.env.PDF_LIBS || "";

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0].split("#")[0]));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      const type = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" }[path.extname(file)];
      res.writeHead(200, { "content-type": type || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

/* A stand-in for window.claude: db (paths, get/set, collections, orderBy,
   limit, live onSnapshot listeners), user and downloads. The store lives in
   localStorage, so it survives reloads and is shared by the tabs of one
   browser context, as the real record store is by everyone's screens. */
const MOCK = `
(() => {
  /* One store per browser context, shared by its tabs like the real record
     store: a write in one tab reaches the others' live listeners. */
  const KEY = "__mockdb";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  const store = read();
  const listeners = new Set();
  const notify = () => listeners.forEach((l) => l());
  const persist = () => { localStorage.setItem(KEY, JSON.stringify(store)); setTimeout(notify, 0); };
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const next = read();
    Object.keys(store).forEach((k) => { if (!(k in next)) delete store[k]; });
    Object.assign(store, next);
    notify();
  });
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const snap = (p) => ({ id: p.split("/").pop(), exists: p in store, data: () => clone(store[p]) });
  /* calls fn now (asynchronously) and after every change until unsubscribed */
  const watch = (fn) => {
    const l = () => { if (listeners.has(l)) fn(); };
    listeners.add(l); setTimeout(l, 0);
    return () => { listeners.delete(l); };
  };
  function doc(p) {
    return { id: p.split("/").pop(), path: p,
      get: async () => snap(p),
      set: async (d) => {
        if (window.__deny) throw { code: "not_granted" };
        if (window.__failOnce) { window.__failOnce = 0; throw { code: "unavailable" }; }
        store[p] = clone(d); persist();
      },
      update: async (d) => { if (!(p in store)) throw { code: "invalid_argument" }; Object.assign(store[p], clone(d)); persist(); },
      delete: async () => { delete store[p]; persist(); },
      onSnapshot: (next) => { let last = null; return watch(() => { const sig = JSON.stringify([p in store, store[p]]); if (sig !== last) { last = sig; next(snap(p)); } }); },
      collection: (c) => collection(p + "/" + c) };
  }
  function collection(c, order, lim) {
    const depth = c.split("/").length + 1;
    const ids = () => {
      let out = Object.keys(store).filter((k) => k.startsWith(c + "/") && k.split("/").length === depth);
      if (order) out.sort((a, b) => String(store[a][order[0]] || "").localeCompare(String(store[b][order[0]] || "")) * (order[1] === "desc" ? -1 : 1));
      return lim ? out.slice(0, lim) : out;
    };
    const result = (list) => { const docs = list.map(snap); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [] }; };
    return { path: c,
      doc: (id) => doc(c + "/" + (id || Math.random().toString(36).slice(2))),
      orderBy: (f, dir) => collection(c, [f, dir || "asc"], lim),
      limit: (n) => collection(c, order, n),
      get: async () => result(ids()),
      onSnapshot: (next) => {
        let last = null;
        if (window.__subs !== undefined) window.__subs++;
        const stop = watch(() => { const list = ids(), sig = JSON.stringify(list.map((k) => [k, store[k]])); if (sig !== last) { last = sig; next(result(list)); } });
        return () => { if (window.__subs !== undefined) window.__subs--; stop(); };
      } };
  }
  window.__subs = 0;
  window.__downloads = [];
  const caps = {
    db: { doc, collection },
    user: { id: async () => "applicant-1", canEdit: async () => true, isOwner: async () => true },
    downloads: { save: async (r) => { window.__downloads.push(r); return { status: "saved" }; } },
    permissions: { state: async () => (window.__deny ? "denied" : "granted"), request: async () => ({}),
                   manage: async () => { window.__deny = false; } }
  };
  window.__store = store;
  window.claude = { use: async (n) => (window.__noCaps ? null : caps[n] || null) };
})();`;

/* Returns newPage(browser, base, opts) for one page of the game. Problems go into `errors`. */
function newPageFactory(errors, file) {
  return async function newPage(browser, base, { mock = true, offline = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 520, height: 960 }, acceptDownloads: true });
    if (mock) await ctx.addInitScript(MOCK);
    if (offline) await ctx.route("https://cdnjs.cloudflare.com/**", (r) => r.abort());
    else if (LIBS) await ctx.route("https://cdnjs.cloudflare.com/**", (r) =>
      r.fulfill({ path: path.join(LIBS, path.basename(new URL(r.request().url()).pathname)), contentType: "application/javascript" }));
    const page = await ctx.newPage();
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" && !/fonts\.(googleapis|gstatic)\.com|ERR_/.test(t)) errors.push("console: " + t);
      if (/\[GenStay\] Unknown field/.test(t)) errors.push("contract: " + t);
      if (/\[GenStay\] PDF/.test(t)) errors.push("pdf: " + t);
    });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.goto(base + "/" + file);
    await page.waitForSelector("#begin");
    return { ctx, page };
  };
}

/* Story-data checks that don't depend on the path a player takes (both pages):
   the step has one name, and a choice on the days before the fall that mentions
   it names it, because the line introducing it is on the screen before. */
async function storyDataProblems(page) {
  return page.evaluate(() => {
    const out = [], all = [];
    const walk = (x, where) => {
      if (typeof x === "string") all.push([where, x]);
      else if (Array.isArray(x)) x.forEach((y, i) => walk(y, where + "[" + i + "]"));
      else if (x && typeof x === "object") Object.keys(x).forEach((k) => walk(x[k], where + "." + k));
    };
    walk(DAYS, "DAYS");
    if (typeof SCENARIO_POOLS !== "undefined") walk(SCENARIO_POOLS, "SCENARIO_POOLS");
    if (typeof REDEMPTION_STORIES !== "undefined") walk(REDEMPTION_STORIES, "REDEMPTION_STORIES");
    all.forEach(([where, text]) => { if (/\bback step\b/i.test(text)) out.push(where + ': says "back step"; the story calls it the brick step'); });
    DAYS.forEach((d) => d.steps.filter((s) => s.t === "choice").forEach((s) => {
      [s.prompt].concat(s.options.map((o) => o.text)).forEach((text) => {
        if (/\bthe neighbour\b/i.test(text)) out.push("Day " + d.n + ': "' + text + '" says "the neighbour" although no neighbour has appeared on every path to it; say "a neighbour"');
      });
    }));
    DAYS.filter((d) => d.n < 11).forEach((d) => d.steps.filter((s) => s.t === "choice").forEach((s) => {
      [s.prompt].concat(s.options.map((o) => o.text)).forEach((text) => {
        if (/\bstep\b/i.test(text) && !/brick step/i.test(text)) out.push("Day " + d.n + ': "' + text + '" mentions the step without naming it, so it has nothing to refer to on its own screen');
      });
    }));
    return out;
  });
}

module.exports = { chromium, serve, MOCK, newPageFactory, storyDataProblems };
