/* Automated checks for GenStay Screener, in a real browser.

   Serves game/ over HTTP (the staff desk embeds the profile template in a
   frame, which file:// won't allow), stands in for the artifact runtime with
   an in-memory record store, and then:
     - plays a best-choice run and a worst-choice run end to end, including
       the final questions, and checks the stored profile against the
       template's data contract
     - lets the Day 14 timer run out
     - opens the staff desk, checks the profile reaches the embedded template,
       saves a review, and imports a profile file
     - screenshots every day's scene, the questionnaire, results and the desk

   Usage: node scripts/test-playthrough.js [outdir]   (default: /tmp/genstay-screener-out) */
const { chromium, serve, newPageFactory, storyDataProblems } = require("./browser-harness");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || "/tmp/genstay-screener-out";
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const newPage = newPageFactory(errors, "genstay-screener.html");

const TEXT = {
  best: {
    D3: "I'd ask what she remembers about her first year and the advice she wishes someone had given her. In return I could help update and share her old notes.",
    D5: "I can't today because the assignment is due, but could we go to the garden together on Sunday? I'd love to meet the neighbours.",
    D10: "I want to understand where her view comes from and listen properly, and I'd like her to know I feel at home living here and respect her.",
    D13: "Thank you for letting me be part of your home. I'm sorry I wasn't always there, and I'd like us to keep talking honestly together."
  },
  hostile: { /* a deliberately unsuitable applicant: sensible clicks, hostile writing */
    D3: "ok jit you old as this my house now jitty",
    D5: "i gotta study granny give me some gummy gummy wagwan",
    D10: "nah get on with cacking it im ready for the house",
    D13: "give me that gummy gummy granny or else tm will be a bad day for you"
  },
  worst: {
    D3: "Just want a reference letter and some contacts from her network. That is about it really.",
    D5: "I'd make an excuse and avoid the whole thing. I wouldn't tell her where I was going either.",
    D10: "I'd rather avoid the topic and keep to myself. Not much to say about it to be honest.",
    D13: "Nothing much. I'd rather not say anything and just leave it there for now honestly."
  }
};

async function play(page, mode, { letTimerRun = false } = {}) {
  for (let guard = 0; guard < 600; guard++) {
    const st = await page.evaluate(() => {
      const s = window.S;
      if (s.view !== "play") return { view: s.view };
      const day = window.dayForIndex(s.di), step = day.steps[s.si];
      return { view: s.view, phase: s.phase, day: day.n, t: step.t, id: step.id, timer: step.timer || 0,
        scores: step.options ? step.options.map((o) => o.fx ? o.fx.connection + o.fx.respect + o.fx.reliability + o.fx.awareness : 0) : [] };
    });
    if (st.view === "questionnaire") return;
    if (st.view === "daycard") { await page.click("#go"); continue; }
    if (st.view !== "play") throw new Error("unexpected view " + st.view);
    if (st.phase === "reply" || st.t === "say") { await page.click("#next"); continue; }
    if (st.t === "choice") {
      if (letTimerRun && st.timer) { await page.waitForFunction(() => window.S.phase === "reply", null, { timeout: (st.timer + 3) * 1000 }); continue; }
      const pick = st.scores.indexOf(mode === "worst" ? Math.min(...st.scores) : Math.max(...st.scores));
      await page.click(`.opt[data-i="${pick}"]`);
      continue;
    }
    if (st.t === "text") { await page.fill("#ta", TEXT[mode][st.id]); await page.click("#send"); continue; }
    if (st.t === "multi") {
      const boxes = await page.$$("[data-multi]");
      if (mode !== "worst") { await boxes[0].check(); await boxes[3].check(); } else await boxes[2].check();
      await page.click("#multi-submit");
      continue;
    }
  }
  throw new Error("run did not finish");
}

async function answerQuestions(page, extra = {}) {
  const fill = { age: "21", phone: "0491 570 156", ecName: "Claire Graffet", ecPhone: "0491 570 110", university: "UTS",
    course: "Bachelor of Nursing", moveInDate: "2027-02-01", rentBudgetWeekly: "200", languages: "English, Italian" };
  const pick = { gender: "Female", studentType: "domestic", yearOfStudy: "2", transport: "public transport", maxCommuteMins: "40",
    stayMonths: "12", homeownerGender: "female", otherLodgers: "none", hoursPerWeek: "8-10", fieldMentor: "keen", campus: "UTS City Campus" };
  const yes = { smoker: "false", needsSmokeFree: "true", okWithPets: "true", petAllergy: "false" };
  Object.assign(fill, extra.fill); Object.assign(pick, extra.pick); Object.assign(yes, extra.yes);
  for (let p = 0; p < 5; p++) {
    await page.waitForSelector("#qnext");
    if (p === 0) {
      await page.click("#qnext");   // nothing filled: validation must stop us
      if (!(await page.$(".qfield.bad"))) errors.push("questionnaire: empty page 1 was accepted");
      if (extra.fill && extra.fill.age === "19") {  // under 18 must be refused
        await page.fill("#q-age", "16"); await page.click("#qnext");
        if (!(await page.$("#qf-age.bad"))) errors.push("questionnaire: age 16 was accepted");
      }
    }
    for (const [k, v] of Object.entries(fill)) if (await page.$("#q-" + k)) await page.fill("#q-" + k, v);
    for (const [k, v] of Object.entries(pick)) if (await page.$("#q-" + k)) await page.selectOption("#q-" + k, v);
    for (const [k, v] of Object.entries(yes)) if (await page.$("#q-" + k)) await page.click(`[data-one="${k}"][data-v="${v}"]`);
    if (await page.$("#q-campusDays")) { for (const d of ["Mon", "Tue", "Wed"]) await page.click(`[data-multi="campusDays"][data-v="${d}"]`); }
    if (await page.$("#q-hobbies")) { await page.click('[data-multi="hobbies"][data-v="Gardening"]'); await page.fill('[data-q="hobbies__other"]', "Choir, Crime novels"); }
    for (const [k, v] of Object.entries(extra.text || {})) if (await page.$(`[data-q="${k}"]`)) await page.fill(`[data-q="${k}"]`, v);
    if (p === 4) {
      const pressed = await page.$$eval('[data-multi="helpTypes"][aria-pressed="true"]', (x) => x.length);
      if (!pressed) await page.click('[data-multi="helpTypes"][data-v="Gardening"]');
      await page.screenshot({ path: path.join(OUT, "questionnaire-5.png"), fullPage: false });
    }
    await page.click("#qnext");
  }
  await page.waitForSelector("#savestat");
  await page.waitForFunction(() => /reached|couldn|can’t|switched off|refused/.test(document.getElementById("savestat").textContent), null, { timeout: 8000 });
}

async function checkContract(browser, base, profile, label) {
  const { ctx, page } = await newPage(browser, base, { mock: false });
  await page.goto(base + "/genstay-profile-template.html");
  const st = await page.evaluate((p) => window.GenStayProfile.load(p), profile);
  await page.screenshot({ path: path.join(OUT, "template-" + label + ".png"), fullPage: true });
  await ctx.close();
  return st;
}

(async () => {
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port;
  const browser = await chromium.launch();
  const report = {};

  /* scenes */
  {
    const { ctx, page } = await newPage(browser, base);
    (await storyDataProblems(page)).forEach((p) => errors.push("story: " + p));
    await page.screenshot({ path: path.join(OUT, "title.png") });
    for (let i = 0; i < 14; i++) {
      await page.evaluate((i) => {
        window.S = window.freshState(); S.pid = "x"; S.di = i; S.view = "play"; S.si = 0; window.render();
      }, i);
      await page.locator(".stage").screenshot({ path: path.join(OUT, "day-" + String(i + 1).padStart(2, "0") + ".png") });
    }
    await ctx.close();
  }

  /* best and worst runs */
  for (const mode of ["best", "worst"]) {
    const { ctx, page } = await newPage(browser, base);
    await page.fill("#fname", mode === "best" ? "Jenny Graffet" : "Sam Lee");
    await page.fill("#femail", "applicant@student.uts.edu.au");
    await page.selectOption("#study-area", mode === "best" ? "health" : "education");
    await page.check("#c1"); await page.check("#c2");
    await page.click("#begin");
    await play(page, mode);
    if (mode === "best") await page.evaluate(() => { window.__failOnce = 1; });
    const midway = await page.evaluate(() => new Promise((r) => setTimeout(() => r(window.__store["profiles/applicant-1"]), 3000)));
    if (!midway || !midway.profile.screening || midway.complete) errors.push(mode + ": game result was not saved before the questions");
    await answerQuestions(page);
    await page.screenshot({ path: path.join(OUT, "results-" + mode + ".png") });
    const rec = await page.evaluate(() => ({ store: window.__store, saved: localStorage.getItem("pepaws-porch-run-v3") }));
    const doc = rec.store["profiles/applicant-1"];
    if (!doc || !doc.complete) errors.push(mode + ": completed profile not stored");
    if (rec.saved) errors.push(mode + ": local progress not cleared after a successful save");
    const st = await checkContract(browser, base, doc.profile, mode);
    report[mode] = { type: doc.profile.screening.profile, meters: doc.profile.screening.meters, filled: st.filled + "/" + st.total,
      lowest: doc.profile.screening.lowestMoment, recovered: doc.profile.screening.recovered, path: doc.profile.screening.finalPath,
      helpTypes: doc.profile.support.helpTypes, hobbies: doc.profile.interests.hobbies, runs: doc.runs.length };
    fs.writeFileSync(path.join(OUT, "profile-" + mode + ".json"), JSON.stringify(doc.profile, null, 2));

    if (mode === "worst") {
      /* staff desk on the same store */
      await page.evaluate(() => { location.hash = "staff"; });
      await page.setViewportSize({ width: 1360, height: 980 });
      await page.waitForSelector(".qitem");
      await page.waitForFunction(() => /fields filled/.test((document.getElementById("fstat") || {}).textContent || ""), null, { timeout: 8000 });
      report.staffFrame = await page.textContent("#fstat");
      await page.selectOption("#rv-status", "shortlisted");
      await page.fill("#rv-for", "Margaret Hollis");
      await page.selectOption("#rv-policeCheck", "cleared");
      await page.fill("#rv-watch", "Lowest meter is Respect. Talk through house guidelines at the intro call.");
      await page.click("#rv-save");
      await page.waitForFunction(() => /Saved/.test(document.getElementById("rvstat").textContent));
      await page.waitForTimeout(400);
      const review = await page.evaluate(() => window.__store["reviews/applicant-1"]);
      if (!review || review.pairingStatus !== "shortlisted") errors.push("staff: review not stored");
      const sample = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../genstay/genstay-profile.sample.json"), "utf8"));
      await page.setInputFiles("#importer", { name: "sample.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(sample)) });
      await page.waitForFunction(() => document.querySelectorAll(".qitem").length === 2, null, { timeout: 5000 });
      await page.waitForTimeout(800);
      const pasted = JSON.parse(JSON.stringify(sample));
      pasted.meta.profileId = "PP-pasted"; pasted.student.firstName = "Pat"; pasted.student.lastName = "Ward";
      await page.click("#pastebtn");
      await page.fill("#pastein", JSON.stringify(pasted, null, 2));
      await page.click("#pasteadd");
      await page.waitForFunction(() => document.querySelectorAll(".qitem").length === 3, null, { timeout: 5000 });
      await page.waitForTimeout(600);
      if ((await page.textContent("#vname")) !== "Pat Ward") errors.push("staff: pasted profile did not open");
      await page.click('.qitem:has-text("Jenny Graffet")');
      await page.waitForTimeout(400);
      report.staffQueue = await page.$$eval(".qitem .nm", (x) => x.map((n) => n.textContent));
      if ((await page.textContent("#vname")) !== sample.student.firstName + " " + sample.student.lastName) errors.push("staff: imported profile did not open");
      if ((await page.inputValue("#rv-status")) !== sample.meta.pairingStatus) errors.push("staff: imported pairing status not kept");
      await page.screenshot({ path: path.join(OUT, "staff-desk.png") });
      await page.click("#next");
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, "staff-desk-next.png") });
      /* one profile, then the whole queue, as PDFs */
      const pdfInfo = async (label) => {
        await page.waitForFunction((n) => window.__downloads.some((d) => /\.pdf$/.test(d.filename) && d.filename.indexOf(n) !== -1), label, { timeout: 60000 });
        return page.evaluate((n) => {
          const d = window.__downloads.filter((x) => /\.pdf$/.test(x.filename) && x.filename.indexOf(n) !== -1).pop();
          const bytes = new Uint8Array(d.data);
          let txt = ""; for (let i = 0; i < bytes.length; i++) txt += String.fromCharCode(bytes[i]);
          return { filename: d.filename, size: bytes.length, head: txt.slice(0, 5), pages: (txt.match(/\/Type \/Page[^s]/g) || []).length, b64: btoa(txt) };
        }, label);
      };
      await page.click('.qitem:has-text("Sam Lee")');
      await page.waitForTimeout(500);
      await page.click("#pdfone");
      const one = await pdfInfo("sam-lee");
      await page.click("#pdfall");
      const all = await pdfInfo("genstay-profiles-");
      for (const [name, info] of [["profile-one.pdf", one], ["profiles-all.pdf", all]]) {
        fs.writeFileSync(path.join(OUT, name), Buffer.from(info.b64, "base64"));
        if (info.head !== "%PDF-") errors.push("pdf: " + name + " is not a PDF");
      }
      if (one.pages < 2) errors.push("pdf: single profile has " + one.pages + " page(s)");
      if (all.pages < one.pages + 2) errors.push("pdf: queue PDF has only " + all.pages + " pages for 3 profiles");
      report.pdf = { one: one.filename + " · " + one.pages + " pages · " + Math.round(one.size / 1024) + " KB",
                     all: all.filename + " · " + all.pages + " pages · " + Math.round(all.size / 1024) + " KB" };
      await page.click("#expall");
      await page.waitForTimeout(300);
      const dl = await page.evaluate(() => window.__downloads.map((d) => d.filename));
      if (!dl.length) errors.push("staff: export all produced no download");
      /* the Hosts and matches tab (the same code as the demo's, which tests it in depth). Staff shortlist
         Jenny and Sam for Helen Whitcombe; the sample hosts file is added; Helen has one room */
      await page.click('.qitem:has-text("Jenny Graffet")');
      await page.waitForSelector("#rv-for");
      await page.fill("#rv-for", "Helen Whitcombe");
      await page.click("#rv-save");
      await page.waitForFunction(() => /Saved/.test(document.getElementById("rvstat").textContent));
      await page.click('.qitem:has-text("Sam Lee")');
      await page.waitForSelector("#rv-for");
      await page.fill("#rv-for", "Helen Whitcombe");
      await page.click("#rv-save");
      await page.waitForFunction(() => /Saved/.test(document.getElementById("rvstat").textContent));
      await page.click("#tab-hosts");
      await page.setInputFiles("#hostimporter", { name: "genstay-hosts.sample.json", mimeType: "application/json",
        buffer: fs.readFileSync(path.resolve(__dirname, "../game/genstay-hosts.sample.json")) });
      await page.waitForFunction(() => document.querySelectorAll("#hlist .qitem").length === 15 && desk.match, null, { timeout: 8000 });
      const m = await page.evaluate(() => ({ pairings: desk.match.pairings.map((p) => p.hostName + " + " + p.studentName + (p.locked ? " (staff)" : "")),
        also: desk.match.alsoPaired.map((a) => a.studentName + (a.eligible ? "" : " (ruled out)")) }));
      if (!m.pairings.some((p) => /^Helen Whitcombe \+ Jenny Graffet \(staff\)$/.test(p))) errors.push("hosts: the staff's pairing with Helen wasn't kept: " + m.pairings.join(", "));
      if (!m.also.some((a) => /^Sam Lee \(ruled out\)$/.test(a))) errors.push("hosts: Sam Lee's shortlisting isn't flagged as ruled out: " + m.also.join(", "));
      if (!/Also paired by staff/.test(await page.textContent("#mbody"))) errors.push("hosts: the overview doesn't list the other staff pairings");
      report.hosts = m;
      await page.screenshot({ path: path.join(OUT, "hosts.png") });
      /* the live board: everyone who finished, with their best host */
      await page.click("#tab-board");
      await page.waitForFunction(() => document.querySelectorAll("#board-grid .bcard .b-name").length >= 2, null, { timeout: 5000 })
        .catch(() => errors.push("board: finished applicants aren't shown with a host"));
      report.board = await page.$$eval("#board-grid .bcard", (c) => c.map((n) => n.innerText.replace(/\s+/g, " ").slice(0, 80)));
      if (!report.board.some((t) => /^Sam .*not placed this time/i.test(t))) errors.push("board: Sam Lee, kept out by screening, is shown as paired: " + report.board.join(" | "));
      /* deleting an applicant removes every run, the account's profile and the review */
      await page.click("#tab-app");
      await page.click('#qlist .qitem:has-text("Sam Lee")');
      await page.waitForFunction(() => document.getElementById("vname").textContent === "Sam Lee", null, { timeout: 5000 });
      await page.click("#delone"); await page.click("#delone");
      await page.waitForFunction(() => !Object.keys(window.__store).some((k) => /^(profiles|reviews)\/applicant-1/.test(k)), null, { timeout: 5000 })
        .catch(async () => errors.push("delete: Sam Lee's records are still stored: " + (await page.evaluate(() => Object.keys(window.__store).filter((k) => /applicant-1/.test(k)).join(", ")))));
      if (await page.$('#qlist .qitem:has-text("Sam Lee")')) errors.push("delete: Sam Lee is still in the queue");
    }
    await ctx.close();
  }

  /* a hostile applicant: good clicks must not hide what they wrote */
  {
    const { ctx, page } = await newPage(browser, base);
    await page.fill("#fname", "Felix Swan"); await page.fill("#femail", "f@student.uts.edu.au");
    await page.check("#c1"); await page.check("#c2"); await page.click("#begin");
    await play(page, "hostile");
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__deny = true; });
    await answerQuestions(page, {
      fill: { age: "19", workHours: "52", rentBudgetWeekly: "2", bedtime: "04:00", wakeTime: "04:01" },
      pick: { studentType: "international" },
      yes: { smoker: "true", needsSmokeFree: "true", okWithPets: "true", petAllergy: "true" },
      text: { hobbies__other: "crack", canOffer__other: "how to clean a crack pipe", wantsToLearn__other: "meth", lifeGoals: "die",
              socialNote: "I do crack", diet: "I am allergic to elderly energy" }
    });
    if (!(await page.isVisible("#perms"))) errors.push("permissions: no Permissions button when saving was switched off");
    if (!/switched off/.test(await page.textContent("#savestat"))) errors.push("permissions: message doesn't say saving is switched off");
    await page.click("#perms");
    await page.waitForFunction(() => /reached/.test(document.getElementById("savestat").textContent), null, { timeout: 8000 });
    const doc = await page.evaluate(() => window.__store["profiles/applicant-1"]);
    if (!doc || !doc.complete) errors.push("permissions: profile not saved after switching saving back on");
    const sc = doc.profile.screening;
    for (const f of ["threatening_language", "drug_references", "welfare_concern", "demeaning_language", "answers_to_check"])
      if (sc.flags.indexOf(f) === -1) errors.push("hostile: missing flag " + f);
    if (sc.profile !== "transactional_guest") errors.push("hostile: profile was " + sc.profile);
    if (!sc.watchPoint) errors.push("hostile: no automatic watch-point");
    if (!doc.attention) errors.push("hostile: not marked as needing attention");
    if (!(await page.isVisible("text=Lifeline"))) errors.push("hostile: no support line shown for a welfare concern");
    const neg = await page.evaluate(() => { const before = S.concerns.length; const h = scanText("t", "I would never hurt her, and I don't do drugs. The granny flat step needs fixing."); S.concerns.length = before; return h.length; });
    if (neg) errors.push("hostile: negated or innocent text was flagged");
    report.hostile = { type: sc.profile, meters: sc.meters, flags: sc.flags, watchPoint: sc.watchPoint };
    await page.screenshot({ path: path.join(OUT, "results-hostile.png"), fullPage: true });
    await ctx.close();
  }

  /* outside claude.ai: plain browser downloads, and print when the PDF tools can't load */
  {
    const sample = fs.readFileSync(path.resolve(__dirname, "../genstay/genstay-profile.sample.json"), "utf8");
    const local = await newPage(browser, base, { mock: false });
    await local.page.goto(base + "/genstay-screener.html#staff");
    await local.page.setViewportSize({ width: 1360, height: 980 });
    await local.page.click("#pastebtn"); await local.page.fill("#pastein", sample); await local.page.click("#pasteadd");
    await local.page.waitForSelector(".qitem");
    await local.page.waitForFunction(() => window.desk && desk.ready, null, { timeout: 8000 });
    const [dl] = await Promise.all([local.page.waitForEvent("download", { timeout: 60000 }), local.page.click("#pdfone")]);
    if (!/\.pdf$/.test(dl.suggestedFilename())) errors.push("local: desk PDF download was " + dl.suggestedFilename());
    await local.page.goto(base + "/genstay-profile-template.html?demo");
    const [dl2] = await Promise.all([local.page.waitForEvent("download", { timeout: 60000 }), local.page.click("#btn-pdf")]);
    if (!/\.pdf$/.test(dl2.suggestedFilename())) errors.push("template: PDF button downloaded " + dl2.suggestedFilename());
    await dl2.saveAs(path.join(OUT, "template-button.pdf"));
    await local.ctx.close();

    const off = await newPage(browser, base, { mock: false, offline: true });
    await off.page.goto(base + "/genstay-screener.html#staff");
    await off.page.click("#pastebtn"); await off.page.fill("#pastein", sample); await off.page.click("#pasteadd");
    await off.page.waitForFunction(() => window.desk && desk.ready, null, { timeout: 8000 });
    await off.page.evaluate(() => { desk.frame.contentWindow.print = () => { window.__printed = true; }; });
    await off.page.click("#pdfone");
    await off.page.waitForFunction(() => window.__printed || /couldn/.test(document.getElementById("fstat").textContent), null, { timeout: 20000 });
    if (!(await off.page.evaluate(() => window.__printed))) errors.push("offline: print fallback not used");
    report.pdfLocal = { desk: dl.suggestedFilename(), template: dl2.suggestedFilename(), offlinePrint: true };
    await off.ctx.close();
  }

  /* the Day 14 timer runs out; no record store, so the fallback shows */
  {
    const { ctx, page } = await newPage(browser, base);
    await page.evaluate(() => { window.__noCaps = true; });
    await page.fill("#fname", "Tim Out"); await page.fill("#femail", "t@monash.edu");
    await page.check("#c1"); await page.check("#c2"); await page.click("#begin");
    await play(page, "best", { letTimerRun: true });
    const t = await page.evaluate(() => S.choices.filter((c) => c.timedOut).length);
    if (t < 1) errors.push("timeout: no timed-out choice recorded");
    await answerQuestions(page);
    const fb = await page.isVisible("#fallback");
    if (!fb) errors.push("timeout run: fallback not offered without a record store");
    if (!/claude\.ai/.test(await page.textContent("#savestat"))) errors.push("no store: message doesn't say how to fix it");
    if (await page.isVisible("#dl")) errors.push("no store: download button shown where downloads can't work");
    await page.click("#showtext");
    const shown = await page.inputValue("#ptext");
    if (!(await page.isVisible("#ptext")) || shown.indexOf('"profileId"') === -1) errors.push("no store: profile text not shown");
    await page.screenshot({ path: path.join(OUT, "results-fallback.png") });
    report.timeout = { timedOut: t, fallbackShown: fb };
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) { console.log("\nPROBLEMS:\n" + errors.join("\n")); process.exit(1); }
  console.log("\nall checks passed — screenshots in " + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
