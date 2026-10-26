/* Checks for the GenStay matching engine (game/genstay-matching.js), no browser needed.

   - the ten sample hosts (game/genstay-hosts.sample.json) read cleanly
   - nine market-day participants, each answering the demo's questions, are
     matched with the host they were written for, with reasons in plain words
   - each sample host's test purpose holds: every hard filter rules a pairing
     out, on either side, and says why
   - the score is the geometric mean of the two sides, and the game's evidence
     (a fall, a grief) moves the host's side the right way
   - the allocation is optimal: the Hungarian method agrees with brute force,
     and beats picking the best pairs greedily
   - matchAll keeps staff's own pairings, fills two-room homes, skips hosts on hold
   - bestMatch always finds a demo host: the closest one when none is eligible
   - host lists read from JSON, CSV and pasted spreadsheet rows, and the CSV
     round-trips without changing a match
   - the games' answer options and campuses are ones the matcher understands
   - both staff desks carry the same Hosts and matches code

   Usage: node scripts/test-matching.js */
const fs = require("fs");
const path = require("path");
const M = require("../game/genstay-matching.js");

const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const read = (f) => fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
const HOSTS_TEXT = read("game/genstay-hosts.sample.json");
const SAMPLE = JSON.parse(read("genstay/genstay-profile.sample.json"));
const HOSTS = M.parseHosts(HOSTS_TEXT).hosts;
const byId = (id) => HOSTS.find((h) => h.meta.hostId === id);
const blockedBy = (r, kind) => r.blockers.some((b) => b.kind === kind);

/* A participant as the quick demo saves them: the two pages of questions and
   the game's four big moments, with the tags the matcher reads. */
function persona(o) {
  return {
    meta: { profileId: "DEMO-" + o.first, pairingStatus: "new", stages: { preGame: true, game: true, postGame: true } },
    student: { firstName: o.first, gender: o.gender, age: o.age, email: "", discipline: o.discipline, languages: o.languages || ["English"] },
    placement: { campus: o.campus, moveInDate: o.moveIn || "2027-02-01", stayMonths: o.stay || 12 },
    support: { rentBudgetWeekly: o.rent || 150, hoursPerWeek: o.hours || { min: 8, max: 10 }, helpTypes: o.help, notOffered: ["Personal care"] },
    household: { homeownerGender: o.hg || "any", otherLodgers: o.lodgers || "open", smoker: false, needsSmokeFree: true,
                 okWithPets: o.pets !== "no" && o.pets !== "allergic", petAllergy: o.pets === "allergic" },
    interests: { careerGoal: o.goal, fieldMentor: "keen", hobbies: o.hobbies || [], wantsToLearn: o.learn || [] },
    lifestyle: { socialLevel: o.social || 3 },
    screening: { profile: "connector", meters: { connection: 8, respect: 8, reliability: 7, awareness: 8 }, motivation: o.motivation || "company", flags: ["quick_demo"],
      landmarks: [{ day: 6, response: "Sit with her quietly", tags: [o.grief || "grief_present"] },
                  { day: 11, response: "Keep her still, and check her head.", tags: [o.fall || "fall_checked"] },
                  { day: 14, response: "Call 000 on speaker", tags: ["emergency_called"] }] }
  };
}
const P = {
  Ivy: { expect: "GH-2027-002", first: "Ivy", gender: "Female", age: 22, discipline: "health", goal: "Medicine", campus: "UNSW Kensington",
    help: ["Company and conversation", "Being home in the evenings", "Cooking shared meals", "Shopping and errands", "Appointments and outings"], hobbies: ["Board games and puzzles", "Sport and fitness"] },
  Tom: { expect: "GH-2027-003", first: "Tom", gender: "Male", age: 21, discipline: "engineering", goal: "Mechanical and aerospace", campus: "USyd Camperdown", social: 4, lodgers: "prefer",
    help: ["Company and conversation", "Pet care", "Tech and phone help", "Cooking shared meals"], hobbies: ["Sport and fitness", "Music"], hours: { min: 6, max: 8 } },
  Ana: { expect: "GH-2027-004", first: "Ana", gender: "Female", age: 23, discipline: "law", goal: "Legal practice", campus: "Macquarie Uni", languages: ["English", "French"],
    help: ["Company and conversation", "Being home in the evenings", "Cooking shared meals", "Appointments and outings", "Shopping and errands"], hobbies: ["Films and TV", "Gardening"], hours: { min: 12, max: 15 } },
  Mei: { expect: "GH-2027-005", first: "Mei", gender: "Female", age: 24, discipline: "design", goal: "Architecture", campus: "USyd Camperdown", social: 2, motivation: "quiet_space",
    help: ["Gardening", "Tech and phone help", "Shopping and errands", "Pet care"], hobbies: ["Art", "Gardening"], hours: { min: 6, max: 8 }, stay: 6 },
  Sam: { expect: "GH-2027-006", first: "Sam", gender: "Male", age: 20, discipline: "business", goal: "Management", campus: "Macquarie Uni", social: 5, languages: ["English", "Greek"],
    help: ["Lifts in the homeowner’s car", "Gardening", "Shopping and errands", "Tech and phone help", "Cooking shared meals"], hobbies: ["Cooking and baking", "Sport and fitness"], moveIn: "2027-03-01" },
  Zoe: { expect: "GH-2027-007", first: "Zoe", gender: "Female", age: 20, discipline: "design", goal: "Fashion", campus: "UTS City Campus", social: 5,
    help: ["Company and conversation", "Tech and phone help", "Appointments and outings", "Pet care"], hobbies: ["Films and TV", "Art"], hours: { min: 6, max: 8 } },
  Hoa: { expect: "GH-2027-008", first: "Hoa", gender: "Female", age: 29, discipline: "education", goal: "Primary teaching", campus: "WSU Parramatta", languages: ["English", "Vietnamese"],
    help: ["Company and conversation", "Cooking shared meals", "Shopping and errands", "Tech and phone help"], hobbies: ["Cooking and baking", "Gardening"], moveIn: "2027-03-01" },
  Leo: { expect: "GH-2027-010", first: "Leo", gender: "Male", age: 22, discipline: "health", goal: "Pharmacy", campus: "Macquarie Uni", social: 4, languages: ["English", "Mandarin"],
    help: ["Company and conversation", "Cooking shared meals", "Appointments and outings", "Tech and phone help"], hobbies: ["Sport and fitness", "Cooking and baking"], grief: "grief_invited", hours: { min: 6, max: 8 } },
  Ella: { expect: "GH-2027-001", first: "Ella", gender: "Female", age: 21, discipline: "education", goal: "Secondary teaching", campus: "UTS City Campus", social: 4, languages: ["English", "Italian"],
    help: ["Company and conversation", "Cooking shared meals", "Tech and phone help", "Shopping and errands"], hobbies: ["Reading", "Walking"], learn: ["Local history"], hours: { min: 6, max: 8 } }
};
/* One participant, optionally changed: as the desk passes them to the matcher. */
function who(name, change) {
  const p = persona(P[name]);
  if (change) change(p);
  return { id: p.meta.profileId, name: p.student.firstName, profile: p };
}

/* 1. the sample hosts */
{
  const r = M.parseHosts(HOSTS_TEXT);
  check(r.hosts.length === 10 && !r.problems.length, "sample hosts: read " + r.hosts.length + ", problems: " + r.problems.join("; "));
  check(JSON.stringify(r.hosts.map((h) => h.meta.hostId)) === JSON.stringify(JSON.parse(HOSTS_TEXT).hosts.map((h) => h.meta.hostId)), "sample hosts: ids changed on reading");
  const kev = M.hostStatus(byId("GH-2027-009")), helen = M.hostStatus(byId("GH-2027-001"));
  check(!kev.available && kev.label === "On hold" && helen.available && helen.label === "Shortlisted", "host status: " + JSON.stringify([kev, helen]));
  const unknown = [];
  HOSTS.forEach((h) => (h.support.helpWanted || []).forEach((c) => { if (/^text:/.test(M.concept(c))) unknown.push(h.meta.hostId + " " + c); }));
  check(!unknown.length, "help the matcher can't compare with a student's offer: " + unknown.join(", "));
  check(M.hostName(byId("GH-2027-006")) === "Nick and Eleni Papadakis" && M.hostFirst(byId("GH-2027-006")) === "Nick and Eleni", "a couple's names: " + M.hostName(byId("GH-2027-006")));
}

/* 2. each market-day participant meets the host written for them */
for (const name of Object.keys(P)) {
  const best = M.bestMatch(who(name), HOSTS), r = best.result;
  check(best.host.meta.hostId === P[name].expect, name + " was matched with " + best.host.meta.hostId + ", not " + P[name].expect
    + " (" + best.ranked.slice(0, 3).map((x) => x.hostId + " " + x.score).join(", ") + ")");
  check(r.eligible && !best.closest && (r.band === "strong" || r.band === "good"), name + "'s match is " + r.band + " " + r.score + (r.eligible ? "" : ": " + r.blockers.map((b) => b.text).join("; ")));
  check(r.forStudent.length >= 2 && r.forStudent.length <= 4 && r.forStudent.every((t) => t && !/undefined|null|NaN|\{|  /.test(t)), name + "'s reasons: " + JSON.stringify(r.forStudent));
  check(r.talkAbout.length <= 2 && r.talkAbout.every((t) => !/undefined|null|  /.test(t)), name + "'s things to talk about: " + JSON.stringify(r.talkAbout));
  check(r.parts.host.reduce((n, x) => n + x.weight, 0) === 100 && r.parts.student.reduce((n, x) => n + x.weight, 0) === 100, "weights on a side don't add up to 100");
}
{
  const ella = M.bestMatch(who("Ella"), HOSTS).result.forStudent.join(" | ");
  for (const bit of [/secondary teaching/, /UTS City Campus/, /Sydney history/, /would like a hand with podcasts/]) check(bit.test(ella), "Ella's reasons don't mention " + bit + ": " + ella);
  const hoa = M.score(who("Hoa"), byId("GH-2027-008"));
  check(hoa.strengths.some((s) => /Vietnamese/.test(s)), "Hoa and Lien's shared Vietnamese isn't a strength");
}

/* 3. each host's test purpose: the hard filters, both sides */
const filters = [
  ["Hoa", "GH-2027-008", "age", (p) => { p.student.age = 22; }],                                         // Lien wants 25 to 55
  ["Mei", "GH-2027-005", "pets", (p) => { p.household.petAllergy = true; p.household.okWithPets = false; }], // Ruth's cat
  ["Mei", "GH-2027-005", "rent", (p) => { p.support.rentBudgetWeekly = 100; }],                          // Ruth asks $120
  ["Tom", "GH-2027-009", "hostStatus", null],                                                             // Kev is on hold
  ["Ella", "GH-2027-009", "gender", null],                                                                // Kev wants a male sharer
  ["Tom", "GH-2027-009", "smoking", null],                                                                // Kev smokes
  ["Tom", "GH-2027-004", "gender", null],                                                                 // Liz wants a female sharer
  ["Ana", "GH-2027-004", "nights", (p) => { p.support.nightsHomePerWeek = { min: 3, max: 4 }; }],        // Liz needs 6 or 7 nights
  ["Sam", "GH-2027-006", "driving", (p) => { p.support.driversLicence = false; }],                        // Nick and Eleni need a driver
  ["Sam", "GH-2027-006", "driving", (p) => { p.support.helpTypes = p.support.helpTypes.filter((x) => !/Lifts/.test(x)); }],
  ["Tom", "GH-2027-003", "lodgers", (p) => { p.household.otherLodgers = "none"; }],                       // Peter wants two sharers
  ["Tom", "GH-2027-003", "pets", (p) => { p.household.okWithPets = false; }],                             // Peter's labrador
  ["Ivy", "GH-2027-002", "stay", (p) => { p.placement.stayMonths = 6; }],                                // Bob asks for 12 months
  ["Ivy", "GH-2027-002", "commute", (p) => { p.placement.campus = "Macquarie University"; }],             // 75 minutes from Randwick
  ["Ivy", "GH-2027-002", "safety", (p) => { p.screening.meters.awareness = 2; }],                         // Bob's falls risk
  ["Zoe", "GH-2027-007", "dealbreaker", (p) => { p.lifestyle.socialLevel = 1; }],                         // Di: not someone who keeps to their room
  ["Ella", "GH-2027-001", "gender", (p) => { p.household.homeownerGender = "male"; }],                    // the student's own preference
  ["Ella", "GH-2027-001", "dates", (p) => { p.placement.moveInDate = "2027-09-01"; }],
  ["Ella", "GH-2027-001", "screening", (p) => { p.screening.profile = "transactional_guest"; }],
  ["Ella", "GH-2027-001", "screening", (p) => { p.screening.flags.push("drug_references"); }],
  ["Ella", "GH-2027-001", "questions", (p) => { p.meta.stages.postGame = false; }],
  ["Ella", "GH-2027-001", "status", (p) => { p.meta.pairingStatus = "not_suitable"; }]
];
filters.forEach(([name, hostId, kind, change], i) => {
  const r = M.score(who(name, change), byId(hostId));
  check(!r.eligible && blockedBy(r, kind), "filter '" + kind + "' (#" + i + ", " + name + " with " + hostId + ") didn't rule the pairing out: " + JSON.stringify(r.blockers));
  check(r.blockers.every((b) => b.text && b.text.length > 10 && b.you && !/undefined|null|NaN/.test(b.text + b.you)), "filter '" + kind + "' gave no clear reason: " + JSON.stringify(r.blockers));
});
{
  const zoe = M.score(who("Zoe", (p) => { p.lifestyle.socialLevel = 2; }), byId("GH-2027-007"));
  check(zoe.eligible && zoe.cautions.some((c) => /keeps to their room/.test(c)), "Di's deal-breaker isn't a caution for a student who leans independent");
  const kevMale = M.score(who("Tom", (p) => { p.household.needsSmokeFree = false; p.support.rentBudgetWeekly = 200; p.placement.campus = "WSU Parramatta"; }), Object.assign(clone(byId("GH-2027-009")), { meta: Object.assign(clone(byId("GH-2027-009").meta), { pairingStatus: "screening" }) }));
  check(kevMale.eligible, "a male student who doesn't mind smoking was ruled out for Kev once he's back from hold: " + JSON.stringify(kevMale.blockers));
}

/* 4. the score: both sides, and the game's evidence */
{
  for (const name of Object.keys(P)) for (const h of HOSTS) {
    const r = M.score(who(name), h);
    if (!r.eligible) continue;
    check(Math.abs(r.score - Math.sqrt(r.hostFit * r.studentFit)) <= 1, name + " with " + h.meta.hostId + ": " + r.score + " isn't the geometric mean of " + r.hostFit + " and " + r.studentFit);
  }
  const hostFit = (name, host, change) => M.score(who(name, change), byId(host)).hostFit;
  check(hostFit("Ivy", "GH-2027-002", (p) => { p.screening.landmarks[1].tags = ["fall_lifted"]; }) < hostFit("Ivy", "GH-2027-002"),
    "lifting a fallen homeowner didn't count against a match with Bob, who has a falls risk");
  check(hostFit("Leo", "GH-2027-010", (p) => { p.screening.landmarks[0].tags = ["grief_dismissed"]; }) < hostFit("Leo", "GH-2027-010"),
    "brushing off grief didn't count against a match with Ray, who was recently bereaved");
  check(hostFit("Ella", "GH-2027-001", (p) => { p.screening.landmarks[1].tags = ["fall_lifted"]; }) >= hostFit("Ella", "GH-2027-001") - 3,
    "a fall response weighed heavily with Helen, who has no falls risk");
  const leo = (langs) => M.score(who("Leo", (p) => { p.student.languages = langs; }), byId("GH-2027-010")).score;
  check(leo(["English", "Mandarin"]) > leo(["English"]), "speaking Mandarin didn't help a match with Ray");
  const social = (n) => M.score(who("Zoe", (p) => { p.lifestyle.socialLevel = n; }), byId("GH-2027-007")).score;
  check(social(5) > social(3), "a sociable student didn't suit Di better");
  const far = M.score(who("Ella", (p) => { p.placement.campus = "WSU Parramatta"; }), byId("GH-2027-001"));
  check(far.studentFit < M.score(who("Ella"), byId("GH-2027-001")).studentFit, "a longer commute didn't lower the student's side");
}

/* 5. the allocation: optimal, by the Hungarian method */
{
  const permute = (n, k, used = [], out = []) => {
    if (used.length === n) { out.push(used.slice()); return out; }
    for (let j = 0; j < k; j++) if (used.indexOf(j) === -1) { used.push(j); permute(n, k, used, out); used.pop(); }
    return out;
  };
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 60; t++) {
    const n = 1 + Math.floor(rand() * 5), k = n + Math.floor(rand() * 3);
    const cost = Array.from({ length: n }, () => Array.from({ length: k }, () => Math.round(rand() * 100)));
    const got = M.assign(cost), total = (a) => a.reduce((s, j, i) => s + cost[i][j], 0);
    const best = Math.min(...permute(n, k).map(total));
    check(new Set(got).size === n && total(got) === best, "assign() isn't optimal on " + JSON.stringify(cost) + ": " + total(got) + " vs " + best);
  }
}

/* 6. matching everyone at once */
{
  const people = Object.keys(P).map((n) => who(n)).concat([
    who("Ella", (p) => { p.meta.profileId = "DEMO-Jo"; p.student.firstName = "Jo"; p.meta.pairingStatus = "shortlisted"; p.meta.suggestedFor = "Helen Whitcombe"; }),
    who("Tom", (p) => { p.meta.profileId = "DEMO-Max"; p.student.firstName = "Max"; }),
    who("Ella", (p) => { p.meta.profileId = "DEMO-Rex"; p.student.firstName = "Rex"; p.screening.profile = "transactional_guest"; })
  ]);
  const res = M.matchAll(people, HOSTS);
  const at = (hid) => res.pairings.filter((p) => p.hostId === hid).map((p) => p.studentName).sort();
  check(res.method === "optimal", "matchAll doesn't say how it allocated");
  const jo = res.pairings.find((p) => p.studentName === "Jo");
  check(jo && jo.hostId === "GH-2027-001" && jo.locked, "staff's own pairing (Jo with Helen) wasn't kept: " + JSON.stringify(jo));
  check(at("GH-2027-001").length === 1, "Helen, with one room, was given " + at("GH-2027-001").join(", "));
  check(JSON.stringify(at("GH-2027-003")) === '["Max","Tom"]', "Peter's two rooms didn't go to Tom and Max: " + at("GH-2027-003").join(", "));
  check(!at("GH-2027-009").length, "Kev, on hold, was given a sharer");
  check(!res.pairings.some((p) => p.studentName === "Rex"), "an applicant kept out by screening was paired");
  const used = res.pairings.map((p) => p.studentId);
  check(used.length === new Set(used).size, "a student was paired twice");
  check(res.pairings.filter((p) => !p.locked).every((p) => p.eligible), "an ineligible pairing was suggested");
  check(res.pairings.every((p) => p.studentRank >= 1 && p.hostRank >= 1), "pairings don't say how each side ranked the other");
  check(res.unmatchedStudents.some((u) => /Ella/.test(u.name)), "Ella, who lost Helen to staff's pairing, isn't listed as waiting");
  /* no other allocation of the open rooms scores more in total than the one chosen */
  const open = res.pairings.filter((p) => !p.locked), sum = open.reduce((n, p) => n + p.score, 0);
  const pairs = [];
  people.forEach((s) => { if (s.name === "Jo") return; HOSTS.forEach((h) => { const r = M.score(s, h); if (r.eligible) pairs.push(r); }); });
  pairs.sort((a, b) => b.score - a.score);
  const rooms = {}; HOSTS.forEach((h) => { rooms[h.meta.hostId] = (h.home.roomsOffered || 1) - (h.meta.hostId === "GH-2027-001" ? 1 : 0); });
  const took = {}; let greedy = 0, greedyCount = 0;
  pairs.forEach((r) => { if (took[r.studentId] || !(rooms[r.hostId] > 0)) return; took[r.studentId] = 1; rooms[r.hostId]--; greedy += r.score; greedyCount++; });
  check(open.length >= greedyCount && sum >= greedy, "the allocation (" + open.length + " pairs, " + sum + ") is worse than greedy (" + greedyCount + ", " + greedy + ")");
  console.log("pairings:", res.pairings.map((p) => M.hostFirst(byId(p.hostId)) + " ← " + p.studentName + " " + p.score + (p.locked ? " (staff)" : "")).join(" · "));

  const twice = M.matchAll([who("Ella", (p) => { p.meta.pairingStatus = "shortlisted"; p.meta.suggestedFor = "Helen Whitcombe"; }),
    who("Ella", (p) => { p.meta.profileId = "DEMO-Bea"; p.student.firstName = "Bea"; p.meta.pairingStatus = "intro_booked"; p.meta.suggestedFor = "Helen Whitcombe"; p.lifestyle.socialLevel = 1; })], HOSTS);
  check(twice.pairings.filter((p) => p.hostId === "GH-2027-001").length === 1 && twice.alsoPaired.some((a) => a.studentName === "Bea"),
    "a second staff pairing with the same one-room host isn't listed as also paired: " + JSON.stringify(twice.alsoPaired));
}

/* 7. the market-day pairing: everyone gets a host */
{
  const late = M.bestMatch(who("Ella", (p) => { p.placement.moveInDate = "2028-06-01"; }), HOSTS);
  check(late.host && late.closest && late.standsInWay.length && /room is free/.test(late.standsInWay[0]), "no closest host, or no reason, when every room is free too early: " + JSON.stringify(late.standsInWay));
  const guest = M.bestMatch(who("Ella", (p) => { p.screening.profile = "transactional_guest"; }), HOSTS);
  check(guest.host && guest.host.meta.hostId === "GH-2027-001" && guest.setAside.indexOf("screening") !== -1 && !guest.closest,
    "a participant kept out by screening didn't still get a demo match: " + JSON.stringify({ host: guest.host && guest.host.meta.hostId, setAside: guest.setAside }));
  const unfinished = M.bestMatch(who("Ella", (p) => { p.meta.stages.postGame = false; }), HOSTS);
  check(unfinished.host && unfinished.setAside.indexOf("questions") !== -1, "an unfinished profile didn't get a demo match");
  check(M.bestMatch(who("Ella"), []) === null, "a match was invented with no hosts");
  check(M.bestMatch(who("Tom"), [byId("GH-2027-009")]) === null, "a host on hold was offered as a demo match");
  const jenny = M.bestMatch({ id: "jenny", name: "Jenny Graffet", profile: SAMPLE }, HOSTS);
  check(jenny.host && jenny.result.score > 0, "the sample student profile has no match");
}

/* 8. reading host lists */
{
  const csv1 = M.hostsToCsv(HOSTS), again = M.parseHosts(csv1);
  check(again.hosts.length === 10 && !again.problems.length, "CSV: read back " + again.hosts.length + " hosts, problems: " + again.problems.join("; "));
  check(M.hostsToCsv(again.hosts) === csv1, "CSV: a second round trip changed the file");
  for (const name of Object.keys(P)) {
    const a = M.bestMatch(who(name), HOSTS), b = M.bestMatch(who(name), again.hosts);
    check(a.host.meta.hostId === b.host.meta.hostId && a.result.score === b.result.score, name + "'s match changed after a CSV round trip: " + b.host.meta.hostId + " " + b.result.score);
  }
  const tpl = M.parseHosts(M.hostCsvTemplate());
  check(tpl.hosts.length === 1 && !tpl.problems.length && tpl.hosts[0].host.firstName === M.EXAMPLE_HOST.host.firstName, "the CSV template doesn't read back as its example host: " + tpl.problems.join("; "));
  check(/^Host ID,Status,/.test(M.hostCsvTemplate().replace(/^﻿/, "")), "the CSV template is missing its headings");
  const commute = M.parseHosts("First name,Last name,Commute minutes\nJoan,Price,UTS City Campus: 25; USyd Camperdown: 15\n").hosts[0];
  check(commute && commute.placement.campusCommuteMins["UTS City Campus"] === 25 && commute.placement.campusCommuteMins["USyd Camperdown"] === 15, "CSV: commute minutes not read: " + JSON.stringify(commute && commute.placement));

  const tsv = "First name\tSurname\tSuburb\tHours a week\tFavourite colour\nBetty\tNguyen\tCabramatta\t10-12\tBlue\nBetty\tNguyen\tCabramatta\t8\tRed\n";
  const b = M.parseHosts(tsv);
  check(b.hosts.length === 2 && b.hosts[0].host.lastName === "Nguyen" && b.hosts[0].home.suburb === "Cabramatta" && b.hosts[0].support.hoursPerWeek.max === 12, "TSV: rows pasted from a spreadsheet not read: " + JSON.stringify(b.hosts[0]));
  check(b.hosts[0].meta.hostId !== b.hosts[1].meta.hostId, "TSV: two hosts with the same name share an id");
  check(b.problems.some((p) => /Favourite colour/.test(p)), "TSV: unknown column not reported");
  const named = M.parseHosts("Name,Suburb\nRita Moreno Smith,Glebe\n").hosts[0];
  check(named && named.host.firstName === "Rita" && named.host.lastName === "Moreno Smith", "CSV: a single Name column wasn't split");

  const one = M.parseHosts(JSON.stringify(JSON.parse(HOSTS_TEXT).hosts[0]));
  const arr = M.parseHosts(JSON.stringify(JSON.parse(HOSTS_TEXT).hosts.slice(0, 3)));
  check(one.hosts.length === 1 && arr.hosts.length === 3, "JSON: a single host or a plain list of hosts not read");
  const wrong = M.parseHosts(JSON.stringify(SAMPLE));
  check(!wrong.hosts.length && /student profile/.test(wrong.problems[0] || ""), "JSON: a student profile wasn't turned away with a reason");
  check(/valid JSON/.test(M.parseHosts("{oops").problems[0] || ""), "JSON: broken JSON not reported");
  check(/heading row/.test(M.parseHosts("just one line").problems[0] || ""), "CSV: a single line not reported");
  const blank = M.score(who("Ella"), Object.assign(M.blankHost(), { meta: { hostId: "H-blank" }, host: { firstName: "Nobody" } }));
  check(blank.eligible && blank.score >= 35 && blank.score <= 75, "a host with no details scored " + blank.score + " (missing details should score about half)");
}

/* 9. the games' answers are ones the matcher understands */
{
  const src = (file) => read("game/" + file);
  const opts = (s, id) => {
    const m = s.match(new RegExp('\\{id:"' + id + '"[^\\n]*?opts:\\[([^\\]]*)\\]'));
    return m ? JSON.parse("[" + m[1] + "]") : null;
  };
  for (const file of ["pepaws-porch.html", "pepaws-porch.demo.html"]) {
    const s = src(file);
    for (const id of ["helpTypes", "notOffered", "hobbies", "wantsToLearn", "canOffer", "bestTimes"]) {
      const got = opts(s, id);
      if (!got) { check(/demo/.test(file) && (id === "canOffer" || id === "bestTimes"), file + ": no options found for " + id); continue; }
      const missing = got.filter((x) => M.VOCAB[id].indexOf(x) === -1);
      check(!missing.length, file + ": " + id + " options the matcher doesn't list: " + missing.join(", "));
    }
    const campuses = JSON.parse((s.match(/var CAMPUS_OPTIONS = (\[[\s\S]*?\]\]);/) || [, "[]"])[1]).map((x) => x[0]);
    check(JSON.stringify(campuses) === JSON.stringify(M.VOCAB.campuses.concat(["Another campus"])), file + ": campus options aren't the hosts' campuses: " + campuses.join(", "));
    const disciplines = [...(s.match(/var DISCIPLINES = \{([\s\S]*?)\n\};/) || [, ""])[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
    const unknown = disciplines.filter((d) => !M.FIELDS[d]);
    check(disciplines.length >= 10 && !unknown.length, file + ": areas of study the matcher doesn't know: " + unknown.join(", "));
  }
  for (const [name, items] of Object.entries(M.VOCAB)) {
    if (name === "campuses" || name === "bestTimes") continue;
    const unknown = items.filter((x) => /^text:/.test(M.concept(x)));
    check(!unknown.length, "vocabulary " + name + " has items with no shared meaning: " + unknown.join(", "));
  }
  M.VOCAB.campuses.forEach((c) => check(M.campusKey(c) === c, "campus " + c + " doesn't read back as itself"));
  check(M.campusKey("UTS City campus, Ultimo") === "UTS City Campus" && M.campusKey("University of Sydney") === "USyd Camperdown" && M.campusKey("Another campus") === null, "campus names aren't recognised");
  check(M.concept("Lifts in the homeowner’s car") === "lifts" && M.concept("Heavy lifting") === "heavy_lifting" && M.concept("Pet care") === "pets", "lifts, lifting and pet care are confused");
  check(M.fieldOf("Retired district nurse") === "health" && M.fieldOf("Speech pathologist") === "allied_health" && M.fieldOf("Counsellor") === "psychology", "careers aren't placed in the right field");
  check(M.fieldOf("Mechanical and aerospace") === "engineering" && M.fieldOf("Lawn bowls") !== "law" && M.fieldOf("Fine arts") === "design", "fields: engineering, law or the arts misread");
}

/* 10. both desks carry the same Hosts and matches code */
{
  const block = (file) => {
    const m = read("game/" + file).match(/\/\* =+\n   HOSTS AND MATCHES[\s\S]*?<\/script>/);
    return m ? m[0] : null;
  };
  const a = block("pepaws-porch.html"), b = block("pepaws-porch.demo.html");
  check(a && b, "a staff desk has no Hosts and matches block");
  check(a === b, "the Hosts and matches code differs between the full game and the demo");
}

if (problems.length) { console.log("PROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("all matching checks passed");
