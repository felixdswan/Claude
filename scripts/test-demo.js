/* Automated checks for the Pepaws Porch quick demo, in a real browser.

   - plays a best run and a worst run: eight days, a 25-second timer on every
     question, no written answers, then the two pages of matching questions
   - checks the stored profile against the profile template's data contract
   - lets two timers run out and checks how that is recorded
   - opens the demo's staff desk: the profile in the template, and the PDF and
     JSON downloads
   - checks the applicant's own profile download, with and without the
     artifact runtime
   - estimates how long a run takes from the words on each screen

   Usage: node scripts/test-demo.js [outdir]   (default: /tmp/pepaws-demo-out)
   Set PDF_LIBS as for test-playthrough.js where cdnjs is blocked. */
const { chromium, serve, newPageFactory } = require("./browser-harness");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || "/tmp/pepaws-demo-out";
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const newPage = newPageFactory(errors, "pepaws-porch.demo.html");
const words = (t) => String(t || "").split(/\s+/).filter(Boolean).length;

async function start(page, name, area) {
  await page.fill("#fname", name);
  await page.fill("#femail", "applicant@student.uts.edu.au");
  if (area) await page.selectOption("#study-area", area);
  await page.check("#c1"); await page.check("#c2");
  await page.click("#begin");
}

/* Plays the eight days. timeOut lists the days (as the applicant sees them)
   whose question is left to run out. Returns what each screen showed. */
async function play(page, mode, { timeOut = [] } = {}) {
  const trace = { days: new Set(), timers: [], screens: [], textareas: 0 };
  for (let guard = 0; guard < 100; guard++) {
    const st = await page.evaluate(() => {
      const s = window.S;
      if (s.view !== "play") return { view: s.view };
      const day = window.DAYS[s.di], step = day.steps[s.si];
      return { view: s.view, phase: s.phase, show: day.show, t: step.t, noReply: !!step.noReply,
        scores: step.options ? step.options.map((o) => (o.fx ? o.fx.connection + o.fx.respect + o.fx.reliability + o.fx.awareness : 0)) : [],
        text: document.getElementById("panel").innerText };
    });
    if (st.view === "questionnaire") return trace;
    if (st.view !== "play") throw new Error("unexpected view " + st.view);
    trace.days.add(st.show);
    if (await page.$("textarea")) trace.textareas++;
    const kind = st.phase === "reply" ? "reply" : st.t === "say" ? "intro" : "question";
    trace.screens.push({ day: st.show, kind, words: words(st.text.replace(/\b\d+s\b/, "")) });
    if (kind !== "question") { await page.click("#next"); continue; }
    trace.timers.push((await page.textContent("#tlabel")).trim());
    if (!(await page.$("#tbar"))) errors.push("demo: no timer bar on day " + st.show);
    const before = await page.evaluate(() => S.choices.length);
    if (timeOut.includes(st.show) && !trace.timedOut?.[st.show]) {
      trace.timedOut = Object.assign(trace.timedOut || {}, { [st.show]: true });
      await page.evaluate(() => { S.timerRemaining = 1; render(); });   // run this timer out in 1 second
      await page.waitForFunction((n) => S.choices.length > n, before, { timeout: 5000 });
      if (!st.noReply && !/No answer in time/.test(await page.textContent("#panel"))) errors.push("demo: no timeout message on day " + st.show);
      continue;
    }
    const pick = st.scores.every((x) => x === 0) ? (mode === "best" ? 2 : 1)
      : st.scores.indexOf(mode === "best" ? Math.max(...st.scores) : Math.min(...st.scores));
    await page.click(`.opt[data-i="${pick}"]`);
    await page.waitForFunction((n) => S.choices.length > n, before, { timeout: 5000 });
  }
  throw new Error("run did not finish");
}

async function answerQuestions(page, extra = {}) {
  await page.waitForSelector("#qnext");
  if ((await page.$$(".qprog i")).length !== 2) errors.push("demo: matching questions are not two pages");
  await page.click("#qnext");                                  // nothing filled: must be stopped
  if (!(await page.$(".qfield.bad"))) errors.push("demo: empty first page was accepted");
  await page.fill("#q-age", "17"); await page.click("#qnext");  // under 18: must be stopped
  if (!(await page.$("#qf-age.bad"))) errors.push("demo: age 17 was accepted");
  await page.fill("#q-age", "21");
  if (await page.$("#qf-age.bad")) errors.push("demo: age still flagged after a valid answer");
  if (!(await page.$("#qf-gender.bad"))) errors.push("demo: empty gender lost its flag too early");
  await page.selectOption("#q-gender", "Female");
  await page.fill("#q-campus", extra.campus || "UTS City campus, Ultimo");
  await page.fill("#q-moveInDate", "2027-02-01");
  await page.selectOption("#q-stayMonths", "12");
  await page.fill("#q-rentBudgetWeekly", "200");
  await page.selectOption("#q-homeownerGender", "female");
  if (await page.$(".qfield.bad") || (await page.textContent("#qerr")).trim()) errors.push("demo: error highlights stayed after every answer was fixed");
  await page.screenshot({ path: path.join(OUT, "questions-1.png") });
  await page.click("#qnext");
  await page.waitForSelector("#q-smoker");
  for (const [k, v] of Object.entries({ smoker: "false", needsSmokeFree: "true", okWithPets: "true", petAllergy: "false" }))
    await page.click(`[data-one="${k}"][data-v="${v}"]`);
  await page.selectOption("#q-otherLodgers", "none");
  await page.selectOption("#q-hoursPerWeek", "8-10");
  if (!(await page.$$eval('[data-multi="helpTypes"][aria-pressed="true"]', (x) => x.length)))
    await page.click('[data-multi="helpTypes"][data-v="Gardening"]');
  await page.click('[data-multi="hobbies"][data-v="Gardening"]');
  await page.screenshot({ path: path.join(OUT, "questions-2.png"), fullPage: true });
  await page.click("#qnext");
  await page.waitForSelector("#savestat");
  await page.waitForFunction(() => /reached|couldn|can’t|switched off|refused/.test(document.getElementById("savestat").textContent), null, { timeout: 8000 });
}

/* Loads a profile into the template on its own and reports how many fields it filled. */
async function contract(browser, base, profile, label) {
  const { ctx, page } = await newPage(browser, base, { mock: false });
  await page.goto(base + "/genstay-profile-template.html");
  const st = await page.evaluate((p) => window.GenStayProfile.load(p), profile);
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.screenshot({ path: path.join(OUT, "template-" + label + ".png"), fullPage: true });
  await ctx.close();
  return st;
}

async function pdfFrom(page, nameFragment) {
  await page.waitForFunction((n) => window.__downloads.some((d) => /\.pdf$/.test(d.filename) && d.filename.indexOf(n) !== -1), nameFragment, { timeout: 60000 });
  return page.evaluate((n) => {
    const d = window.__downloads.filter((x) => /\.pdf$/.test(x.filename) && x.filename.indexOf(n) !== -1).pop();
    const bytes = new Uint8Array(d.data);
    let txt = ""; for (let i = 0; i < bytes.length; i++) txt += String.fromCharCode(bytes[i]);
    return { filename: d.filename, kb: Math.round(bytes.length / 1024), head: txt.slice(0, 5), pages: (txt.match(/\/Type \/Page[^s]/g) || []).length, b64: btoa(txt) };
  }, nameFragment);
}

(async () => {
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port;
  const browser = await chromium.launch();
  const report = {};

  /* best and worst runs, then the staff desk on the worst run's record store */
  for (const mode of ["best", "worst"]) {
    const { ctx, page } = await newPage(browser, base);
    await start(page, mode === "best" ? "Jenny Graffet" : "Sam Lee", mode === "best" ? "health" : "education");
    const trace = await play(page, mode);
    if (trace.days.size !== 8) errors.push(mode + ": played " + trace.days.size + " days, not 8");
    if (trace.textareas) errors.push(mode + ": a written-answer box appeared");
    if (trace.timers.some((t) => t !== "25s")) errors.push(mode + ": timers were " + trace.timers.join(", "));
    await answerQuestions(page);
    await page.screenshot({ path: path.join(OUT, "results-" + mode + ".png"), fullPage: true });
    const doc = await page.evaluate(() => window.__store["profiles/applicant-1"]);
    const p = doc && doc.profile, sc = p && p.screening;
    if (!doc || !doc.complete) { errors.push(mode + ": profile not saved"); continue; }
    if (!/^DEMO-/.test(p.meta.profileId)) errors.push(mode + ": profile id isn't marked as a demo");
    if (JSON.stringify(sc.pathByDay.map((x) => x.day)) !== "[1,2,4,6,8,9,11,14]") errors.push(mode + ": path days " + JSON.stringify(sc.pathByDay));
    if (JSON.stringify(sc.landmarks.map((x) => x.day)) !== "[6,9,11,14]") errors.push(mode + ": landmark days " + JSON.stringify(sc.landmarks.map((x) => x.day)));
    if (sc.flags.indexOf("quick_demo") === -1 || !/^Quick demo/.test(sc.watchPoint)) errors.push(mode + ": not marked as a quick demo for staff");
    if ((await page.$$(".rows .row")).length !== 4) errors.push(mode + ": results don't list the four big moments");
    const st = await contract(browser, base, p, mode);
    report[mode] = { type: sc.profile, meters: sc.meters, lowest: sc.lowestMoment, path: sc.finalPath, choices: await page.evaluate(() => S.choices.length), templateFilled: st.filled + "/" + st.total };
    fs.writeFileSync(path.join(OUT, "profile-" + mode + ".json"), JSON.stringify(p, null, 2));

    if (mode === "best") {
      /* how long a run takes: words on screen at 200 and 250 words a minute, plus a second a click */
      const intro = trace.screens.filter((x) => x.kind === "intro"), qs = trace.screens.filter((x) => x.kind === "question"), rep = trace.screens.filter((x) => x.kind === "reply");
      const total = trace.screens.reduce((n, x) => n + x.words, 0), clicks = trace.screens.length;
      const qWords = await page.evaluate(() => [].concat.apply([], DAYS.map((d) => d.steps.filter((s) => s.t === "choice")
        .map((s) => (s.prompt + " " + s.options.map((o) => o.text).join(" ")).split(/\s+/).length))));
      report.timing = {
        screens: { intro: intro.length, question: qs.length, reaction: rep.length },
        wordsReadInGame: total, longestQuestionWords: Math.max(...qWords),
        secondsNeededForLongestQuestionAt150wpm: Math.round(Math.max(...qWords) / 150 * 60),
        gameMinutesAt200wpm: +((total / 200) + clicks / 60).toFixed(1), gameMinutesAt250wpm: +((total / 250) + clicks / 60).toFixed(1)
      };
    }
    if (mode === "worst") {
      await page.evaluate(() => { location.hash = "staff"; });
      await page.setViewportSize({ width: 1360, height: 980 });
      await page.waitForSelector(".qitem");
      await page.waitForFunction(() => /fields filled/.test((document.getElementById("fstat") || {}).textContent || ""), null, { timeout: 8000 });
      const pills = await page.$$eval(".qitem .pill", (x) => x.map((n) => n.textContent));
      if (pills.indexOf("Quick demo") === -1) errors.push("staff: no Quick demo label in the queue (" + pills.join(", ") + ")");
      report.staff = { frame: await page.textContent("#fstat"), pills };
      await page.screenshot({ path: path.join(OUT, "staff-desk.png") });
      await page.click("#pdfone");
      const one = await pdfFrom(page, "sam-lee");
      fs.writeFileSync(path.join(OUT, "demo-profile.pdf"), Buffer.from(one.b64, "base64"));
      if (one.head !== "%PDF-" || one.pages < 2) errors.push("staff: demo PDF looks wrong (" + one.head + ", " + one.pages + " pages)");
      await page.click("#dlone");
      await page.waitForFunction(() => window.__downloads.some((d) => /\.json$/.test(d.filename)), null, { timeout: 5000 });
      const json = await page.evaluate(() => JSON.parse(window.__downloads.filter((d) => /\.json$/.test(d.filename)).pop().data));
      if (!/^DEMO-/.test(json.meta.profileId) || json.meta.pairingStatus !== "new") errors.push("staff: JSON download is missing the demo profile");
      await page.click("#pdfall");
      const all = await pdfFrom(page, "genstay-profiles-");
      report.staff.pdf = one.filename + " · " + one.pages + " pages · " + one.kb + " KB";
      report.staff.pdfAll = all.filename + " · " + all.pages + " pages";
      report.staff.json = "genstay-profile-sam-lee.json · " + Object.keys(json).join(", ");
    }
    await ctx.close();
  }

  /* two timers run out (Day 1's first question, and Day 6) */
  {
    const { ctx, page } = await newPage(browser, base);
    await start(page, "Tim Out", "carework");
    await play(page, "best", { timeOut: [1, 6] });
    await answerQuestions(page);
    const sc = await page.evaluate(() => window.__store["profiles/applicant-1"].profile.screening);
    const missed = await page.evaluate(() => S.choices.filter((c) => c.timedOut).map((c) => c.title));
    if (missed.length !== 2) errors.push("timeouts: recorded " + missed.length + " timed-out questions");
    if (sc.flags.indexOf("missed_timer") === -1 || !/Ran out of time on 2 of 9 questions/.test(sc.watchPoint)) errors.push("timeouts: not reported to staff: " + sc.watchPoint);
    report.timeouts = { missed, motivation: sc.motivation, watchPoint: sc.watchPoint };
    await ctx.close();
  }

  /* the applicant's own download: through the runtime when saving fails, and as a plain browser download */
  {
    const { ctx, page } = await newPage(browser, base);
    await start(page, "Dee Nied", "psychology");
    await play(page, "best");
    await page.evaluate(() => { window.__deny = true; });
    await answerQuestions(page);
    if (!(await page.isVisible("#dl"))) errors.push("download: no Download profile file button when saving failed");
    await page.click("#dl");
    await page.waitForFunction(() => window.__downloads.some((d) => /\.json$/.test(d.filename)), null, { timeout: 5000 });
    const got = await page.evaluate(() => { const d = window.__downloads.pop(); return { filename: d.filename, profile: JSON.parse(d.data) }; });
    if (!/^genstay-profile-DEMO-.*\.json$/.test(got.filename) || got.profile.student.firstName !== "Dee") errors.push("download: runtime download wrong: " + got.filename);
    await ctx.close();

    const local = await newPage(browser, base, { mock: false });
    await start(local.page, "Lou Cal", "education");
    await play(local.page, "best");
    await answerQuestions(local.page);
    const [dl] = await Promise.all([local.page.waitForEvent("download", { timeout: 10000 }), local.page.click("#dl")]);
    const file = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(file);
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved.student.firstName !== "Lou" || !saved.screening || saved.screening.flags.indexOf("quick_demo") === -1) errors.push("download: browser download wrong");
    report.applicantDownload = { runtime: got.filename, browser: dl.suggestedFilename() };
    await local.ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) { console.log("\nPROBLEMS:\n" + errors.join("\n")); process.exit(1); }
  console.log("\nall demo checks passed — output in " + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
