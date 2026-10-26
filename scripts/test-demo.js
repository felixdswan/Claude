/* Automated checks for the Pepaws Porch quick demo, in a real browser.

   - plays a best run and a worst run: nine days, a 25-second timer on every
     question, no written answers, then the two pages of matching questions
   - checks the story never mentions something it hasn't set up
   - checks the stored profile against the profile template's data contract,
     including what Day 3 and the career and interest questions add
   - lets two timers run out and checks how that is recorded
   - opens the demo's staff desk: the profile in the template, and the PDF and
     JSON downloads
   - adds host profiles on the Hosts and matches tab (the CSV template, pasted
     spreadsheet rows and a JSON file), checks the suggested pairings and their
     reasons, suggests one, and changes and removes a host
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

/* Plays the nine days. timeOut lists the days (as the applicant sees them)
   whose question is left to run out. Returns what each screen showed. */
async function play(page, mode, { timeOut = [] } = {}) {
  const trace = { days: new Set(), timers: [], screens: [], textareas: 0, text: [] };
  for (let guard = 0; guard < 100; guard++) {
    const st = await page.evaluate(() => {
      const s = window.S;
      if (s.view !== "play") return { view: s.view };
      const day = window.DAYS[s.di], step = day.steps[s.si];
      return { view: s.view, phase: s.phase, show: day.show, t: step.t, noReply: !!step.noReply,
        scores: step.options ? step.options.map((o) => (o.fx ? o.fx.connection + o.fx.respect + o.fx.reliability + o.fx.awareness : 0)) : [],
        text: document.getElementById("panel").innerText, topbar: document.querySelector(".topbar").innerText };
    });
    if (st.view === "questionnaire") return trace;
    if (st.view !== "play") throw new Error("unexpected view " + st.view);
    trace.days.add(st.show);
    trace.text.push(st.topbar + "\n" + st.text);
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
  if (!/nine days/.test(await page.textContent(".qhead"))) errors.push("demo: questionnaire intro doesn't count nine days");
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
  await page.selectOption("#q-otherLodgers", "none");
  await page.click('[data-one="smoking"][data-v="needs_free"]');
  await page.click('[data-one="pets"][data-v="' + (extra.pets || "happy") + '"]');
  if (await page.$(".qfield.bad") || (await page.textContent("#qerr")).trim()) errors.push("demo: error highlights stayed after every answer was fixed");
  await page.screenshot({ path: path.join(OUT, "questions-1.png"), fullPage: true });
  await page.click("#qnext");
  await page.waitForSelector("#q-careerGoal");
  const careers = await page.$$eval("#q-careerGoal option", (o) => o.map((x) => x.value).filter(Boolean));
  if (careers[careers.length - 1] !== "Not sure yet" || careers.length < 3) errors.push("demo: career options look wrong: " + careers.join(", "));
  if (extra.careers && JSON.stringify(careers) !== JSON.stringify(extra.careers)) errors.push("demo: career options don't follow the area of study: " + careers.join(", "));
  await page.click("#qnext");                                  // required career answers left empty: must be stopped
  for (const id of ["careerGoal", "socialLevel", "hoursPerWeek"]) if (!(await page.$("#qf-" + id + ".bad"))) errors.push("demo: empty " + id + " was accepted");
  if (extra.prefilledMentor && (await page.inputValue("#q-fieldMentor")) !== extra.prefilledMentor) errors.push("demo: Day 3 didn't pre-fill the field-mentor answer");
  if ((await page.$$eval('[data-multi="languages"][aria-pressed="true"]', (x) => x.map((n) => n.dataset.v))).join() !== "English") errors.push("demo: languages not pre-filled with English");
  await page.selectOption("#q-careerGoal", careers[0]);
  if (!(await page.inputValue("#q-fieldMentor"))) await page.selectOption("#q-fieldMentor", "open");
  await page.click('[data-one="socialLevel"][data-v="' + (extra.social || 4) + '"]');
  await page.click('[data-multi="languages"][data-v="Italian"]');
  await page.fill('[data-q="languages__other"]', extra.otherLanguage || "Auslan");
  await page.selectOption("#q-hoursPerWeek", "8-10");
  if (!(await page.$$eval('[data-multi="helpTypes"][aria-pressed="true"]', (x) => x.length)))
    await page.click('[data-multi="helpTypes"][data-v="Gardening"]');
  if (!(await page.$('[data-multi="hobbies"][data-v="Gardening"][aria-pressed="true"]'))) await page.click('[data-multi="hobbies"][data-v="Gardening"]');
  if (!(await page.$('[data-multi="wantsToLearn"][data-v="Local history"][aria-pressed="true"]'))) await page.click('[data-multi="wantsToLearn"][data-v="Local history"]');
  await page.screenshot({ path: path.join(OUT, "questions-2.png"), fullPage: true });
  await page.click("#qnext");
  await page.waitForSelector("#savestat");
  await page.waitForFunction(() => /reached|couldn|can’t|switched off|refused/.test(document.getElementById("savestat").textContent), null, { timeout: 8000 });
}

/* Nothing on screen refers to something the story hasn't set up, and no
   placeholder or stale day count shows. */
function storyChecks(trace, mode) {
  const all = trace.text.join("\n");
  if (/\{\{|\}\}/.test(all)) errors.push(mode + ": a {{placeholder}} reached the screen");
  if (/of 8\b|eight days/i.test(all)) errors.push(mode + ": a screen still counts eight days");
  if (!/granny flat/.test(all) || !/It’s loose/.test(all)) errors.push(mode + ": Day 2 doesn't set up the loose step to the granny flat");
  if (!/welcome to join/.test(all)) errors.push(mode + ": Day 2 doesn't set up the dinner invitation");
  if (!/community garden/.test(all.split(/Day 4 of 9/i)[0])) errors.push(mode + ": the community garden isn't set up before the biased remark");
  if (/coordinator/i.test(all)) errors.push(mode + ": the epilogue still mentions a coordinator nobody introduced");
  if (mode === "best" && !/thirty-five years as a nurse/.test(all)) errors.push(mode + ": Day 3 doesn't use the health career");
}

/* The Hosts and matches tab, on the store the worst run left. Sam Lee (the worst
   run) is kept out of matching by screening; Jenny Graffet (the sample profile,
   already shortlisted by staff for Margaret Hollis) and Pat Ward (a teaching
   student) are added as files. Then three hosts: Marg from the CSV template,
   and Joan and Ray pasted as spreadsheet rows. */
async function hostsTab(page) {
  const out = {};
  const download = async (filename) => page.evaluate((f) => { const d = window.__downloads.filter((x) => x.filename === f).pop(); return d && d.data; }, filename);
  const sample = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../genstay/genstay-profile.sample.json"), "utf8"));
  const pat = JSON.parse(JSON.stringify(sample));
  pat.meta = Object.assign(pat.meta, { profileId: "PP-pat", pairingStatus: "new", suggestedFor: null });
  Object.assign(pat.student, { firstName: "Pat", lastName: "Ward", discipline: "education", course: "Bachelor of Education (Primary)" });
  Object.assign(pat.interests, { careerGoal: "Primary teaching", fieldMentor: "keen", hobbies: ["Reading", "Gardening"], wantsToLearn: ["Local history"] });
  pat.lifestyle.socialLevel = 2;
  await page.setInputFiles("#importer", [
    { name: "jenny.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample)) },
    { name: "pat.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pat)) }]);
  await page.waitForFunction(() => document.querySelectorAll(".qitem").length === 3, null, { timeout: 5000 });

  await page.click("#tab-hosts");
  await page.waitForFunction(() => /host profile|placement record/.test(document.getElementById("hstat").textContent), null, { timeout: 8000 });
  if (!/No host profiles yet/.test(await page.textContent("#mbody"))) errors.push("hosts: empty tab doesn't explain how to add hosts");
  await page.click("#hosttemplate");
  await page.waitForFunction(() => window.__downloads.some((d) => d.filename === "genstay-host-template.csv"), null, { timeout: 5000 });
  const template = await download("genstay-host-template.csv");
  if (!/^﻿Host ID,Status,First name/.test(template)) errors.push("hosts: template CSV is missing its headings");

  await page.setInputFiles("#hostimporter", { name: "hosts.csv", mimeType: "text/csv", buffer: Buffer.from(template) });
  await page.waitForFunction(() => document.querySelectorAll("#hlist .qitem").length === 1, null, { timeout: 5000 });
  const rows = ["First name\tLast name\tGender\tSuburb\tFormer career\tRent per week\tRoom free from\tShortest stay (months)\tNearby campuses\tStudent gender wanted\tHours a week from\tHours a week to\tHelp wanted\tTime together (1-5)\tInterests\tCan teach or share\tSmoke-free home\tPets",
    "Joan\tPrice\tFemale\tAshfield\tPrimary school teacher\t140\t1/2/2027\t6\tUTS City campus (30 min)\tAny\t8\t10\tGardening; Company and conversation\t2\tReading; Gardening\tLocal history\tYes\t",
    "Ray\tChen\tMale\tParramatta\tEngineer\t160\t1/2/2027\t6\tWestern Sydney University (15 min)\tMale\t6\t8\tTech and phone help\t3\tMusic\t\tYes\tDog"].join("\n");
  await page.click("#hostpastebtn");
  await page.fill("#hostpastein", rows);
  await page.click("#hostpasteadd");
  await page.waitForFunction(() => document.querySelectorAll("#hlist .qitem").length === 3, null, { timeout: 5000 });
  out.stored = await page.evaluate(() => Object.keys(window.__store).filter((k) => /^hosts\//.test(k)).sort());
  if (out.stored.length !== 3) errors.push("hosts: " + out.stored.length + " host profiles stored, not 3");
  if (await page.isVisible("#hoverview")) await page.click("#hoverview");
  await page.waitForTimeout(300);

  /* Marg keeps the staff's pairing with Jenny, Pat is suggested for Joan, Ray (male students only) waits */
  const m = await page.evaluate(() => ({
    pairings: desk.match.pairings.map((p) => p.hostName + " + " + p.studentName + " " + p.score + (p.locked ? " (staff)" : "")),
    sam: desk.match.students["applicant-1"].excluded, waiting: desk.match.unmatchedHosts.map((u) => u.name + ": " + u.reasons.join(", "))
  }));
  out.pairings = m.pairings; out.waiting = m.waiting;
  if (!m.pairings.some((p) => /^Marg Hollis \+ Jenny Graffet .*\(staff\)$/.test(p))) errors.push("hosts: the staff's pairing of Jenny with Marg wasn't kept: " + m.pairings.join(", "));
  if (!m.pairings.some((p) => /^Joan Price \+ Pat Ward \d+$/.test(p))) errors.push("hosts: Pat Ward wasn't suggested for Joan Price: " + m.pairings.join(", "));
  if (!m.sam.length || !/Transactional Guest/.test(m.sam.join(" "))) errors.push("hosts: Sam Lee (worst run) wasn't kept out of matching: " + JSON.stringify(m.sam));
  if (!m.waiting.some((w) => /^Ray Chen: .*gender preference \(3\)/.test(w))) errors.push("hosts: Ray isn't listed as waiting because of his gender preference: " + m.waiting.join(" | "));
  const overview = await page.textContent("#mbody");
  if (!/homeowner was a primary school teacher/i.test(overview) || !/Shared interests/.test(overview)) errors.push("hosts: Pat and Joan's pairing gives no reasons");
  await page.screenshot({ path: path.join(OUT, "hosts-overview.png") });

  await page.click('.mcard:has-text("Joan Price") [data-suggest]');
  await page.waitForFunction(() => /shortlisted for Joan/.test(document.getElementById("mstat").textContent), null, { timeout: 5000 });
  const review = await page.evaluate(() => window.__store["reviews/import-PP-pat"]);
  if (!review || review.pairingStatus !== "shortlisted" || review.suggestedFor !== "Joan Price" || review.suggestedHostId !== "H-joan-price-ashfield")
    errors.push("hosts: suggesting the pairing didn't update Pat's review: " + JSON.stringify(review));
  if (!/Shortlisted by staff/.test(await page.textContent("#mbody"))) errors.push("hosts: the pairing isn't marked as made once suggested");

  /* one host up close: facts, ranked applicants, who was ruled out, status, removal */
  await page.click('#hlist .qitem:has-text("Marg")');
  await page.waitForSelector("#hst-status");
  const detail = await page.textContent("#mbody");
  if (!/Nurse/.test(detail) || !/Best applicants for Marg/.test(detail) || !/Ruled out/.test(detail)) errors.push("hosts: host view is missing facts, rankings or the ruled-out list");
  await page.click("details.out summary");
  if (!/Sam Lee:.*Transactional Guest/.test(await page.textContent("details.out"))) errors.push("hosts: Sam's reason isn't in Marg's ruled-out list");
  await page.screenshot({ path: path.join(OUT, "hosts-marg.png") });
  await page.selectOption("#hst-status", "paused");
  await page.waitForFunction(() => window.__store["hosts/H-0001"].meta.status === "paused", null, { timeout: 5000 });
  await page.click('#hlist .qitem:has-text("Ray")');
  await page.click("#hremove");
  if (!/Click again/.test(await page.textContent("#hremove"))) errors.push("hosts: removal didn't ask for a second click");
  await page.click("#hremove");
  await page.waitForFunction(() => !window.__store["hosts/H-ray-chen-parramatta"], null, { timeout: 5000 });
  if ((await page.$$("#hlist .qitem")).length !== 2) errors.push("hosts: removed host still listed");

  /* a JSON host file replaces Marg (same host id), and the spreadsheet export */
  const host = fs.readFileSync(path.resolve(__dirname, "../genstay/genstay-host.sample.json"));
  await page.setInputFiles("#hostimporter", { name: "marg.json", mimeType: "application/json", buffer: host });
  await page.waitForFunction(() => /Added 1 host profile/.test(document.getElementById("hstat").textContent), null, { timeout: 5000 });
  if ((await page.$$("#hlist .qitem")).length !== 2) errors.push("hosts: re-importing Marg added a duplicate instead of replacing her");
  await page.click("#hostexport");
  await page.waitForFunction(() => window.__downloads.some((d) => /^genstay-hosts-.*\.csv$/.test(d.filename)), null, { timeout: 5000 });
  const exported = await page.evaluate(() => window.__downloads.filter((d) => /^genstay-hosts-/.test(d.filename)).pop().data);
  out.exportedRows = exported.trim().split(/\r?\n/).length - 1;
  if (out.exportedRows !== 2) errors.push("hosts: export has " + out.exportedRows + " rows, not 2");

  /* the applicant review panel: Pat's best homeowners; Sam's reason for being left out */
  await page.click("#tab-app");
  await page.click('.qitem:has-text("Pat Ward")');
  await page.waitForFunction(() => /Joan Price/.test((document.getElementById("rv-best") || {}).textContent || ""), null, { timeout: 5000 });
  out.patPanel = (await page.textContent("#rv-best")).replace(/\s+/g, " ").trim();
  if ((await page.inputValue("#rv-for")) !== "Joan Price") errors.push("hosts: Pat's review panel doesn't show the suggested homeowner");
  await page.screenshot({ path: path.join(OUT, "staff-desk-best-homeowners.png") });
  await page.click('.qitem:has-text("Sam Lee")');
  await page.waitForFunction(() => /Not matched automatically/.test((document.getElementById("rv-best") || {}).textContent || ""), null, { timeout: 5000 });
  /* typing a homeowner by hand links the review to that host too */
  await page.click('.qitem:has-text("Jenny Graffet")');
  await page.waitForSelector("#rv-for");
  await page.fill("#rv-for", "Joan Price");
  await page.click("#rv-save");
  await page.waitForFunction(() => (window.__store["reviews/import-GS-2027-0142"] || {}).suggestedHostId === "H-joan-price-ashfield", null, { timeout: 5000 })
    .catch(() => errors.push("hosts: a homeowner typed into the review wasn't linked to the host"));
  return out;
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
    if (trace.days.size !== 9) errors.push(mode + ": played " + trace.days.size + " days, not 9");
    storyChecks(trace, mode);
    if (trace.textareas) errors.push(mode + ": a written-answer box appeared");
    if (trace.timers.some((t) => t !== "25s")) errors.push(mode + ": timers were " + trace.timers.join(", "));
    await answerQuestions(page, mode === "best"
      ? { prefilledMentor: "keen", careers: ["Nursing", "Midwifery", "Medicine", "Paramedicine", "Pharmacy", "Not sure yet"] }
      : { social: 2, otherLanguage: "Greek", pets: "allergic" });
    await page.screenshot({ path: path.join(OUT, "results-" + mode + ".png"), fullPage: true });
    const doc = await page.evaluate(() => window.__store["profiles/applicant-1"]);
    const p = doc && doc.profile, sc = p && p.screening;
    if (!doc || !doc.complete) { errors.push(mode + ": profile not saved"); continue; }
    if (!/^DEMO-/.test(p.meta.profileId)) errors.push(mode + ": profile id isn't marked as a demo");
    if (JSON.stringify(sc.pathByDay.map((x) => x.day)) !== "[1,2,3,4,6,8,9,11,14]") errors.push(mode + ": path days " + JSON.stringify(sc.pathByDay));
    const it = p.interests || {}, hh = p.household || {};
    if (hh.smoker !== false || hh.needsSmokeFree !== true || hh.okWithPets !== (mode === "best") || hh.petAllergy !== (mode !== "best"))
      errors.push(mode + ": one-tap smoking and pets answers didn't fill the profile: " + JSON.stringify(hh));
    if (mode === "best") {
      if (it.careerGoal !== "Nursing" || it.fieldMentor !== "keen" || it.homeownerBackground !== "Retired nurse") errors.push("best: career answers not in the profile: " + JSON.stringify(it));
      if (p.lifestyle.socialLevel !== 4 || JSON.stringify(p.student.languages) !== '["English","Italian","Auslan"]') errors.push("best: time together or languages not in the profile");
      if (JSON.stringify(it.wantsToLearn) !== '["Local history"]' || JSON.stringify(it.hobbies) !== '["Gardening"]') errors.push("best: interests not in the profile: " + JSON.stringify(it));
    } else {
      if (it.careerGoal !== "Early childhood teaching" || it.fieldMentor !== "open" || p.lifestyle.socialLevel !== 2) errors.push("worst: career answers not in the profile: " + JSON.stringify(it));
    }
    if (JSON.stringify(sc.landmarks.map((x) => x.day)) !== "[6,9,11,14]") errors.push(mode + ": landmark days " + JSON.stringify(sc.landmarks.map((x) => x.day)));
    if (sc.flags.indexOf("quick_demo") === -1 || !/^Quick demo/.test(sc.watchPoint)) errors.push(mode + ": not marked as a quick demo for staff");
    if ((await page.$$(".rows .row")).length !== 4) errors.push(mode + ": results don't list the four big moments");
    if (!/nine days/.test(await page.textContent("h1"))) errors.push(mode + ": results heading doesn't count nine days");
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
      report.hosts = await hostsTab(page);
    }
    await ctx.close();
  }

  /* two timers run out (Day 1's first question, and Day 7, the biased remark) */
  {
    const { ctx, page } = await newPage(browser, base);
    await start(page, "Tim Out", "carework");
    await play(page, "best", { timeOut: [1, 7] });
    await answerQuestions(page);
    const sc = await page.evaluate(() => window.__store["profiles/applicant-1"].profile.screening);
    const missed = await page.evaluate(() => S.choices.filter((c) => c.timedOut).map((c) => c.title));
    if (missed.length !== 2) errors.push("timeouts: recorded " + missed.length + " timed-out questions");
    if (sc.flags.indexOf("missed_timer") === -1 || !/Ran out of time on 2 of 10 questions/.test(sc.watchPoint)) errors.push("timeouts: not reported to staff: " + sc.watchPoint);
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
