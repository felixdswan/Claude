/* Automated checks for the GenStay app, in a real browser at iPhone size.

   Serves app/ over HTTP, then:
     - checks Home, the Logbook tallies and filters against the demo week
     - logs a task (and the missing-name error), marks one done, confirms one
       as the host, removes one and undoes it, and checks the hours move
     - schedules a weekly task from the calendar and finds it next week
     - sends a message on Contact Us and waits for the reply
     - reloads to check changes persist, then resets the demo
     - screenshots each screen on a phone and the framed view on a desktop

   Usage: node scripts/test-app.js [outdir]   (default: /tmp/genstay-app-out) */
const { chromium, devices } = require("/opt/node22/lib/node_modules/playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../app");
const OUT = process.argv[2] || "/tmp/genstay-app-out";
fs.mkdirSync(OUT, { recursive: true });

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0].split("#")[0]));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

let failures = 0;
function check(ok, what) {
  console.log((ok ? "  ok   " : "  FAIL ") + what);
  if (!ok) failures++;
}

(async () => {
  const srv = await serve();
  const url = `http://localhost:${srv.address().port}/genstay-app.html`;
  const browser = await chromium.launch();
  const errors = [];

  /* ---------- phone ---------- */
  const phone = await browser.newContext({ ...devices["iPhone 14"], reducedMotion: "reduce" });
  const page = await phone.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForTimeout(400);

  const text = async (sel) => (await page.locator(sel).first().textContent()).trim();
  const names = (sel) => page.locator(sel + " .row .name").allInnerTexts();
  const tap = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(120); };
  const toast = () => text("#toastText");

  console.log("Home");
  check(await text("#homeHours") === "3.5", "3.5 hours contributed this week");
  check(await text("#homeTarget") === "18", "out of 18 hours");
  check(JSON.stringify(await names("#dayList")) === JSON.stringify(["Prepare dinner", "Take bins out", "Dust"]), "today's tasks: what's left first");
  check(JSON.stringify(await names("#overdueList")) === JSON.stringify(["Mow lawn"]), "Mow lawn is overdue");
  await page.screenshot({ path: path.join(OUT, "01-home.png") });
  await tap('[data-day="2026-10-14"]');
  check(await text("#dayTitle") === "Tomorrow’s Tasks", "picking Wednesday shows tomorrow's tasks");
  check(JSON.stringify(await names("#dayList")) === JSON.stringify(["Grocery shop", "Bring bins in"]), "Wednesday's tasks");
  await tap('[data-day="2026-10-13"]');

  console.log("Logbook");
  await tap('.tab[data-tab="logbook"]');
  check(await text("#logHours") === "3.5" && await text("#logDone") === "2" && await text("#logTotal") === "10", "tallies read 3.5/18 hours and 2/10 tasks");
  const rows = await names("#logList");
  check(rows.length === 10 && rows[0] === "Mow lawn" && rows[1] === "Dust" && rows[3] === "Prepare dinner", "ten tasks, in the mockup's order");
  const pills = await page.locator("#logList .pill").allInnerTexts();
  check(pills.slice(0, 4).join("|") === "Overdue|Confirmed|Awaiting review|Upcoming", "status pills match");
  await page.screenshot({ path: path.join(OUT, "02-logbook.png") });
  await tap('.chip[data-filter="done"]');
  check((await names("#logList")).length === 2, "Completed shows 2");
  await tap('.chip[data-filter="awaiting"]');
  check(JSON.stringify(await names("#logList")) === JSON.stringify(["Take bins out"]), "Awaiting review shows Take bins out");
  await tap('.chip[data-filter="all"]');

  console.log("Log a Task");
  await tap("#logBtn");
  await page.waitForTimeout(450);
  check(await page.locator("#logSheet").isVisible(), "the sheet opens");
  check(await text("#dateVal") === "Tuesday, 13 October 2026" && await text("#durVal") === "45 minutes", "defaults to today, 45 minutes");
  await page.screenshot({ path: path.join(OUT, "03-log-a-task.png") });
  await tap("#saveBtn");
  check(await page.locator("#nameErr").isVisible(), "saving without a name explains what's missing");
  await page.selectOption("#fName", "Water the garden");
  check(await text("#durVal") === "30 minutes", "picking a task sets its usual time");
  await page.locator(".switch-row").click();
  check(await text("#repeatHint") === "Happens once, on Tue, 13 Oct.", "repeat can be switched off");
  await tap("#saveBtn");
  await page.waitForTimeout(500);
  check(/Margaret will review it/.test(await toast()), "toast: logged for review");
  check(await text("#logHours") === "4" && await text("#logDone") === "3" && await text("#logTotal") === "11", "hours 4, tasks 3/11");

  console.log("A task's sheet");
  await tap('#logList [data-open="s1@2026-10-12"]');
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, "04-task-overdue.png") });
  await page.selectOption("#spent", "60");
  await tap('[data-act="done"]');
  check((await page.locator("#infoBody .pill").innerText()) === "Awaiting review", "Mow lawn marked done");
  check(await text("#logHours") === "5" && await text("#logDone") === "4", "hours 5, tasks 4/11");
  await tap('[data-act="confirm"]');
  check((await page.locator("#infoBody .pill").innerText()) === "Confirmed", "confirmed as Margaret");
  await page.screenshot({ path: path.join(OUT, "05-task-confirmed.png") });
  await tap('#infoSheet [data-act="remove"]');
  await page.waitForTimeout(400);
  check(await text("#logHours") === "4" && /removed/.test(await toast()), "removing it takes its hour away");
  await tap("#toastAct");
  check(await text("#logHours") === "5", "undo brings it back");

  console.log("Repeating task from the calendar");
  await tap("#logBtn");
  await page.waitForTimeout(400);
  await page.selectOption("#fName", "Laundry");
  await tap("#dateBtn");
  await tap('#cal [data-date="2026-10-15"]');
  check(await text("#dateVal") === "Thursday, 15 October 2026", "picked Thursday 15 October");
  check(await text("#repeatHint") === "Repeats every Thursday.", "weekly on Thursdays");
  await tap('[data-freq="custom"]');
  await tap('#daysPick [data-wd="0"]');
  check(await text("#repeatHint") === "Repeats every Mon and Thu.", "custom days");
  await tap('[data-freq="weekly"]');
  await tap("#saveBtn");
  await page.waitForTimeout(500);
  check(/Scheduled weekly, starting Thu, 15 Oct/.test(await toast()), "toast: scheduled weekly");
  await tap("#wkNext");
  const next = await names("#logList");
  check(next.filter((n) => n === "Laundry").length === 2 && await text("#logDone") === "0", "next week has both laundry days and nothing done yet");
  await tap("#wkPrev");

  console.log("Contact Us");
  await tap('.tab[data-tab="contact"]');
  await tap('[data-way="call"]');
  check(await page.locator("#wayInfo").isVisible() && (await text("#wayValue")).length > 5, "Call shows the number to copy");
  await page.fill("#msgText", "Can we move Thursday's laundry to Friday?");
  await page.press("#msgText", "Enter");
  await page.waitForTimeout(1900);
  const bubbles = await page.locator("#thread .bubble").allInnerTexts();
  check(bubbles.length === 3 && /Thanks Steph/.test(bubbles[2]), "message sent and answered");
  await page.screenshot({ path: path.join(OUT, "06-contact.png"), fullPage: false });

  console.log("Persistence and reset");
  await page.reload();
  await page.waitForTimeout(400);
  check(await page.locator("#scr-contact").getAttribute("aria-hidden") === "false", "a reload stays on Contact Us");
  await tap('.tab[data-tab="home"]');
  check(await text("#homeHours") === "5", "changes survive a reload");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scroll on a phone");
  await tap("#profileBtn");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "07-profile.png") });
  await tap("#resetBtn");
  await tap("#resetBtn");
  await page.waitForTimeout(400);
  check(await text("#homeHours") === "3.5", "reset puts the demo back");

  /* ---------- desktop frame ---------- */
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  desk.on("pageerror", (e) => errors.push(e.message));
  await desk.goto(url + "#logbook");
  await desk.waitForTimeout(500);
  check(await desk.locator(".statusbar").isVisible(), "a wide screen shows the phone frame");
  check(await desk.locator("#scr-logbook").getAttribute("aria-hidden") === "false", "#logbook opens the Logbook");
  await desk.screenshot({ path: path.join(OUT, "08-desktop.png") });

  check(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join(" / ") : ""));
  await browser.close();
  srv.close();
  console.log(failures ? `\n${failures} check(s) failed. Screenshots in ${OUT}` : `\nAll checks passed. Screenshots in ${OUT}`);
  process.exit(failures ? 1 : 0);
})();
