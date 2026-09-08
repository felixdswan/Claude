/* Automated playthrough of Pepaws Porch.
   Drives the real page in Chromium: a best-choice run, a worst-choice run,
   a timer-expiry run, and a workbook byte dump for validation. */
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const URL = "file://" + path.resolve(__dirname, "../game/pepaws-porch.html");
const OUT = process.argv[2] || "/tmp";

function sum(f) { return (f.rapport || 0) + (f.autonomy || 0) + (f.safety || 0); }

async function newPage(browser, errors) {
  const ctx = await browser.newContext({ viewport: { width: 468, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/fonts\.googleapis\.com|ERR_CONNECTION_RESET|ERR_BLOCKED/.test(t)) return; // sandbox has no egress
    errors.push("console: " + t);
  });
  page.on("requestfailed", (r) => {
    if (!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(r.url())) errors.push("requestfailed: " + r.url());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(URL);
  await page.waitForTimeout(500);
  return { ctx, page };
}

async function startRun(page, name) {
  await page.fill("#fname", name);
  await page.fill("#femail", "applicant@example.edu.au");
  await page.check("#c1");
  await page.check("#c2");
  await page.click("#begin");
  await page.waitForSelector(".daycard");
}

/* Walk to the end. mode: "best" | "worst". Returns a trace. */
async function playThrough(page, mode, opts = {}) {
  const trace = [];
  for (let guard = 0; guard < 400; guard++) {
    const state = await page.evaluate(() => {
      const s = window.S;
      if (s.view === "results") return { view: "results" };
      if (s.view === "daycard") return { view: "daycard" };
      const day = window.DAYS[s.di];
      const step = day.steps[s.si];
      return {
        view: s.view, phase: s.phase, di: s.di, si: s.si,
        dayN: day.n, kind: step.t, timer: step.timer || null,
        options: step.t === "choice" ? step.options.map((o, i) => ({
          i, examine: !!o.examine, score: o.fx ? (o.fx.rapport || 0) + (o.fx.autonomy || 0) + (o.fx.safety || 0) : 0
        })) : null,
        min: step.min || null
      };
    });

    if (state.view === "results") break;

    if (state.view === "daycard") {
      await page.click("#go");
      await page.waitForTimeout(60);
      continue;
    }
    if (state.phase === "reply") {
      await page.click("#next");
      await page.waitForTimeout(60);
      continue;
    }
    if (state.kind === "say") {
      await page.click("#next");
      await page.waitForTimeout(60);
      continue;
    }
    if (state.kind === "choice") {
      // Take every examine option still on screen (they reveal props, they don't advance).
      let tookExamine = false;
      for (const o of state.options.filter((x) => x.examine)) {
        const btn = await page.$(`.opt[data-i="${o.i}"]`);
        if (btn) { await btn.click(); await page.waitForTimeout(60); tookExamine = true; break; }
      }
      if (tookExamine) continue;
      if (opts.letTimeoutOnDay === state.dayN && state.timer) {
        trace.push(`day ${state.dayN}: letting the ${state.timer}s timer expire`);
        await page.waitForTimeout(state.timer * 1000 + 900);
        await page.waitForTimeout(120);
        continue;
      }
      const real = state.options.filter((o) => !o.examine);
      real.sort((a, b) => (mode === "best" ? b.score - a.score : a.score - b.score));
      const pick = real[0];
      trace.push(`day ${state.dayN}: option ${pick.i} (score ${pick.score})`);
      await page.click(`.opt[data-i="${pick.i}"]`);
      await page.waitForTimeout(60);
      continue;
    }
    if (state.kind === "text") {
      const answer = mode === "best"
        ? "I would sit down with him first and ask if it is alright before I touch anything, then show him one step at a time in plain words, no jargon, and write it down on a card so he has it next time. I would tell the coordinator and log it. I am not comfortable letting that go and I would say so calmly, without a lecture, and I would not lift him or grab him. Ambulance, triple zero, 000 straight away, address is 14 Ellerslie Street, cross street given, he is 82, speech slurred on one side, right arm weak, skin cool, he is awake, I have not moved him, it started about ten minutes ago and he was dizzy three times this week."
        : "dunno";
      const text = mode === "best" ? answer : "I'd just do it myself, it's quicker, and I'd tell him he must have pressed something. Not my place really.";
      await page.fill("#ta", text);
      await page.waitForTimeout(40);
      await page.click("#send");
      await page.waitForTimeout(60);
      continue;
    }
    throw new Error("unhandled state " + JSON.stringify(state));
  }
  return trace;
}

(async () => {
  const browser = await chromium.launch();
  const report = [];
  let failures = 0;
  const check = (label, cond, detail) => {
    report.push((cond ? "PASS  " : "FAIL  ") + label + (detail ? "  — " + detail : ""));
    if (!cond) failures++;
  };

  /* ---------- run 1: best choices ---------- */
  {
    const errors = [];
    const { ctx, page } = await newPage(browser, errors);
    await startRun(page, "Amrita Best");
    await playThrough(page, "best");
    await page.waitForSelector(".band", { timeout: 5000 });
    const rec = await page.evaluate(() => window.toRecord());
    check("best run reaches results", true);
    check("best run: 5 free-text responses", rec.responses.length === 5, "got " + rec.responses.length);
    check("best run: no hard stop", rec.hardStop === false);
    check("best run: band is Certified", rec.band === "Certified", rec.band + " | " + rec.reasons.join(" / "));
    check("best run: meters high", rec.safety >= 65 && rec.autonomy >= 65 && rec.rapport >= 45,
      `r${rec.rapport} a${rec.autonomy} s${rec.safety}`);
    check("best run: every level answered", ["L1", "L2", "L3", "L4", "L5"].every((k) => rec.responses.some((r) => r.id === k)));
    check("best run: choices recorded", rec.choices.length >= 14, "got " + rec.choices.length);
    check("best run: both Day 6 props examined", rec.flags.calendarSeen === true && rec.flags.breakfastSeen === true,
      JSON.stringify(rec.flags));
    check("best run: no false watch flags on a good answer", (rec.watchFlags || []).length === 0,
      JSON.stringify(rec.watchFlags));
    check("best run: no page errors", errors.length === 0, errors.join(" | "));

    /* workbook bytes straight out of the page */
    const bytes = await page.evaluate(() => Array.from(xlsxMini(participantWorkbook(toRecord()))));
    fs.writeFileSync(path.join(OUT, "participant.xlsx"), Buffer.from(bytes));
    check("participant workbook built", bytes.length > 3000, bytes.length + " bytes");

    const assessorBytes = await page.evaluate(() => {
      const r = toRecord();
      return Array.from(xlsxMini(assessorWorkbook([r, r])));
    });
    fs.writeFileSync(path.join(OUT, "assessor.xlsx"), Buffer.from(assessorBytes));
    check("assessor workbook built", assessorBytes.length > 3000, assessorBytes.length + " bytes");

    fs.writeFileSync(path.join(OUT, "record-best.json"), JSON.stringify(rec, null, 2));
    await page.screenshot({ path: path.join(OUT, "shot-results.png") });
    await ctx.close();
  }

  /* ---------- run 2: worst choices ---------- */
  {
    const errors = [];
    const { ctx, page } = await newPage(browser, errors);
    await startRun(page, "Worst Case");
    await playThrough(page, "worst");
    await page.waitForSelector(".band", { timeout: 5000 });
    const rec = await page.evaluate(() => window.toRecord());
    check("worst run reaches results", true);
    check("worst run: hard stop set", rec.hardStop === true);
    check("worst run: band is Assessor review", rec.band === "Assessor review", rec.band);
    check("worst run: watch flags fired on writing", (rec.watchFlags || []).length > 0, JSON.stringify(rec.watchFlags));
    check("worst run: no page errors", errors.length === 0, errors.join(" | "));
    fs.writeFileSync(path.join(OUT, "record-worst.json"), JSON.stringify(rec, null, 2));
    await ctx.close();
  }

  /* ---------- run 3: let the Day 14 timer expire ---------- */
  {
    const errors = [];
    const { ctx, page } = await newPage(browser, errors);
    await startRun(page, "Timeout Test");
    await playThrough(page, "best", { letTimeoutOnDay: 14 });
    await page.waitForSelector(".band", { timeout: 8000 });
    const rec = await page.evaluate(() => window.toRecord());
    const timedOut = rec.choices.filter((c) => c.timedOut);
    check("timer expiry recorded", timedOut.length >= 1, timedOut.length + " timed-out choices");
    check("day 14 timeout triggers hard stop", rec.hardStop === true, "band " + rec.band);
    check("timeout run: no page errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ---------- run 4: assessor view without a record store ---------- */
  {
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: 1060, height: 900 } });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      if (/fonts\.googleapis\.com|ERR_CONNECTION_RESET|ERR_BLOCKED/.test(t)) return;
      errors.push("console: " + t);
    });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.goto(URL + "#assessor");
    await page.waitForTimeout(900);
    const txt = await page.textContent("#astat");
    check("assessor view degrades without db", /not available/i.test(txt), txt.trim());
    check("assessor view: no page errors", errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: path.join(OUT, "shot-assessor.png") });
    await ctx.close();
  }

  await browser.close();
  console.log(report.join("\n"));
  console.log("\n" + (failures ? failures + " FAILURE(S)" : "all checks passed"));
  process.exit(failures ? 1 : 0);
})();
