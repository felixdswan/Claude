/* Checks for the GenStay matching engine (game/genstay-matching.js), no browser needed.

   - a well-matched student and host score high, with the reasons spelled out
   - every hard filter rules a pairing out, and says why
   - the score moves the right way when one thing changes
   - matchAll ranks both sides and suggests one student per room, keeping staff's own pairings
   - host lists read from CSV, pasted spreadsheet rows (TSV) and JSON, and round-trip through the CSV template
   - the games' answer options are ones the matcher understands
   - both staff desks carry the same Hosts and matches code

   Usage: node scripts/test-matching.js */
const fs = require("fs");
const path = require("path");
const M = require("../game/genstay-matching.js");

const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const SAMPLE = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../genstay/genstay-profile.sample.json"), "utf8"));
const HOST_SAMPLE = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../genstay/genstay-host.sample.json"), "utf8"));

/* A student who suits Marg, without staff having paired them yet. */
function student(id, change) {
  const p = clone(SAMPLE);
  p.meta.pairingStatus = "new"; p.meta.suggestedFor = null;
  p.interests.fieldMentor = "keen";
  if (change) change(p);
  return { id, name: [p.student.firstName, p.student.lastName].join(" "), profile: p };
}
function host(id, change) {
  const h = clone(M.EXAMPLE_HOST);
  h.meta.hostId = id;
  if (change) change(h);
  return h;
}
const blockedBy = (r, kind) => r.blockers.some((b) => b.kind === kind);

/* 1. a good pairing */
{
  const r = M.score(student("s1"), host("H-1"));
  check(r.eligible, "good pairing was ruled out: " + JSON.stringify(r.blockers));
  check(r.score >= 85 && r.band === "strong", "good pairing scored " + r.score + " (" + r.band + ")");
  check(r.parts.reduce((n, p) => n + p.weight, 0) === 100, "weights don't add up to 100");
  for (const bit of ["Can help with", "Shared interests", "Wants to learn", "The homeowner was a nurse", "UTS City campus"])
    check(r.strengths.some((x) => x.indexOf(bit) !== -1), "good pairing doesn't mention: " + bit);
  check(!r.linked, "pairing marked as staff's own when it isn't");
  const linked = M.score({ id: "s1", name: "Jenny", profile: SAMPLE }, host("H-1"));
  check(linked.linked, "sample's suggestedFor (Margaret Hollis) didn't link it to her host profile");
}

/* 2. hard filters */
const filters = [
  ["status", (p) => { p.meta.pairingStatus = "matched"; p.meta.suggestedFor = "Someone Else"; }, null],
  ["status", (p) => { p.meta.pairingStatus = "not_suitable"; }, null],
  ["hostStatus", null, (h) => { h.meta.status = "paused"; }],
  ["screening", (p) => { p.screening.profile = "transactional_guest"; }, null],
  ["screening", (p) => { p.screening.flags.push("drug_references"); }, null],
  ["screening", (p) => { delete p.screening; }, null],
  ["questions", (p) => { p.meta.stages.postGame = false; }, null],
  ["gender", (p) => { p.household.homeownerGender = "male"; }, null],
  ["gender", null, (h) => { h.wants.studentGender = "male"; }],
  ["gender", (p) => { p.student.gender = "Prefer not to say"; }, (h) => { h.wants.studentGender = "female"; }],
  ["smoking", (p) => { p.household.smoker = true; p.household.needsSmokeFree = false; }, null],
  ["smoking", null, (h) => { h.home.hostSmokes = true; h.home.smokeFree = false; }],
  ["pets", (p) => { p.household.petAllergy = true; }, (h) => { h.home.pets = ["Cat"]; }],
  ["pets", (p) => { p.household.okWithPets = false; }, (h) => { h.home.pets = ["Dog"]; }],
  ["lodgers", null, (h) => { h.home.otherStudents = 1; }],
  ["rent", (p) => { p.support.rentBudgetWeekly = 120; }, null],
  ["stay", (p) => { p.placement.stayMonths = 3; }, null],
  ["hours", (p) => { p.support.hoursPerWeek = { min: 4, max: 6 }; }, null],
  ["help", (p) => { p.support.notOffered.push("Company and conversation"); }, null],
  ["language", null, (h) => { h.wants.language = "Greek"; }],
  ["safety", (p) => { p.screening.meters.awareness = 2; }, null],
  ["commute", (p) => { p.placement.maxCommuteFlexMins = 15; p.placement.maxCommuteMins = 10; }, null],
  ["dates", (p) => { p.placement.moveInDate = "2027-09-01"; p.placement.moveInFlexWeeks = 0; }, null]
];
filters.forEach(([kind, sc, hc], i) => {
  const r = M.score(student("f" + i, sc), host("H-f" + i, hc));
  check(!r.eligible && blockedBy(r, kind), "filter '" + kind + "' (#" + i + ") didn't rule the pairing out: " + JSON.stringify(r.blockers));
  check(r.blockers.every((b) => b.text && b.text.length > 10), "filter '" + kind + "' gave no reason");
});
{
  const r = M.score(student("ok-lang", (p) => { p.student.languages = ["English", "Greek (Cypriot)"]; }), host("H-lang", (h) => { h.wants.language = "greek"; }));
  check(r.eligible, "a Greek speaker was ruled out for a Greek-speaking homeowner");
  const unknown = M.score(student("g", (p) => { p.household.homeownerGender = "female"; }), host("H-g", (h) => { h.host.gender = null; }));
  check(unknown.eligible && unknown.cautions.some((c) => /isn’t recorded/.test(c)), "unknown host gender should be a caution, not a filter");
  const matchedHere = M.score({ id: "m", name: "Jenny", profile: Object.assign(clone(SAMPLE), { meta: Object.assign(clone(SAMPLE.meta), { pairingStatus: "matched" }) }) },
    host("H-1", (h) => { h.meta.status = "matched"; }));
  check(matchedHere.eligible, "a student matched with this very host was ruled out: " + JSON.stringify(matchedHere.blockers));
}

/* 3. the score moves the right way */
{
  const base = M.score(student("b"), host("H-b")).score;
  const fewer = M.score(student("b", (p) => { p.interests.hobbies = ["Sport and fitness"]; p.interests.wantsToLearn = []; }), host("H-b")).score;
  check(fewer < base, "fewer shared interests didn't lower the score (" + fewer + " vs " + base + ")");
  const quiet = M.score(student("b", (p) => { p.lifestyle.socialLevel = 1; }), host("H-b", (h) => { h.wants.socialLevel = 5; })).score;
  check(quiet < base, "very different hopes for time together didn't lower the score");
  const mentor = (m) => M.score(student("c", (p) => { p.interests.fieldMentor = m; }), host("H-c")).parts.find((x) => x.key === "career").value;
  check(mentor("keen") > mentor("open") && mentor("open") > mentor("no"), "career part doesn't follow keen > open > no");
  const teacher = M.score(student("t", (p) => { p.student.discipline = "education"; p.interests.careerGoal = "Primary teaching"; }), host("H-t")).parts.find((x) => x.key === "career").value;
  check(teacher < mentor("keen"), "a different field scored as well as the same field");
  const far = M.score(student("d", (p) => { p.placement.preferredAreas = []; }), host("H-d", (h) => { h.home.nearCampuses = [{ name: "Macquarie University", mins: 30 }]; }));
  check(far.parts.find((x) => x.key === "location").value < 0.5 && far.cautions.some((c) => /isn’t on this homeowner’s list/.test(c)), "campus not near the home wasn't flagged");
  const late = M.score(student("e", (p) => { p.placement.moveInDate = "2027-04-15"; p.placement.moveInFlexWeeks = 0; }), host("H-e"));
  check(late.eligible && late.cautions.some((c) => /weeks/.test(c)) && late.score < base, "dates ten weeks apart weren't a caution");
  const missingEssential = M.score(student("m", (p) => { p.support.helpTypes = ["Gardening"]; p.interests.canOffer = []; }), host("H-m"));
  check(missingEssential.cautions.some((c) => /Didn’t tick company and conversation/.test(c)), "missing essential help wasn't flagged");
  const blankHost = M.score(student("n"), Object.assign(M.blankHost(), { meta: { hostId: "H-blank" }, host: { firstName: "Nobody" } }));
  check(blankHost.eligible && blankHost.score >= 40 && blankHost.score <= 70, "a host with no details scored " + blankHost.score + " (missing details should score about half)");
}

/* 4. matching a group */
{
  const hosts = [
    host("H-marg"),
    host("H-joan", (h) => { Object.assign(h.host, { firstName: "Joan", lastName: "Price", preferredName: null, formerCareer: "Primary school teacher", careerField: "education" });
      h.wants.disciplines = ["education"]; h.about.interests = ["Reading", "Crafts"]; h.wants.socialLevel = 2; h.care.fallsRisk = false; }),
    host("H-ray", (h) => { Object.assign(h.host, { firstName: "Ray", lastName: "Chen", preferredName: null, gender: "male", formerCareer: "Engineer", careerField: null });
      h.home.rooms = 2; h.wants.disciplines = []; }),
    host("H-paused", (h) => { h.host.firstName = "Paused"; h.meta.status = "paused"; })
  ];
  const students = [
    student("jenny"),
    student("sam", (p) => { Object.assign(p.student, { firstName: "Sam", lastName: "Lee", discipline: "education" }); p.interests.careerGoal = "Primary teaching";
      p.interests.hobbies = ["Reading", "Crafts"]; p.lifestyle.socialLevel = 2; }),
    student("alex", (p) => { Object.assign(p.student, { firstName: "Alex", lastName: "Ward", gender: "Male" }); p.household.homeownerGender = "any"; }),
    student("troll", (p) => { p.student.firstName = "Troll"; p.screening.profile = "transactional_guest"; p.screening.flags.push("threatening_language"); }),
    student("kim", (p) => { p.student.firstName = "Kim"; p.meta.pairingStatus = "shortlisted"; p.meta.suggestedFor = "Ray Chen"; })
  ];
  const res = M.matchAll(students, hosts);
  const pair = (hid) => res.pairings.filter((p) => p.hostId === hid).map((p) => p.studentId).sort();
  check(JSON.stringify(Object.keys(res.hosts)) === JSON.stringify(hosts.map((h) => h.meta.hostId)), "matchAll lost a host");
  check(res.hosts["H-marg"].ranked[0] && res.hosts["H-marg"].ranked[0].studentId === "jenny", "Jenny isn't Marg's best match");
  check(res.hosts["H-joan"].ranked[0] && res.hosts["H-joan"].ranked[0].studentId === "sam", "Sam isn't Joan's best match");
  check(res.hosts["H-marg"].ruledOut.some((r) => r.studentId === "troll"), "the hostile applicant wasn't ruled out");
  check(!res.pairings.some((p) => p.studentId === "troll"), "the hostile applicant was suggested");
  check(pair("H-paused").length === 0, "a paused host was given a student");
  const kim = res.pairings.find((p) => p.studentId === "kim");
  check(kim && kim.hostId === "H-ray" && kim.locked, "staff's own pairing (Kim with Ray) wasn't kept first");
  check(pair("H-ray").length === 2, "a host with two rooms didn't get two students: " + JSON.stringify(pair("H-ray")));
  const used = res.pairings.map((p) => p.studentId);
  check(used.length === new Set(used).size, "a student was suggested twice");
  check(res.pairings.filter((p) => !p.locked).every((p) => p.eligible), "an ineligible pairing was suggested");
  check(res.unmatchedHosts.every((u) => u.id !== "H-paused"), "a paused host is listed as waiting for a student");
  check(res.unmatchedStudents.every((u) => u.id !== "troll"), "a ruled-out student is listed as waiting");
  console.log("pairings:", res.pairings.map((p) => p.hostName + " ← " + p.studentName + " " + p.score + (p.locked ? " (staff)" : "")).join(" · "));
}

/* 4b. staff have shortlisted more applicants for a host than it has rooms */
{
  const linked = (id, status, change) => student(id, (p) => { p.student.firstName = id; p.meta.pairingStatus = status; p.meta.suggestedFor = "Margaret Hollis"; if (change) change(p); });
  const res = M.matchAll([linked("Ann", "shortlisted"), linked("Bea", "intro_booked", (p) => { p.lifestyle.socialLevel = 1; }),
    linked("Cas", "shortlisted", (p) => { p.screening.profile = "transactional_guest"; }), student("Dee")], [host("H-marg")]);
  check(res.pairings.length === 1 && res.pairings[0].studentName.indexOf("Ann") === 0 && res.pairings[0].locked, "the best staff-shortlisted applicant didn't take the room: " + JSON.stringify(res.pairings.map((p) => p.studentName)));
  const also = res.alsoPaired.map((a) => a.studentName.split(" ")[0] + (a.eligible ? "" : " (ruled out)")).sort();
  check(JSON.stringify(also) === '["Bea","Cas (ruled out)"]', "other staff pairings with the same host aren't listed: " + JSON.stringify(also));
  check(JSON.stringify(res.unmatchedStudents.map((u) => u.id)) === '["Dee"]', "staff-paired applicants are listed as unmatched: " + JSON.stringify(res.unmatchedStudents));
}

/* 5. reading host lists */
{
  const csv = "﻿" + M.hostCsvTemplate().replace(/\r\n$/, "") + "\r\n"
    + '"","Looking","Joan","Price","","81","Woman","Ashfield","Inner West","English; Italian","Teacher","","","","1/3/2027","3","","$140","","","Sydney Uni (30 min)","yes","no","Cat","","Either","6","8","Gardening, Reading","","","2","","","Reading, Crafts","Crafts","","","","","No","","",""\r\n';
  const a = M.parseHosts(csv);
  check(a.hosts.length === 2 && !a.problems.length, "CSV: read " + a.hosts.length + " hosts, problems: " + a.problems.join("; "));
  const joan = a.hosts[1] || { host: {}, home: {}, wants: {}, about: {}, meta: {} };
  check(joan.meta.hostId === "H-joan-price-ashfield" && joan.meta.status === "active", "CSV: id/status " + joan.meta.hostId + " " + joan.meta.status);
  check(joan.home.availableFrom === "2027-03-01" && joan.home.rentWeekly === 140 && joan.home.smokeFree === true, "CSV: date, rent or yes/no not read");
  check(JSON.stringify(joan.host.languages) === '["English","Italian"]' && joan.home.pets[0] === "Cat", "CSV: lists not read");
  check(JSON.stringify(joan.wants.helpWanted) === '["Gardening","Reading"]', "CSV: comma list not read");
  check(joan.home.nearCampuses[0].name === "Sydney Uni" && joan.home.nearCampuses[0].mins === 30, "CSV: campus minutes not read");
  check(joan.wants.hoursPerWeek.min === 6 && joan.wants.hoursPerWeek.max === 8, "CSV: hours not read");

  const tsv = "First name\tSurname\tSuburb\tHours a week\tFavourite colour\nBetty\tNguyen\tCabramatta\t10-12\tBlue\nBetty\tNguyen\tCabramatta\t8\tRed\n";
  const b = M.parseHosts(tsv);
  check(b.hosts.length === 2 && b.hosts[0].host.lastName === "Nguyen" && b.hosts[0].wants.hoursPerWeek.max === 12, "TSV: rows pasted from a spreadsheet not read");
  check(b.hosts[0].meta.hostId !== b.hosts[1].meta.hostId, "TSV: two hosts with the same name share an id");
  check(b.problems.some((p) => /Favourite colour/.test(p)), "TSV: unknown column not reported");
  const named = M.parseHosts("Name,Suburb\nRita Moreno Smith,Glebe\n").hosts[0];
  check(named && named.host.firstName === "Rita" && named.host.lastName === "Moreno Smith", "CSV: a single Name column wasn't split");

  const one = M.parseHosts(JSON.stringify(HOST_SAMPLE));
  const many = M.parseHosts(JSON.stringify({ hosts: [HOST_SAMPLE, M.EXAMPLE_HOST] }));
  check(one.hosts.length === 1 && many.hosts.length === 2, "JSON: hosts not read");
  check(one.hosts[0].meta.hostId === HOST_SAMPLE.meta.hostId, "JSON: host id changed");
  const wrong = M.parseHosts(JSON.stringify(SAMPLE));
  check(!wrong.hosts.length && /student profile/.test(wrong.problems[0] || ""), "JSON: a student profile wasn't turned away with a reason");
  check(/valid JSON/.test(M.parseHosts("{oops").problems[0] || ""), "JSON: broken JSON not reported");
  check(/heading row/.test(M.parseHosts("just one line").problems[0] || ""), "CSV: a single line not reported");

  const round = M.parseHosts(M.hostsToCsv(many.hosts)).hosts;
  check(JSON.stringify(round) === JSON.stringify(many.hosts), "CSV round trip changed the hosts");
  const r = M.score(student("csv"), round[0]);
  check(r.eligible && r.score > 80, "the sample host read back from CSV doesn't match the sample student (" + r.score + ")");
}

/* 6. the games' answer options are ones the matcher understands */
{
  const opts = (file, id) => {
    const src = fs.readFileSync(path.resolve(__dirname, "../game/" + file), "utf8");
    const m = src.match(new RegExp('\\{id:"' + id + '"[^\\n]*?opts:\\[([^\\]]*)\\]'));
    return m ? JSON.parse("[" + m[1] + "]") : null;
  };
  const lists = { helpTypes: "helpWanted", notOffered: "notOffered", hobbies: "interests", wantsToLearn: "canTeach", canOffer: "canOffer", bestTimes: "bestTimes" };
  for (const file of ["pepaws-porch.html", "pepaws-porch.demo.html"]) {
    for (const [id, vocab] of Object.entries(lists)) {
      const got = opts(file, id);
      if (!got) { check(file.indexOf("demo") !== -1 && (id === "canOffer" || id === "bestTimes"), file + ": no options found for " + id); continue; }
      const missing = got.filter((x) => M.VOCAB[vocab].indexOf(x) === -1);
      check(!missing.length, file + ": " + id + " options the matcher doesn't list: " + missing.join(", "));
    }
  }
  for (const [name, items] of Object.entries(M.VOCAB)) {
    if (!Array.isArray(items)) continue;
    const unknown = items.filter((x) => /^text:/.test(M.concept(x)));
    check(!unknown.length || name === "bestTimes", "vocabulary " + name + " has items with no shared meaning: " + unknown.join(", "));
  }
  check(M.concept("Lifts in the homeowner’s car") === "lifts" && M.concept("Heavy lifting") === "heavy_lifting" && M.concept("Pet care") === "pets", "lifts, lifting and pet care are confused");
  check(M.fieldOf("Retired district nurse") === "health" && M.fieldOf("Speech pathologist") === "allied_health" && M.fieldOf("Counsellor") === "psychology", "careers aren't placed in the right field");
}

/* 7. both desks carry the same Hosts and matches code */
{
  const block = (file) => {
    const src = fs.readFileSync(path.resolve(__dirname, "../game/" + file), "utf8");
    const m = src.match(/\/\* =+\n   HOSTS AND MATCHES[\s\S]*?<\/script>/);
    return m ? m[0] : null;
  };
  const a = block("pepaws-porch.html"), b = block("pepaws-porch.demo.html");
  check(a && b, "a staff desk has no Hosts and matches block");
  check(a === b, "the Hosts and matches code differs between the full game and the demo");
}

if (problems.length) { console.log("PROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("all matching checks passed");
