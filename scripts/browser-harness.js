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
   limit), user and downloads. Shared across reloads through sessionStorage. */
const MOCK = `
(() => {
  const KEY = "__mockdb";
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  const store = load();
  const persist = () => sessionStorage.setItem(KEY, JSON.stringify(store));
  const snap = (p) => ({ id: p.split("/").pop(), exists: p in store, data: () => store[p] ? JSON.parse(JSON.stringify(store[p])) : undefined });
  function doc(p) {
    return { id: p.split("/").pop(), path: p,
      get: async () => snap(p),
      set: async (d) => {
        if (window.__deny) throw { code: "not_granted" };
        if (window.__failOnce) { window.__failOnce = 0; throw { code: "unavailable" }; }
        store[p] = JSON.parse(JSON.stringify(d)); persist();
      },
      update: async (d) => { if (!(p in store)) throw { code: "invalid_argument" }; Object.assign(store[p], d); persist(); },
      delete: async () => { delete store[p]; persist(); },
      collection: (c) => collection(p + "/" + c) };
  }
  function collection(c, order, lim) {
    const depth = c.split("/").length + 1;
    return { path: c,
      doc: (id) => doc(c + "/" + (id || Math.random().toString(36).slice(2))),
      orderBy: (f, dir) => collection(c, [f, dir || "asc"], lim),
      limit: (n) => collection(c, order, n),
      get: async () => {
        let ids = Object.keys(store).filter((k) => k.startsWith(c + "/") && k.split("/").length === depth);
        if (order) ids.sort((a, b) => String(store[a][order[0]] || "").localeCompare(String(store[b][order[0]] || "")) * (order[1] === "desc" ? -1 : 1));
        if (lim) ids = ids.slice(0, lim);
        const docs = ids.map(snap);
        return { docs, size: docs.length, empty: !docs.length };
      } };
  }
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

module.exports = { chromium, serve, MOCK, newPageFactory };
