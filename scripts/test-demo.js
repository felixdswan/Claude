/* Automated checks for the GenStay Screener demo, in a real browser.

   - plays a best run and a worst run: four scenarios (the dispute in two
     stages, the second following from the first answer), a 25-second timer
     on every question, no written answers, then one page of matching
     questions with most answers pre-filled
   - every branch of the dispute's follow-up, including a timed-out first answer
   - the market-day pairing: each participant is shown their best fictional
     homeowner from genstay-hosts.sample.json, saved with their run
   - checks the story never mentions something it hasn't set up
   - checks the stored profile against the profile template's data contract,
     including what the conversation pre-fills and the defaults left untouched
   - lets two timers run out and checks how that is recorded
   - opens the demo's staff desk: the profile in the template, and the PDF and
     JSON downloads
   - adds host profiles on the Hosts and matches tab (the sample hosts file,
     pasted spreadsheet rows, the CSV template), checks the suggested pairings
     and their reasons, suggests one, and changes and removes a host
   - market day: two participants play on one tablet (one shared account)
     while the staff screen shows the Live board; each arrives on the board
     and in the queue as their own applicant, without pressing Refresh
   - checks the applicant's own profile download, with and without the
     artifact runtime
   - estimates how long a run takes from the words on each screen

   Usage: node scripts/test-demo.js [outdir]   (default: /tmp/genstay-screener-demo-out)
   Set PDF_LIBS as for test-playthrough.js where cdnjs is blocked. */
const { chromium, serve, newPageFactory, storyDataProblems } = require("./browser-harness");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || "/tmp/genstay-screener-demo-out";
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const newPage = newPageFactory(errors, "genstay-screener.demo.html");
const words = (t) => String(t || "").split(/\s+/).filter(Boolean).length;
const HOSTS_FILE = path.resolve(__dirname, "../game/genstay-hosts.sample.json");
const PATTERN_TAGS = ["scam_ignored", "friction_defensive", "dispute_blamed"];
const SCENARIO_DAYS = "[1,4,8,10,14]";

async function start(page, name, area) {
  await page.fill("#fname", name);
  if (area) await page.selectOption("#study-area", area);
  await page.check("#c1"); await page.check("#c2");
  await page.click("#begin");
}

/* Plays the four scenarios. timeOut lists the scenarios (as the applicant sees
   them) whose first question is left to run out. `pick` (optional) chooses an
   option by tag. Returns what each screen showed. */
async function play(page, mode, { timeOut = [], pick: choose } = {}) {
  const trace = { days: new Set(), timers: [], screens: [], textareas: 0, text: [] };
  for (let guard = 0; guard < 100; guard++) {
    const st = await page.evaluate(() => {
      const s = window.S;
      if (s.view !== "play") return { view: s.view };
      const day = window.DAYS[s.di], step = day.steps[s.si];
      return { view: s.view, phase: s.phase, show: day.show, t: step.t, noReply: !!step.noReply,
        scores: step.options ? step.options.map((o) => (o.fx ? o.fx.connection + o.fx.respect + o.fx.reliability + o.fx.awareness : 0)) : [],
        tags: step.options ? step.options.map((o) => o.tag) : [],
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
    if (!(await page.$("#tbar"))) errors.push("demo: no timer bar in scenario " + st.show);
    const before = await page.evaluate(() => S.choices.length);
    if (timeOut.includes(st.show) && !trace.timedOut?.[st.show]) {
      trace.timedOut = Object.assign(trace.timedOut || {}, { [st.show]: true });
      await page.evaluate(() => { S.timerRemaining = 1; render(); });   // run this timer out in 1 second
      await page.waitForFunction((n) => S.choices.length > n, before, { timeout: 5000 });
      if (!st.noReply && !/No answer in time/.test(await page.textContent("#panel"))) errors.push("demo: no timeout message in scenario " + st.show);
      continue;
    }
    /* "pattern": a part fail wherever there is one, the best answer elsewhere */
    const wanted = choose ? st.tags.findIndex((t) => choose.indexOf(t) !== -1) : -1;
    const partFail = wanted !== -1 ? wanted : mode === "pattern" ? st.tags.findIndex((t) => PATTERN_TAGS.indexOf(t) !== -1) : -1;
    const pick = partFail !== -1 ? partFail : st.scores.every((x) => x === 0) ? (mode === "worst" ? 1 : 2)
      : st.scores.indexOf(mode === "worst" ? Math.min(...st.scores) : Math.max(...st.scores));
    await page.click(`.opt[data-i="${pick}"]`);
    await page.waitForFunction((n) => S.choices.length > n, before, { timeout: 5000 });
  }
  throw new Error("run did not finish");
}

/* One page: campus, gender, time together, help and hobbies, with the rest
   pre-filled. extra.prefill changes pre-filled answers: {pets, homeownerGender}. */
async function answerQuestions(page, extra = {}) {
  await page.waitForSelector("#qnext");
  if (!/four scenarios with Marg are done/.test(await page.textContent(".qhead"))) errors.push("demo: questionnaire intro doesn't count four scenarios");
  const shown = await page.$$eval(".qgrid", (g) => [g[0].querySelectorAll(":scope > .qfield").length, document.querySelectorAll("#prefill .qfield").length]);
  if (shown[0] !== 5 || shown[1] !== 14) errors.push("demo: expected 5 questions and 14 pre-filled answers, found " + shown.join(" and "));
  if (await page.evaluate(() => document.getElementById("prefill").open)) errors.push("demo: the pre-filled answers open by themselves");
  await page.click("#qnext");                                  // campus and gender left empty: must be stopped
  for (const id of ["campus", "gender"]) if (!(await page.$("#qf-" + id + ".bad"))) errors.push("demo: empty " + id + " was accepted");
  if (await page.$("#qf-socialLevel.bad") || await page.$("#qf-helpTypes.bad")) errors.push("demo: pre-filled time together or help was flagged");
  const campuses = await page.$$eval("#q-campus option", (o) => o.map((x) => x.value).filter(Boolean));
  if (campuses.join() !== "UTS City Campus,USyd Camperdown,UNSW Kensington,Macquarie Uni,WSU Parramatta,Another campus") errors.push("demo: campus options aren't the hosts' campuses: " + campuses.join(", "));
  await page.selectOption("#q-campus", extra.campus || "UTS City Campus");
  await page.click('[data-one="gender"][data-v="' + (extra.gender || "Female") + '"]');
  if (extra.social) await page.click('[data-one="socialLevel"][data-v="' + extra.social + '"]');
  if (extra.hobby) await page.click('[data-multi="hobbies"][data-v="' + extra.hobby + '"]');
  /* the pre-filled answers: typical values, all valid, and changeable */
  const moves = await page.$$eval("#q-moveInDate option", (o) => o.map((x) => x.value).filter(Boolean));
  if (moves.length !== 4 || !moves.every((v) => /^\d{4}-\d{2}-01$/.test(v)) || moves[0] <= new Date().toISOString().slice(0, 10)) errors.push("demo: move-in options aren't the next few months: " + moves.join(", "));
  const defaults = await page.evaluate(() => ({ age: S.q.age, move: S.q.moveInDate, rent: S.q.rentBudgetWeekly, smoking: S.q.smoking, pets: S.q.pets, career: S.q.careerGoal, langs: S.q.languages }));
  if (defaults.age !== "21" || defaults.move !== moves[1] || defaults.rent !== "150" || defaults.smoking !== "either" || defaults.pets !== "happy" || !defaults.career || defaults.langs.join() !== "English")
    errors.push("demo: unexpected pre-filled answers: " + JSON.stringify(defaults));
  if (extra.careers) {
    const careers = await page.$$eval("#q-careerGoal option", (o) => o.map((x) => x.value).filter(Boolean));
    if (JSON.stringify(careers) !== JSON.stringify(extra.careers)) errors.push("demo: career options don't follow the area of study: " + careers.join(", "));
  }
  if (extra.prefilledMentor && (await page.inputValue("#q-fieldMentor")) !== extra.prefilledMentor) errors.push("demo: the conversation didn't pre-fill the field-mentor answer");
  if (extra.prefill || extra.checkAge) {
    await page.click("#prefill summary");
    if (extra.checkAge) {                                      // a pre-filled answer made invalid: stopped, and the section opens
      await page.fill("#q-age", "17");
      await page.evaluate(() => { document.getElementById("prefill").open = false; });
      await page.click("#qnext");
      if (!(await page.$("#qf-age.bad")) || !(await page.evaluate(() => document.getElementById("prefill").open))) errors.push("demo: age 17 in the pre-filled answers was accepted, or hidden");
      await page.fill("#q-age", "21");
    }
    for (const [k, v] of Object.entries(extra.prefill || {})) {
      if (k === "pets") await page.click('[data-one="pets"][data-v="' + v + '"]');
      else await page.selectOption("#q-" + k, v);
    }
  }
  if (await page.$(".qfield.bad")) errors.push("demo: error highlights stayed after every answer was fixed");
  await page.screenshot({ path: path.join(OUT, "questions.png"), fullPage: true });
  await page.click("#qnext");
  await page.waitForSelector("#savestat");
  await page.waitForFunction(() => /reached|couldn|can’t|switched off|refused/.test(document.getElementById("savestat").textContent), null, { timeout: 12000 });
  return matchCard(page);
}

/* The participant's demo pairing, as the results screen shows it. */
async function matchCard(page) {
  return page.evaluate(() => {
    const box = document.getElementById("matchcard"), q = (sel) => { const n = box && box.querySelector(sel); return n ? n.textContent.trim() : ""; };
    return { saved: window.S.demoMatch, kicker: q(".mc-kicker"), name: q(".mc-name"), sub: q(".mc-sub"), score: q(".mc-score b"),
      why: box ? [...box.querySelectorAll(".mc-why li")].map((n) => n.textContent) : [], text: box ? box.textContent : "",
      note: (document.getElementById("resultnote") || {}).textContent || "" };
  });
}
/* Shortlisted, waiting for a suitable host: no homeowner named, the bar and what held it back. */
function waitingChecks(card, label) {
  const m = card.saved;
  if (!m || m.status !== "waiting" || card.kicker !== "Shortlisted" || !/Waiting for a suitable host/.test(card.name)) { errors.push(label + ": no waiting screen: " + JSON.stringify(card)); return; }
  if (!/we only place pairings of 65 or more/.test(card.text) || !/What held it back:/.test(card.text) || m.score >= 65) errors.push(label + ": the waiting screen doesn't explain the bar: " + card.text);
  if (card.text.indexOf(m.first) !== -1) errors.push(label + ": the waiting screen names the closest homeowner");
}
/* No placement: an answer in the game rules one out, and the participant is told what to do instead. */
function screenedOutChecks(card, label, want) {
  const m = card.saved;
  if (!m || m.status !== "screened_out" || m.hostId || card.kicker !== "No placement this time") { errors.push(label + ": not screened out: " + JSON.stringify(card)); return; }
  want.forEach((w) => { if (!w.test(card.text)) errors.push(label + ": the screened-out card doesn't say " + w); });
  if (/\d+\s*match/.test(card.text)) errors.push(label + ": a screened-out participant was shown a score");
  if (/not a pass-or-fail/.test(card.note)) errors.push(label + ": a screened-out participant is told there's no pass or fail");
}
/* The newest run saved on the (one, shared) account. */
const runDoc = (page) => page.evaluate(() => Object.keys(window.__store).filter((k) => /^profiles\/applicant-1\/runs\//.test(k))
  .map((k) => window.__store[k]).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))[0] || null);
function cardChecks(card, label) {
  const m = card.saved;
  if (!m || m.status !== "matched" || !m.hostId || !card.name) { errors.push(label + ": no demo match on the results screen (" + (m && m.status) + ")"); return; }
  if (m.score < 65) errors.push(label + ": matched at " + m.score + ", under the bar of 65");
  if (card.name.indexOf(m.first) !== 0 || card.score !== String(m.score) || !/made up for this demo/.test(card.text)) errors.push(label + ": the match card doesn't show the match: " + JSON.stringify(card));
  if (!card.why.length || card.why.some((t) => /undefined|null|NaN/.test(t))) errors.push(label + ": the match card gives no reasons: " + JSON.stringify(card.why));
}

/* Nothing on screen is a placeholder or a stale count, and each scenario says what it needs. */
function storyChecks(trace, mode) {
  const all = trace.text.join("\n");
  if (/\{\{|\}\}/.test(all)) errors.push(mode + ": a {{placeholder}} reached the screen");
  if (/\bDay \d+ of\b|nine days|eight days/i.test(all)) errors.push(mode + ": a screen still counts days");
  for (const n of [1, 2, 3, 4]) if (!new RegExp("Scenario " + n + " of 4", "i").test(all)) errors.push(mode + ": no screen is labelled Scenario " + n + " of 4");
  if (!/fallen on the loose brick step/.test(all) || !/hit her head/.test(all)) errors.push(mode + ": the emergency doesn’t set up the fall and the head knock");
  if (mode === "best" && !/she was a nurse for thirty-five years/.test(all)) errors.push(mode + ": the conversation doesn’t use the health career");
}

/* The Hosts and matches tab, on the store the worst run left. Sam Lee (the
   worst run) is kept out of matching by screening; Jenny Graffet (the sample
   profile, shortlisted by staff for Helen Whitcombe) and Pat Ward (a teaching
   student) are added as files. Then the fifteen sample hosts as a JSON file, and
   Joan pasted as spreadsheet rows. */
async function hostsTab(page) {
  const out = {};
  const download = async (filename) => page.evaluate((f) => { const d = window.__downloads.filter((x) => x.filename === f).pop(); return d && d.data; }, filename);
  const sample = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../genstay/genstay-profile.sample.json"), "utf8"));
  const jenny = JSON.parse(JSON.stringify(sample));
  jenny.meta.suggestedFor = "Helen Whitcombe";
  const pat = JSON.parse(JSON.stringify(sample));
  pat.meta = Object.assign(pat.meta, { profileId: "PP-pat", pairingStatus: "new", suggestedFor: null });
  Object.assign(pat.student, { firstName: "Pat", lastName: "Ward", discipline: "education", course: "Bachelor of Education (Primary)", languages: ["English", "Vietnamese"] });
  Object.assign(pat.interests, { careerGoal: "Primary teaching", fieldMentor: "keen", hobbies: ["Cooking and baking", "Gardening"], wantsToLearn: [] });
  Object.assign(pat.placement, { campus: "WSU Parramatta", moveInDate: "2027-03-01" });
  pat.student.age = 27; pat.lifestyle.socialLevel = 3;
  await page.setInputFiles("#importer", [
    { name: "jenny.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(jenny)) },
    { name: "pat.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pat)) }]);
  await page.waitForFunction(() => document.querySelectorAll("#qlist .qitem").length === 3, null, { timeout: 5000 });

  await page.click("#tab-hosts");
  await page.waitForFunction(() => /host profile|placement record/.test(document.getElementById("hstat").textContent), null, { timeout: 8000 });
  if (!/No host profiles yet/.test(await page.textContent("#mbody"))) errors.push("hosts: empty tab doesn't explain how to add hosts");
  await page.click("#hosttemplate");
  await page.waitForFunction(() => window.__downloads.some((d) => d.filename === "genstay-host-template.csv"), null, { timeout: 5000 });
  if (!/^﻿Host ID,Status,Host fit/.test(await download("genstay-host-template.csv"))) errors.push("hosts: template CSV is missing its headings");

  /* the hosts published beside the page load with one click */
  await page.waitForFunction(() => { const b = document.getElementById("hostsample"); return b && !b.hidden; }, null, { timeout: 5000 })
    .catch(() => errors.push("hosts: no Load sample hosts button"));
  if ((await page.textContent("#hostsample")) !== "Load sample hosts (15)") errors.push("hosts: the sample button doesn't say how many: " + (await page.textContent("#hostsample")));
  await page.click("#hostsample");
  await page.waitForFunction(() => document.querySelectorAll("#hlist .qitem").length === 15, null, { timeout: 5000 });
  const rows = ["First name\tLast name\tGender\tSuburb\tFormer career\tPayment a week\tAvailable from\tShortest stay (months)\tCommute minutes\tSharer gender\tHours a week\tHelp wanted\tTime together (1-5)\tHobbies\tSmoke-free home\tPets",
    "Joan\tPrice\tFemale\tAshfield\tPrimary school teacher\t140\t1/2/2027\t6\tUTS City Campus: 30; USyd Camperdown: 25\tAny\t8-10\tcompanionship; gardening\t2\tReading; Gardening\tYes\t"].join("\n");
  await page.click("#hostpastebtn");
  await page.fill("#hostpastein", rows);
  await page.click("#hostpasteadd");
  await page.waitForFunction(() => document.querySelectorAll("#hlist .qitem").length === 16, null, { timeout: 5000 });
  out.stored = await page.evaluate(() => Object.keys(window.__store).filter((k) => /^hosts\//.test(k)).length);
  if (out.stored !== 16) errors.push("hosts: " + out.stored + " host profiles stored, not 16");
  const joan = await page.evaluate(() => window.__store["hosts/H-joan-price-ashfield"]);
  if (!joan || joan.placement.campusCommuteMins["UTS City Campus"] !== 30 || joan.support.lodgerPaymentWeekly !== 140) errors.push("hosts: pasted row not read: " + JSON.stringify(joan && joan.placement));
  const kevPill = await page.textContent('#hlist .qitem:has-text("Kev Doyle")');
  if (!/On hold/.test(kevPill)) errors.push("hosts: Kev's status isn't shown in the list: " + kevPill);
  if (await page.isVisible("#hoverview")) await page.click("#hoverview");
  await page.waitForTimeout(300);

  /* Helen keeps the staff's pairing with Jenny; Pat is suggested; Sam is kept out; Kev (on hold) gets nobody */
  const m = await page.evaluate(() => ({
    pairings: desk.match.pairings.map((p) => ({ host: p.hostId, hostName: p.hostName, who: p.studentName, id: p.studentId, score: p.score, locked: !!p.locked, hostFit: p.hostFit, studentFit: p.studentFit }))
  }));
  out.pairings = m.pairings.map((p) => p.hostName + " + " + p.who + " " + p.score + (p.locked ? " (staff)" : ""));
  if (!m.pairings.some((p) => p.host === "GH-2027-001" && p.who === "Jenny Graffet" && p.locked)) errors.push("hosts: the staff's pairing of Jenny with Helen wasn't kept: " + out.pairings.join(", "));
  const patPair = m.pairings.find((p) => p.who === "Pat Ward");
  if (!patPair) errors.push("hosts: Pat Ward wasn't given a pairing: " + out.pairings.join(", "));
  if (m.pairings.some((p) => p.host === "GH-2027-009")) errors.push("hosts: Kev, on hold, was given a sharer");
  if (m.pairings.some((p) => /Sam/.test(p.who))) errors.push("hosts: Sam Lee (worst run) was paired");
  if (!m.pairings.every((p) => p.hostFit > 0 && p.studentFit > 0)) errors.push("hosts: a pairing doesn't carry both sides' fit");
  const samOut = await page.evaluate(() => Object.values(desk.match.students).filter((s) => s.excluded.length).map((s) => s.excluded.join(" ")));
  if (!samOut.some((t) => /Transactional Guest/.test(t))) errors.push("hosts: Sam Lee (worst run) wasn't kept out of matching: " + JSON.stringify(samOut));
  const overview = await page.textContent("#mbody");
  if (!/scored from both sides/.test(overview) || !/most suitable pairings overall/.test(overview)) errors.push("hosts: the overview doesn't explain how pairings are made");
  if (!/For Pat \d+/.test(overview.replace(/\s+/g, " "))) errors.push("hosts: pairing cards don't show each side's fit");
  await page.screenshot({ path: path.join(OUT, "hosts-overview.png") });

  if (patPair) {
    await page.click('.mcard:has-text("Pat Ward") [data-suggest]');
    await page.waitForFunction(() => /shortlisted for/.test(document.getElementById("mstat").textContent), null, { timeout: 5000 });
    const review = await page.evaluate(() => window.__store["reviews/import-PP-pat"]);
    out.patHost = patPair.hostName;
    if (!review || review.pairingStatus !== "shortlisted" || review.suggestedHostId !== patPair.host) errors.push("hosts: suggesting the pairing didn't update Pat's review: " + JSON.stringify(review));
    if (!/Shortlisted by staff/.test(await page.textContent("#mbody"))) errors.push("hosts: the pairing isn't marked as made once suggested");
  }

  /* one host up close: facts, ranked applicants, who was ruled out, status, removal */
  await page.click('#hlist .qitem:has-text("Bob Ashdown")');
  await page.waitForSelector("#hst-status");
  const detail = await page.textContent("#mbody");
  if (!/paediatric surgeon/i.test(detail) || !/Best applicants for Bob/.test(detail) || !/Ruled out/.test(detail)) errors.push("hosts: host view is missing facts, rankings or the ruled-out list");
  await page.click("details.out summary");
  if (!/Sam Lee:.*Transactional Guest/.test(await page.textContent("details.out"))) errors.push("hosts: Sam's reason isn't in Bob's ruled-out list");
  await page.screenshot({ path: path.join(OUT, "hosts-bob.png") });
  await page.selectOption("#hst-status", "on_hold");
  await page.waitForFunction(() => window.__store["hosts/GH-2027-002"].meta.pairingStatus === "on_hold", null, { timeout: 5000 });
  await page.click('#hlist .qitem:has-text("Joan Price")');
  await page.click("#hremove");
  if (!/Click again/.test(await page.textContent("#hremove"))) errors.push("hosts: removal didn't ask for a second click");
  await page.click("#hremove");
  await page.waitForFunction(() => !window.__store["hosts/H-joan-price-ashfield"], null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll("#hlist .qitem").length === 15, null, { timeout: 5000 })
    .catch(() => errors.push("hosts: removed host still listed"));

  /* one host file replaces Helen (same host id), and the spreadsheet export */
  const helen = JSON.parse(fs.readFileSync(HOSTS_FILE, "utf8")).hosts[0];
  await page.setInputFiles("#hostimporter", { name: "helen.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(helen)) });
  await page.waitForFunction(() => /Added 1 host profile/.test(document.getElementById("hstat").textContent), null, { timeout: 5000 });
  if ((await page.$$("#hlist .qitem")).length !== 15) errors.push("hosts: re-importing Helen added a duplicate instead of replacing her");
  await page.click("#hostexport");
  await page.waitForFunction(() => window.__downloads.some((d) => /^genstay-hosts-.*\.csv$/.test(d.filename)), null, { timeout: 5000 });
  const exported = await page.evaluate(() => window.__downloads.filter((d) => /^genstay-hosts-/.test(d.filename)).pop().data);
  out.exportedRows = exported.trim().split(/\r?\n/).length - 1;
  if (out.exportedRows !== 15) errors.push("hosts: export has " + out.exportedRows + " rows, not 15");

  /* the applicant review panel: Pat's best homeowners; Sam's reason for being left out */
  await page.click("#tab-app");
  await page.click('.qitem:has-text("Pat Ward")');
  await page.waitForFunction(() => /\d/.test((document.getElementById("rv-best") || {}).textContent || ""), null, { timeout: 5000 });
  out.patPanel = (await page.textContent("#rv-best")).replace(/\s+/g, " ").trim();
  const patFor = await page.inputValue("#rv-for");
  if (patPair && !patFor) errors.push("hosts: Pat's review panel doesn't show the suggested homeowner");
  await page.screenshot({ path: path.join(OUT, "staff-desk-best-homeowners.png") });
  await page.click('.qitem:has-text("Sam Lee")');
  await page.waitForFunction(() => /Not matched automatically/.test((document.getElementById("rv-best") || {}).textContent || ""), null, { timeout: 5000 });
  /* typing a homeowner by hand links the review to that host too */
  await page.click('.qitem:has-text("Jenny Graffet")');
  await page.waitForSelector("#rv-for");
  await page.fill("#rv-for", "Ruth Abramson");
  await page.click("#rv-save");
  await page.waitForFunction(() => (window.__store["reviews/import-GS-2027-0142"] || {}).suggestedHostId === "GH-2027-005", null, { timeout: 5000 })
    .catch(() => errors.push("hosts: a homeowner typed into the review wasn't linked to the host"));

  /* the live board: Sam's card shows the match he was shown; Jenny and Pat get their best host here */
  await page.click("#tab-board");
  await page.waitForFunction(() => document.querySelectorAll("#board-grid .bcard").length === 3, null, { timeout: 5000 })
    .catch(() => errors.push("hosts: the live board doesn't show the three applicants"));
  const board = await page.$$eval("#board-grid .bcard", (cards) => cards.map((c) => c.innerText.replace(/\s+/g, " ")));
  if (!board.some((t) => /^Sam .*not placed this time/i.test(t)) || board.some((t) => /^Sam .*(lifted|shook|000)/i.test(t))) errors.push("hosts: Sam's board card doesn't show 'not placed' (without the reasons): " + board.join(" | "));
  const stats = (await page.textContent("#board-stats")).replace(/\s+/g, " ");
  if (!/3 played/.test(stats) || !/1 not placed/.test(stats)) errors.push("hosts: the board doesn't count who played and who wasn't placed: " + stats);
  out.board = board;
  await page.screenshot({ path: path.join(OUT, "live-board.png") });

  /* deleting: loading the sample again asks first; then all hosts, one applicant at a time, and everyone shown */
  await page.click("#tab-hosts");
  await page.click("#hostsample");
  if (!/Click again to replace 15 hosts already here/.test(await page.textContent("#hostsample"))) errors.push("hosts: reloading the sample didn't ask before replacing: " + (await page.textContent("#hostsample")));
  await page.click("#hostsample");
  await page.waitForFunction(() => document.querySelectorAll("#hlist .qitem").length === 15 && window.__store["hosts/GH-2027-002"].meta.pairingStatus === "screening", null, { timeout: 5000 })
    .catch(() => errors.push("hosts: reloading the sample didn't restore the hosts"));
  await page.click("#hostdelall");
  if (!/Click again to delete all 15/.test(await page.textContent("#hostdelall"))) errors.push("hosts: Delete all hosts didn't ask for a second click");
  await page.click("#hostdelall");
  await page.waitForFunction(() => !Object.keys(window.__store).some((k) => /^hosts\//.test(k)) && !document.querySelectorAll("#hlist .qitem").length, null, { timeout: 5000 })
    .catch(() => errors.push("hosts: Delete all hosts left hosts behind"));
  await page.click("#tab-app");
  const del = async (name) => {
    await page.click('#qlist .qitem:has-text("' + name + '")');
    await page.waitForFunction((n) => document.getElementById("vname").textContent === n, name, { timeout: 5000 });
    await page.click("#delone");
    if (!/Click again to delete/.test(await page.textContent("#delone"))) errors.push("delete: " + name + " wasn't asked to confirm");
    await page.click("#delone");
    await page.waitForFunction((n) => ![...document.querySelectorAll("#qlist .qitem .nm")].some((x) => x.textContent === n), name, { timeout: 5000 })
      .catch(() => errors.push("delete: " + name + " is still in the queue"));
  };
  await del("Pat Ward");
  const patLeft = await page.evaluate(() => Object.keys(window.__store).filter((k) => /PP-pat/.test(k)));
  if (patLeft.length) errors.push("delete: Pat's records are still stored: " + patLeft.join(", "));
  await del("Sam Lee");
  const samLeft = await page.evaluate(() => Object.keys(window.__store).filter((k) => /^profiles\/applicant-1/.test(k)));
  if (samLeft.length) errors.push("delete: Sam's run, or the account's copy of it, is still stored: " + samLeft.join(", "));
  await page.click("#delshown");
  if (!/Click again to delete 1 applicant/.test(await page.textContent("#delshown"))) errors.push("delete: Delete shown doesn't say how many: " + (await page.textContent("#delshown")));
  await page.click("#delshown");
  await page.waitForFunction(() => !Object.keys(window.__store).some((k) => /^(profiles|reviews)\//.test(k)) && document.getElementById("vname").textContent === "No profile open", null, { timeout: 5000 })
    .catch(async () => errors.push("delete: Delete shown left records behind: " + (await page.evaluate(() => Object.keys(window.__store).join(", ")))));
  if (!(await page.isDisabled("#delone"))) errors.push("delete: Delete applicant is still enabled with no profile open");
  out.afterDeleting = await page.textContent("#astat");
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

  /* the story data, the start page, and the four scenarios */
  {
    const { ctx, page } = await newPage(browser, base);
    (await storyDataProblems(page)).forEach((p) => errors.push("story: " + p));
    if (await page.$("#femail")) errors.push("start: the email field is still there");
    if (!/GenStay Screener/.test(await page.textContent("h1")) || (await page.title()) !== "GenStay Screener demo") errors.push("start: not named GenStay Screener: " + (await page.title()));
    const shape = await page.evaluate(() => DAYS.map((d) => d.show + ":" + d.n + ":" + d.steps.filter((s) => s.t === "choice").length).join(" "));
    if (shape !== "1:1:1 2:4:1 3:8:1 3:10:3 4:14:1") errors.push("story: the scenarios aren't conversation, agency, a two-stage dispute and the emergency: " + shape);
    /* the program takes students from six fields only */
    const areas = await page.$$eval("#study-area option", (o) => o.map((x) => x.value).filter(Boolean));
    if (areas.join() !== "health,carework,allied_health,social_work,psychology,education,other") errors.push("start: study areas aren't the program's: " + areas.join(", "));
    /* on a later market day the sample rooms' dates move forward with the calendar */
    const months = (() => { const n = new Date(); return (n.getFullYear() - 2026) * 12 + n.getMonth() + 1 - 8; })();
    const moved = await page.evaluate(() => [freshDates([{ placement: { availableFrom: "2027-02-01" } }], "2026-08-01")[0].placement.availableFrom,
      freshDates([{ placement: { availableFrom: "2027-02-01" } }], "2999-01-01")[0].placement.availableFrom]);
    const want = new Date(2027, 1 + months, 1);
    if (moved[0] !== want.getFullYear() + "-" + String(want.getMonth() + 1).padStart(2, "0") + "-01" || moved[1] !== "2027-02-01") errors.push("demo: the sample hosts' dates don't follow the calendar: " + moved.join(", "));
    await ctx.close();
  }

  /* best and worst runs, then the staff desk on the worst run's record store */
  for (const mode of ["best", "worst"]) {
    const { ctx, page } = await newPage(browser, base);
    await start(page, mode === "best" ? "Jenny Graffet" : "Sam Lee", mode === "best" ? "health" : "education");
    const trace = await play(page, mode);
    if (trace.days.size !== 4) errors.push(mode + ": played " + trace.days.size + " scenarios, not 4");
    if (trace.timers.length !== 5) errors.push(mode + ": answered " + trace.timers.length + " questions, not 5");
    storyChecks(trace, mode);
    if (trace.textareas) errors.push(mode + ": a written-answer box appeared");
    if (trace.timers.some((t) => t !== "25s")) errors.push(mode + ": timers were " + trace.timers.join(", "));
    const card = await answerQuestions(page, mode === "best"
      ? { prefilledMentor: "keen", careers: ["Nursing", "Midwifery", "Medicine", "Paramedicine", "Pharmacy", "Not sure yet"], hobby: "Gardening", checkAge: true }
      : { gender: "Male", social: 2, prefill: { pets: "allergic" } });
    await page.screenshot({ path: path.join(OUT, "results-" + mode + ".png"), fullPage: true });
    if (mode === "best") cardChecks(card, mode);
    else screenedOutChecks(card, mode, [/Safety comes first/, /room to rent/, /gave Marg water and sat her up/, /anything to drink/,
      /deleted it yourself/, /pay rent/, /hung up/, /coordinator would talk this through/]);
    const doc = await runDoc(page), parent = await page.evaluate(() => window.__store["profiles/applicant-1"]);
    const p = doc && doc.profile, sc = p && p.screening;
    if (!doc || !doc.complete) { errors.push(mode + ": profile not saved"); continue; }
    if (!parent || parent.latestRun !== doc.pid || parent.runs) errors.push(mode + ": the account's index doesn't point at the latest run: " + JSON.stringify(parent && { latestRun: parent.latestRun, runs: parent.runs }));
    if (!doc.demoMatch || !card.saved || doc.demoMatch.status !== card.saved.status || doc.demoMatch.hostId !== card.saved.hostId) errors.push(mode + ": the outcome wasn't saved with the run");
    if (!/^DEMO-/.test(p.meta.profileId)) errors.push(mode + ": profile id isn't marked as a demo");
    if (JSON.stringify(sc.pathByDay.map((x) => x.day)) !== SCENARIO_DAYS) errors.push(mode + ": path days " + JSON.stringify(sc.pathByDay));
    const it = p.interests || {}, hh = p.household || {}, su = p.support || {};
    if (p.student.email !== undefined) errors.push(mode + ": the profile still carries an email");
    if (hh.smoker !== false || hh.needsSmokeFree !== false || hh.okWithPets !== (mode === "best") || hh.petAllergy !== (mode !== "best"))
      errors.push(mode + ": the pre-filled smoking and pets answers (and the change to pets) didn't fill the profile: " + JSON.stringify(hh));
    if (p.placement.campus !== "UTS City Campus" || p.student.age !== 21 || p.support.rentBudgetWeekly !== 150) errors.push(mode + ": campus or pre-filled answers not in the profile");
    if (mode === "best") {
      if (it.careerGoal !== "Nursing" || it.fieldMentor !== "keen" || it.homeownerBackground !== "Retired nurse") errors.push("best: the conversation didn't pre-fill career answers: " + JSON.stringify(it));
      if (p.lifestyle.socialLevel !== 4 || JSON.stringify(p.student.languages) !== '["English"]' || JSON.stringify(it.hobbies) !== '["Gardening"]') errors.push("best: time together, languages or hobbies not in the profile");
      if (JSON.stringify(su.helpTypes) !== '["Company and conversation","Cooking shared meals","Shopping and errands","Tech and phone help"]') errors.push("best: the scenarios didn't pre-fill the help offered: " + JSON.stringify(su.helpTypes));
      /* the best run changed the age (to test it), so it isn't listed; the rest were left as they were */
      if (!/Left at the demo’s typical answers: move-in month, length of stay, rent budget,/.test(sc.watchPoint) || /typical answers: age/.test(sc.watchPoint)) errors.push("best: staff aren't told which answers were left at the defaults: " + sc.watchPoint);
    } else {
      if (it.careerGoal !== "Early childhood teaching" || it.fieldMentor !== "open" || p.lifestyle.socialLevel !== 2 || p.student.gender !== "Male") errors.push("worst: answers not in the profile: " + JSON.stringify(it));
      if (/typical answers: [^.]*pets/.test(sc.watchPoint)) errors.push("worst: a changed pre-filled answer is reported as left at the default: " + sc.watchPoint);
    }
    if (JSON.stringify(sc.landmarks.map((x) => x.day)) !== SCENARIO_DAYS || !sc.landmarks.every((x) => /^Scenario \d: /.test(x.title))) errors.push(mode + ": scenario landmarks " + JSON.stringify(sc.landmarks.map((x) => x.day + " " + x.title)));
    const days = [...new Set((sc.choices || []).map((c) => c.day))];
    if (JSON.stringify(days) !== SCENARIO_DAYS || sc.choices.some((c) => !c.tag)) errors.push(mode + ": not every scenario's choices were saved for screening: " + JSON.stringify(sc.choices));
    if (sc.flags.indexOf("quick_demo") === -1 || !/^Quick demo: four scenarios/.test(sc.watchPoint)) errors.push(mode + ": not marked as a quick demo for staff");
    if ((await page.$$(".rows .row")).length !== 5) errors.push(mode + ": results don't list the five choices");
    if (!/and Marg$/.test((await page.textContent("h1")).trim())) errors.push(mode + ": results heading: " + (await page.textContent("h1")));
    const st = await contract(browser, base, p, mode);
    report[mode] = { type: sc.profile, meters: sc.meters, lowest: sc.lowestMoment, path: sc.finalPath, choices: await page.evaluate(() => S.choices.length), templateFilled: st.filled + "/" + st.total,
      demoMatch: card.kicker + ": " + card.name + (card.sub ? " · " + card.sub + " · " + card.score : ""), reasons: card.why.length ? card.why : (card.saved.reasons || []) };
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
      /* the screening and matching slot of the presentation is about five minutes, explanation included */
      if (report.timing.gameMinutesAt250wpm > 1.5 || report.timing.gameMinutesAt200wpm > 1.8)
        errors.push("timing: the scenarios take " + report.timing.gameMinutesAt250wpm + " minutes at a typical 250 words a minute (" + report.timing.gameMinutesAt200wpm + " at 200); the slot needs about a minute and a half");
    }
    if (mode === "worst") {
      await page.evaluate(() => { location.hash = "staff"; });
      await page.setViewportSize({ width: 1360, height: 980 });
      await page.waitForSelector(".qitem");
      await page.waitForFunction(() => /fields filled/.test((document.getElementById("fstat") || {}).textContent || ""), null, { timeout: 8000 });
      const pills = await page.$$eval(".qitem .pill", (x) => x.map((n) => n.textContent));
      if (pills.indexOf("Quick demo") === -1) errors.push("staff: no Quick demo label in the queue (" + pills.join(", ") + ")");
      if (pills.indexOf("Not placed: screening") === -1) errors.push("staff: the queue doesn't show that the run was screened out (" + pills.join(", ") + ")");
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

  /* two timers run out: the conversation, and the dispute's first answer (which then reads as waiting, so the note follows) */
  {
    const { ctx, page } = await newPage(browser, base);
    await ctx.route("**/genstay-hosts.sample.json", (r) => r.abort());       // the hosts file can't load: results still work
    await start(page, "Tim Out", "carework");
    await play(page, "best", { timeOut: [1, 3] });
    const card = await answerQuestions(page);
    if (card.saved || card.name) errors.push("timeouts: a match was shown without the hosts file");
    if (!/reached the placement service/.test(await page.textContent("#savestat"))) errors.push("timeouts: the profile wasn't sent when the hosts file couldn't load");
    const sc = (await runDoc(page)).profile.screening;
    const missed = await page.evaluate(() => S.choices.filter((c) => c.timedOut).map((c) => c.title));
    if (JSON.stringify(missed) !== '["First evening","The late night"]') errors.push("timeouts: recorded " + JSON.stringify(missed));
    if (sc.flags.indexOf("missed_timer") === -1 || !/Ran out of time on 2 of 5 questions \(First evening, The late night\)/.test(sc.watchPoint)) errors.push("timeouts: not reported to staff: " + sc.watchPoint);
    const followUp = await page.evaluate(() => S.choices.filter((c) => c.day === 10).map((c) => c.tag));
    if (JSON.stringify(followUp) !== '["dispute_talked"]') errors.push("timeouts: a timed-out first answer didn't lead to Marg's note: " + JSON.stringify(followUp));
    report.timeouts = { missed, motivation: sc.motivation, watchPoint: sc.watchPoint };
    await ctx.close();
  }

  /* three part fails and no single fail: screened out, with every reason, even when the hosts file can't load */
  {
    const { ctx, page } = await newPage(browser, base);
    await ctx.route("**/genstay-hosts.sample.json", (r) => r.abort());
    await start(page, "Pat Tern", "social_work");
    await play(page, "pattern");
    const card = await answerQuestions(page);
    screenedOutChecks(card, "pattern", [/No single choice ruled it out, but together these did/, /left it to Marg/, /pay rent/, /overreacted/]);
    if (/Safety comes first/.test(card.text) || /straight up|000/.test(card.text)) errors.push("pattern: the card gives reasons the participant didn't earn: " + card.text);
    const doc = await runDoc(page);
    if (!doc || !doc.demoMatch || doc.demoMatch.status !== "screened_out") errors.push("pattern: the screen-out wasn't saved with the run");
    report.pattern = { reasons: card.saved && card.saved.reasons, note: card.note };
    await page.screenshot({ path: path.join(OUT, "results-pattern.png"), fullPage: true });
    await ctx.close();
  }

  /* the applicant's own download: through the runtime when saving fails, and as a plain browser download */
  {
    const { ctx, page } = await newPage(browser, base);
    await start(page, "Dee Nied", "psychology");
    await play(page, "best");
    await page.evaluate(() => { window.__deny = true; });
    /* a psychology student at Macquarie, allergic to pets, who'd like a female homeowner: no host is strong enough yet */
    const waiting = await answerQuestions(page, { campus: "Macquarie Uni", social: 1, prefill: { pets: "allergic", homeownerGender: "female" } });
    waitingChecks(waiting, "waiting");
    report.waiting = { score: waiting.saved && waiting.saved.score, heldBack: waiting.saved && waiting.saved.shortfall, text: waiting.text.replace(/\s+/g, " ").trim() };
    await page.screenshot({ path: path.join(OUT, "results-waiting.png"), fullPage: true });
    if (!(await page.isVisible("#dl"))) errors.push("download: no Download profile file button when saving failed");
    await page.click("#dl");
    await page.waitForFunction(() => window.__downloads.some((d) => /\.json$/.test(d.filename)), null, { timeout: 5000 });
    const got = await page.evaluate(() => { const d = window.__downloads.pop(); return { filename: d.filename, profile: JSON.parse(d.data) }; });
    if (!/^genstay-profile-DEMO-.*\.json$/.test(got.filename) || got.profile.student.firstName !== "Dee") errors.push("download: runtime download wrong: " + got.filename);
    await ctx.close();

    const local = await newPage(browser, base, { mock: false });
    await start(local.page, "Lou Cal", "education");
    await play(local.page, "best");
    cardChecks(await answerQuestions(local.page), "no runtime");
    const [dl] = await Promise.all([local.page.waitForEvent("download", { timeout: 10000 }), local.page.click("#dl")]);
    const file = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(file);
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved.student.firstName !== "Lou" || !saved.screening || saved.screening.flags.indexOf("quick_demo") === -1) errors.push("download: browser download wrong");
    report.applicantDownload = { runtime: got.filename, browser: dl.suggestedFilename() };
    await local.ctx.close();
  }

  /* market day: the staff screen shows the Live board while two people play on
     one tablet, signed in to the stand's account. Nobody presses Refresh. */
  {
    const { ctx, page: staff } = await newPage(browser, base);
    await staff.evaluate(() => { location.hash = "staff"; });
    await staff.setViewportSize({ width: 1360, height: 900 });
    await staff.waitForSelector("#tab-board");
    await staff.waitForFunction(() => /profile/.test((document.getElementById("astat") || {}).textContent || ""), null, { timeout: 8000 });
    await staff.click("#tab-board");
    if (!/appear here/.test(await staff.textContent("#board-grid"))) errors.push("live: the empty board doesn't say what will appear");
    const tablet = await ctx.newPage();
    tablet.on("pageerror", (e) => errors.push("tablet pageerror: " + e.message));
    tablet.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)\.com|ERR_/.test(m.text())) errors.push("tablet console: " + m.text()); });
    const seen = [];
    for (const [name, area] of [["Ava", "health"], ["Ben", "allied_health"]]) {
      await tablet.goto(base + "/genstay-screener.demo.html");
      await tablet.waitForSelector("#begin");
      await start(tablet, name, area);
      await play(tablet, "best");
      const card = await answerQuestions(tablet, { campus: name === "Ben" ? "USyd Camperdown" : "UNSW Kensington" });
      cardChecks(card, "live " + name);
      const arrived = await staff.waitForFunction((n) => [...document.querySelectorAll("#board-grid .bcard")].find((c) => c.querySelector(".b-person").textContent === n), name, { timeout: 8000 })
        .then(() => true, () => false);
      if (!arrived) { errors.push("live: " + name + " didn't arrive on the board"); continue; }
      const onBoard = await staff.evaluate((n) => { const c = [...document.querySelectorAll("#board-grid .bcard")].find((x) => x.querySelector(".b-person").textContent === n);
        return { fresh: c.classList.contains("fresh"), host: c.querySelector(".b-name") && c.querySelector(".b-name").textContent, score: c.querySelector(".b-score") && c.querySelector(".b-score").textContent }; }, name);
      if (!onBoard.host || onBoard.host.indexOf(card.saved.first) !== 0 || onBoard.score !== String(card.saved.score)) errors.push("live: " + name + "'s board card doesn't show the match they saw: " + JSON.stringify(onBoard));
      if (seen.length && !onBoard.fresh) errors.push("live: " + name + "'s card isn't highlighted as new");
      seen.push(name + " → " + onBoard.host + " " + onBoard.score);
    }
    const queue = await staff.evaluate(() => desk.items.map((it) => ({ id: it.id, name: it.name, match: it.demoMatch && it.demoMatch.first })));
    if (queue.length !== 2 || queue[0].id === queue[1].id || !queue.every((q) => q.match)) errors.push("live: two runs on one account aren't two applicants with their matches: " + JSON.stringify(queue));
    if (!/2 played/.test(await staff.textContent("#board-stats"))) errors.push("live: the board doesn't count two players");
    const subs = await staff.evaluate(() => window.__subs);
    if (subs > 3) errors.push("live: the desk holds " + subs + " live subscriptions; one per account would run out at a busy stand");
    await staff.waitForTimeout(800);                                          // past the arrival animation
    if (!(await staff.$("#board-grid .bcard.fresh"))) errors.push("live: the newest arrival lost its highlight at the next redraw");
    await staff.screenshot({ path: path.join(OUT, "live-board-market-day.png") });
    /* deleting the older run on the shared account: the account's copy stays on the newer one, and the board follows */
    await staff.click("#tab-app");
    await staff.click('#qlist .qitem:has-text("Ava")');
    await staff.waitForFunction(() => document.getElementById("vname").textContent === "Ava", null, { timeout: 5000 });
    await staff.click("#delone"); await staff.click("#delone");
    await staff.waitForFunction(() => desk.items.length === 1, null, { timeout: 5000 }).catch(() => errors.push("live: deleting Ava's run didn't leave one applicant"));
    const acct = await staff.evaluate(() => ({ parent: window.__store["profiles/applicant-1"], runs: Object.keys(window.__store).filter((k) => /\/runs\//.test(k)).map((k) => window.__store[k].profile.student.firstName) }));
    if (JSON.stringify(acct.runs) !== '["Ben"]' || !acct.parent || acct.parent.profile.student.firstName !== "Ben" || acct.parent.latestRun !== queue.find((q) => q.name === "Ben").id)
      errors.push("live: after deleting Ava, the account doesn't point at Ben's run alone: " + JSON.stringify({ runs: acct.runs, parent: acct.parent && acct.parent.profile.student.firstName }));
    await staff.click("#tab-board");
    await staff.waitForFunction(() => /1 played/.test(document.getElementById("board-stats").textContent), null, { timeout: 5000 }).catch(() => errors.push("live: the board still counts a deleted player"));
    await staff.click("#tab-app");
    await staff.evaluate(() => { location.hash = ""; });
    await staff.waitForSelector("#begin");
    if (await staff.evaluate(() => window.__subs) !== 0) errors.push("live: leaving the desk left live subscriptions open");
    report.live = { board: seen, queue: queue.map((q) => q.name + " (" + q.id + ")"), subscriptions: subs };
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) { console.log("\nPROBLEMS:\n" + errors.join("\n")); process.exit(1); }
  console.log("\nall demo checks passed — output in " + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
