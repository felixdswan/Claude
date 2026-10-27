/* Checks for the GenStay matching engine (game/genstay-matching.js), no browser needed.

   - the fifteen sample hosts (game/genstay-hosts.sample.json) read cleanly
   - fourteen market-day participants, each answering the demo's questions, are
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
  Tom: { expect: "GH-2027-003", first: "Tom", gender: "Male", age: 21, discipline: "education", goal: "Secondary teaching", campus: "UTS City Campus", hg: "male", social: 4, lodgers: "prefer",
    help: ["Company and conversation", "Pet care", "Tech and phone help", "Cooking shared meals"], hobbies: ["Sport and fitness", "Music"], hours: { min: 6, max: 8 } },
  Ana: { expect: "GH-2027-004", first: "Ana", gender: "Female", age: 23, discipline: "health", goal: "Nursing", campus: "UTS City Campus", hg: "female", languages: ["English", "French"],
    help: ["Company and conversation", "Being home in the evenings", "Cooking shared meals", "Appointments and outings", "Shopping and errands"], hobbies: ["Films and TV", "Gardening"], hours: { min: 12, max: 15 } },
  Mei: { expect: "GH-2027-005", first: "Mei", gender: "Female", age: 24, discipline: "allied_health", goal: "Occupational therapy", campus: "USyd Camperdown", social: 2, motivation: "quiet_space",
    help: ["Gardening", "Tech and phone help", "Shopping and errands", "Pet care"], hobbies: ["Art", "Gardening"], hours: { min: 6, max: 8 }, stay: 6 },
  Sam: { expect: "GH-2027-006", first: "Sam", gender: "Male", age: 20, discipline: "health", goal: "Paramedicine", campus: "Macquarie Uni", social: 5, languages: ["English", "Greek"],
    help: ["Lifts in the homeowner’s car", "Gardening", "Shopping and errands", "Tech and phone help", "Cooking shared meals"], hobbies: ["Cooking and baking", "Sport and fitness"], moveIn: "2027-03-01" },
  Zoe: { expect: "GH-2027-007", first: "Zoe", gender: "Female", age: 20, discipline: "social_work", goal: "Youth work", campus: "UTS City Campus", social: 5,
    help: ["Company and conversation", "Tech and phone help", "Appointments and outings", "Pet care"], hobbies: ["Films and TV", "Art"], hours: { min: 6, max: 8 } },
  Hoa: { expect: "GH-2027-008", first: "Hoa", gender: "Female", age: 29, discipline: "education", goal: "Primary teaching", campus: "WSU Parramatta", languages: ["English", "Vietnamese"],
    help: ["Company and conversation", "Cooking shared meals", "Shopping and errands", "Tech and phone help"], hobbies: ["Cooking and baking", "Gardening"], moveIn: "2027-03-01" },
  Leo: { expect: "GH-2027-010", first: "Leo", gender: "Male", age: 22, discipline: "health", goal: "Pharmacy", campus: "Macquarie Uni", social: 4, languages: ["English", "Mandarin"],
    help: ["Company and conversation", "Cooking shared meals", "Appointments and outings", "Tech and phone help"], hobbies: ["Sport and fitness", "Cooking and baking"], grief: "grief_invited", hours: { min: 6, max: 8 } },
  Ella: { expect: "GH-2027-001", first: "Ella", gender: "Female", age: 21, discipline: "education", goal: "Secondary teaching", campus: "UTS City Campus", social: 4, languages: ["English", "Italian"],
    help: ["Company and conversation", "Cooking shared meals", "Tech and phone help", "Shopping and errands"], hobbies: ["Reading", "Walking"], learn: ["Local history"], hours: { min: 6, max: 8 } },
  /* the five hosts added to spread the crowd: program study areas no other host covered */
  Kemi: { expect: "GH-2027-011", first: "Kemi", gender: "Female", age: 22, discipline: "social_work", goal: "Social work", campus: "UTS City Campus", languages: ["English", "Yoruba"],
    help: ["Company and conversation", "Shopping and errands", "Appointments and outings", "Tech and phone help"], hobbies: ["Music", "Crafts"], hours: { min: 6, max: 8 } },
  Luca: { expect: "GH-2027-012", first: "Luca", gender: "Male", age: 21, discipline: "allied_health", goal: "Physiotherapy", campus: "USyd Camperdown", social: 4, languages: ["English", "Italian"],
    help: ["Company and conversation", "Gardening", "Cooking shared meals", "Shopping and errands"], hobbies: ["Gardening", "Sport and fitness"], learn: ["Gardening"], hours: { min: 6, max: 8 } },
  Arjun: { expect: "GH-2027-013", first: "Arjun", gender: "Male", age: 23, discipline: "health", goal: "Medicine", campus: "UNSW Kensington", social: 4, languages: ["English", "Hindi"],
    help: ["Company and conversation", "Tech and phone help", "Shopping and errands", "Appointments and outings"], hobbies: ["Sport and fitness", "Films and TV"] },
  Bree: { expect: "GH-2027-014", first: "Bree", gender: "Female", age: 24, discipline: "carework", goal: "Aged care", campus: "WSU Parramatta",
    help: ["Company and conversation", "Being home in the evenings", "Shopping and errands", "Bins and light chores", "Appointments and outings"], hobbies: ["Crafts", "Cooking and baking"] },
  Noah: { expect: "GH-2027-015", first: "Noah", gender: "Male", age: 26, discipline: "psychology", goal: "Psychology", campus: "USyd Camperdown", social: 2, motivation: "quiet_space",
    help: ["Tech and phone help", "Shopping and errands", "Gardening"], hobbies: ["Board games and puzzles", "Reading", "Walking"], hours: { min: 6, max: 8 } }
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
  check(r.hosts.length === 18 && !r.problems.length, "sample hosts: read " + r.hosts.length + ", problems: " + r.problems.join("; "));
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
/* every sentence a participant can see, for every participant and host, reads as English */
{
  const bad = new Set();
  for (const name of Object.keys(P)) for (const h of HOSTS) {
    const r = M.score(who(name), h);
    r.forStudent.concat(r.talkAbout, r.blockers.map((x) => x.you)).forEach((t) => {
      if (/\ba (two|three|four|\d)\b|\ban? [aeiou]n? |  | ,|undefined|null|NaN|\b(west|indian|italian|greek|sydney|parramatta) [a-z]/.test(t)) bad.add(t);
    });
    const offered = r.forStudent.filter((t) => /, and you offered /.test(t)).map((t) => t.split(", and you offered ")[1]);
    const said = who(name).profile.support.helpTypes.concat(who(name).profile.interests.canOffer || []).map((x) => x.toLowerCase());
    offered.forEach((o) => { if (said.indexOf(o) === -1) bad.add(name + " with " + h.meta.hostId + ": \"you offered " + o + "\", which they didn't offer"); });
  }
  check(!bad.size, "sentences shown to participants read badly:\n  " + [...bad].join("\n  "));
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
  ["Bree", "GH-2027-014", "pets", (p) => { p.household.petAllergy = true; p.household.okWithPets = false; }], // Gwen's budgies
  ["Arjun", "GH-2027-013", "gender", (p) => { p.household.homeownerGender = "male"; }],                   // a couple: Priya counts too
  ["Noah", "GH-2027-015", "age", (p) => { p.student.age = 19; }],                                         // Colin wants 20 to 40
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
  check(hostFit("Luca", "GH-2027-012", (p) => { p.screening.landmarks[1].tags = ["fall_lifted"]; }) < hostFit("Luca", "GH-2027-012"),
    "lifting a fallen homeowner didn't count against a match with Frank, who has a falls risk");
  check(M.score(who("Kemi"), byId("GH-2027-011")).talkAbout.some((t) => /share a bathroom with her/.test(t)), "Joyce's shared bathroom isn't a talking point");
  check(M.score(who("Arjun"), byId("GH-2027-013")).talkAbout.some((t) => /draw the line at meat cooked at home/.test(t)), "the Mehtas' vegetarian kitchen isn't a talking point");
  const peter = M.score(who("Tom"), byId("GH-2027-003"));
  check(peter.parts.host.find((x) => x.key === "field").value === 0.6 && !peter.cautions.some((c) => /hoped for/.test(c)),
    "Peter's preference for engineering and design students (outside the program) cost a program student points");
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
  const ella = res.pairings.find((p) => p.studentName === "Ella");
  check(!ella || (ella.hostId !== "GH-2027-001" && ella.studentRank > 1), "Ella, who lost Helen to staff's pairing, wasn't given her next choice: " + JSON.stringify(ella));
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

/* 7. the market-day outcome: matched, waiting for a suitable host, or screened out */
{
  const ella = M.bestMatch(who("Ella"), HOSTS);
  check(ella.status === "matched" && ella.result.score >= M.MIN_SCORE && ella.host.meta.hostId === "GH-2027-001", "Ella wasn't matched with Helen: " + ella.status);
  const late = M.bestMatch(who("Ella", (p) => { p.placement.moveInDate = "2028-06-01"; }), HOSTS);
  check(late.status === "waiting" && late.closest && late.standsInWay.length && /room is free/.test(late.standsInWay[0]), "no host passing the filters didn't mean waiting, with the reason: " + JSON.stringify(late.standsInWay));
  /* a weak but eligible best match: waiting, with what held it back */
  const weak = M.bestMatch(who("Ella", (p) => { p.placement.campus = "WSU Parramatta"; p.interests.hobbies = []; p.interests.wantsToLearn = []; p.lifestyle.socialLevel = 1;
    p.support.helpTypes = ["Bins and light chores"]; p.interests.fieldMentor = "no"; }), HOSTS);
  check(weak.status === "waiting" && !weak.closest && weak.result.eligible && weak.result.score < M.MIN_SCORE && weak.shortfall.length,
    "a best match under " + M.MIN_SCORE + " wasn't a wait, with what held it back: " + JSON.stringify({ status: weak.status, score: weak.result && weak.result.score, shortfall: weak.shortfall }));
  check(weak.shortfall.every((t) => typeof t === "string" && t.length > 4), "the shortfall isn't in words: " + JSON.stringify(weak.shortfall));
  const unfinished = M.bestMatch(who("Ella", (p) => { p.meta.stages.postGame = false; }), HOSTS);
  check(unfinished.status === "matched" && unfinished.setAside.indexOf("questions") !== -1, "an unfinished profile didn't get a demo match");
  check(M.bestMatch(who("Ella"), []) === null, "a match was invented with no hosts");
  check(M.bestMatch(who("Tom"), [byId("GH-2027-009")]) === null, "a host on hold was offered as a demo match");
  const jenny = M.bestMatch({ id: "jenny", name: "Jenny Graffet", profile: SAMPLE }, HOSTS);
  check(jenny.host && jenny.result.score > 0, "the sample student profile has no match");
}

/* 7b. answers that screen someone out on their own; anything else only weighs in the score */
{
  const at = (day, tag) => (p) => { p.screening.landmarks.find((l) => l.day === day).tags = [tag]; };
  for (const [day, tag, words] of [[11, "fall_lifted", /keep her still/], [11, "fall_dismissed", /needs checking/], [14, "emergency_shaken", /call 000 straight away/], [14, "emergency_water", /anything to drink/]]) {
    const b = M.bestMatch(who("Ella", at(day, tag)), HOSTS);
    check(b.status === "screened_out" && b.host === null && b.result === null, tag + " didn't screen the participant out: " + b.status);
    check(b.screenedOut.length === 1 && words.test(b.screenedOut[0].points.join(" ")), tag + ": the participant isn't told what to do instead: " + JSON.stringify(b.screenedOut));
    const r = M.score(who("Ella", at(day, tag)), byId("GH-2027-001"));
    check(!r.eligible && r.blockers.some((x) => x.kind === "screening" && /Unsafe answer in screening/.test(x.text)), tag + ": staff aren't told why: " + JSON.stringify(r.blockers));
    const res = M.matchAll([who("Ella", at(day, tag))], HOSTS);
    check(!res.pairings.length && res.students["DEMO-Ella"].excluded.some((t) => /Unsafe/.test(t)), tag + ": still suggested on the staff desk");
  }
  const both = M.bestMatch(who("Ella", (p) => { at(11, "fall_lifted")(p); at(14, "emergency_water")(p); }), HOSTS);
  check(both.screenedOut[0].points.length === 2 && /answers/.test(both.screenedOut[0].text), "two unsafe answers aren't both given");
  /* a later recovery doesn't undo the first instinct, and safe or merely weak answers don't screen out */
  check(M.bestMatch(who("Ella", (p) => { p.screening.landmarks.find((l) => l.day === 14).tags = ["emergency_shaken", "emergency_called"]; }), HOSTS).status === "screened_out",
    "calling 000 after shaking Marg undid the screen-out");
  for (const [day, tag] of [[11, "fall_asked"], [11, "fall_called"], [14, "emergency_delayed"], [14, "emergency_froze"], [14, "timeout"], [6, "grief_dismissed"]])
    check(M.bestMatch(who("Ella", at(day, tag)), HOSTS).status !== "screened_out", tag + " screened the participant out");
  const guest = M.bestMatch(who("Ella", (p) => { p.screening.profile = "transactional_guest"; }), HOSTS);
  check(guest.status === "screened_out" && guest.host === null && /room to rent/.test(guest.screenedOut[0].points[0]), "The Transactional Guest wasn't screened out: " + guest.status);
}

/* 7c. every answer in both games is graded: a fail, a part fail, or reviewed as fine.
   A new answer fails this check until someone decides how it counts. */
{
  const REVIEWED_FINE = [
    /* a warmer or more independent style is never a fail */
    "arrival_connected", "arrival_tour", "arrival_alone", "arrival_practical", "motivation_study", "motivation_saving", "motivation_company", "motivation_learning",
    "shared_cooking", "courteous_independence", "dinner_avoided", "noticed_step", "career_curiosity", "career_exchange", "career_deferred",
    "scam_taught", "scam_escalated", "step_deferred",
    "grief_present", "grief_invited", "grief_practical", "grief_withdrawn", "grief_shared", "attended_funeral", "supported_funeral", "funeral_checkin", "skipped_funeral",
    "friction_repair", "friction_wait", "friction_guidelines", "boundary_laughed", "boundary_avoided", "boundary_calm", "boundary_sharp", "boundary_curious",
    "fall_checked", "fall_asked", "fall_called", "fall_gp", "fall_supported", "step_reported", "step_plan",
    "david_honest", "david_confidential", "david_included", "emergency_called", "emergency_froze", "emergency_wait_safe",
    "folder_found", "went_with_host", "followed_to_hospital", "packed_belongings",
    /* the quick demo's dispute follow-up: following through, or talking it over */
    "dispute_asked_first", "dispute_met_out", "dispute_talked", "dispute_note_back", "dispute_to_service", "dispute_owned", "dispute_mediated",
    /* the quick demo's final question, answered right */
    "recall_correct",
    /* keyword-matched written answers: too unreliable to screen anyone out, so staff read them */
    "asked_about_career", "career_one_way", "honest_refusal", "study_then_join", "accepted_garden", "vague_excuse", "repair_open", "repair_withdrawn",
    "redemption_attempted", "redemption_withdrawn"
  ];
  const inGames = new Set();
  for (const file of ["genstay-screener.html", "genstay-screener.demo.html"]) for (const m of read("game/" + file).matchAll(/tag:"([a-z0-9_]+)"/g)) inGames.add(m[1]);
  const unreviewed = [...inGames].filter((t) => !M.ANSWER_GRADES[t] && REVIEWED_FINE.indexOf(t) === -1);
  check(!unreviewed.length, "answers nobody has graded (add them to ANSWER_GRADES, or to REVIEWED_FINE here): " + unreviewed.join(", "));
  const stale = Object.keys(M.ANSWER_GRADES).filter((t) => !inGames.has(t)).concat(REVIEWED_FINE.filter((t) => !inGames.has(t)));
  check(!stale.length, "graded answers that no game offers any more: " + stale.join(", "));
  const both = Object.keys(M.ANSWER_GRADES).filter((t) => REVIEWED_FINE.indexOf(t) !== -1);
  check(!both.length, "answers both graded and reviewed as fine: " + both.join(", "));
  Object.entries(M.ANSWER_GRADES).forEach(([t, g]) => check(/^(fail|part)$/.test(g.grade) && g.staff.length > 15 && g.you.length > 40, t + ": grade or wording missing"));
  console.log("answers graded:", Object.values(M.ANSWER_GRADES).filter((g) => g.grade === "fail").length, "fail,",
    Object.values(M.ANSWER_GRADES).filter((g) => g.grade === "part").length, "part fail,", REVIEWED_FINE.length, "fine");
}

/* 7d. part fails on any day add up: PART_FAIL_LIMIT of them screen someone out */
{
  const choosing = (...picks) => (p) => { p.screening.choices = picks.map(([day, tag]) => ({ day, tag })); };
  const two = M.bestMatch(who("Ella", choosing([4, "scam_ignored"], [6, "grief_dismissed"], [1, "arrival_alone"])), HOSTS);
  check(two.status === "matched" && two.result.cautions.some((c) => /Concerning answers in screening \(2; 3 would screen them out\)/.test(c)),
    "two part fails should be a caution for staff, not a screen-out: " + two.status + " " + JSON.stringify(two.result && two.result.cautions));
  const three = M.bestMatch(who("Ella", choosing([4, "scam_ignored"], [6, "grief_dismissed"], [8, "friction_defensive"])), HOSTS);
  check(three.status === "screened_out" && three.screenedOut.length === 1 && three.screenedOut[0].basis === "pattern" && three.screenedOut[0].points.length === 3,
    "three part fails didn't screen out, with each reason: " + JSON.stringify(three.screenedOut));
  check(/scam text/.test(three.screenedOut[0].points[0]) && /better place/.test(three.screenedOut[0].points[1]) && /pay rent/.test(three.screenedOut[0].points[2]), "the reasons aren't in day order");
  check(/3 concerning answers in screening: .*\(Day 4\).*\(Day 6\).*\(Day 8\)/.test(three.screenedOut[0].text), "staff aren't told which answers and days: " + three.screenedOut[0].text);
  const repeat = M.bestMatch(who("Ella", (p) => { choosing([4, "scam_ignored"], [6, "grief_dismissed"])(p); p.screening.landmarks.find((l) => l.day === 6).tags = ["grief_dismissed"]; }), HOSTS);
  check(repeat.status === "matched", "the same answer, saved in both the choices and the landmarks, counted twice");
  const mixed = M.bestMatch(who("Ella", choosing([4, "phone_taken"], [11, "fall_lifted"])), HOSTS);
  check(mixed.screenedOut[0].basis === "unsafe" && /straight up/.test(mixed.screenedOut[0].points[0]) && /phone/.test(mixed.screenedOut[0].points[1]) && /; also /.test(mixed.screenedOut[0].text),
    "an unsafe answer isn't given first, with the part fails after: " + JSON.stringify(mixed.screenedOut));
  const guest = M.bestMatch(who("Ella", (p) => { p.screening.profile = "transactional_guest"; choosing([8, "friction_defensive"])(p); }), HOSTS);
  check(guest.screenedOut[0].basis === "type" && guest.screenedOut[0].points.length === 2 && /pay rent/.test(guest.screenedOut[0].points[1]),
    "The Transactional Guest isn't given the concrete choices behind it: " + JSON.stringify(guest.screenedOut));
  const noHosts = M.bestMatch(who("Ella", choosing([11, "fall_dismissed"])), []);
  check(noHosts && noHosts.status === "screened_out" && noHosts.screenedOut[0].points.length === 1, "a screen-out needs hosts to be given");
  const full = M.score(who("Ella", choosing([11, "fall_secret"], [11, "step_diy"], [12, "david_deflected"])), byId("GH-2027-001"));
  check(!full.eligible && full.blockers.some((x) => /3 concerning answers/.test(x.text)), "the full game's part fails don't add up: " + JSON.stringify(full.blockers));
}

/* 7e. the staff desk suggests only pairings at least as strong as the demo's bar */
{
  const res = M.matchAll(Object.keys(P).map((n) => who(n)), HOSTS);
  check(res.minScore === M.MIN_SCORE && res.pairings.filter((p) => !p.locked).every((p) => p.score >= M.MIN_SCORE), "a pairing under the bar was suggested");
  const weakOnly = M.matchAll([who("Ella", (p) => { p.placement.campus = "WSU Parramatta"; p.interests.hobbies = []; p.interests.wantsToLearn = []; p.lifestyle.socialLevel = 1;
    p.support.helpTypes = ["Bins and light chores"]; p.interests.fieldMentor = "no"; })], HOSTS);
  const u = weakOnly.unmatchedStudents[0];
  check(!weakOnly.pairings.length && u && u.eligible > 0 && u.strongEnough === 0 && u.best < M.MIN_SCORE, "a weak applicant was paired, or isn't listed as waiting: " + JSON.stringify(u));
}

/* 8. reading host lists */
{
  const csv1 = M.hostsToCsv(HOSTS), again = M.parseHosts(csv1);
  check(again.hosts.length === 18 && !again.problems.length, "CSV: read back " + again.hosts.length + " hosts, problems: " + again.problems.join("; "));
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
  for (const file of ["genstay-screener.html", "genstay-screener.demo.html"]) {
    const s = src(file);
    for (const id of ["helpTypes", "notOffered", "hobbies", "wantsToLearn", "canOffer", "bestTimes"]) {
      const got = opts(s, id);
      if (!got) { check(/demo/.test(file) && (id === "canOffer" || id === "bestTimes" || id === "notOffered"), file + ": no options found for " + id); continue; }
      const missing = got.filter((x) => M.VOCAB[id].indexOf(x) === -1);
      check(!missing.length, file + ": " + id + " options the matcher doesn't list: " + missing.join(", "));
    }
    const campuses = JSON.parse((s.match(/var CAMPUS_OPTIONS = (\[[\s\S]*?\]\]);/) || [, "[]"])[1]).map((x) => x[0]);
    check(JSON.stringify(campuses) === JSON.stringify(M.VOCAB.campuses.concat(["Another campus"])), file + ": campus options aren't the hosts' campuses: " + campuses.join(", "));
    /* the areas in the list, and any added after it (the demo's "other" borrows health's story) */
    const disciplines = [...(s.match(/var DISCIPLINES = \{([\s\S]*?)\n\};/) || [, ""])[1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1])
      .concat([...s.matchAll(/^DISCIPLINES\.(\w+) = /gm)].map((m) => m[1]));
    check(JSON.stringify(disciplines) === JSON.stringify(M.PROGRAM_FIELDS.concat(["other"])), file + ": areas of study aren't the program's: " + disciplines.join(", "));
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
  check(M.fieldOf("Physiotherapist, ran a sports injury clinic") === "allied_health" && M.fieldOf("Psychotherapist") === "psychology" && M.fieldOf("Aged care nurse, later ran a nursing home") === "carework",
    "fields: a physiotherapist, psychotherapist or aged care nurse misread");
  check(M.fieldOf("Mechanical and aerospace") === "engineering" && M.fieldOf("Lawn bowls") !== "law" && M.fieldOf("Fine arts") === "design", "fields: engineering, law or the arts misread");
}

/* 10. both desks carry the same Hosts and matches code */
{
  const block = (file) => {
    const m = read("game/" + file).match(/\/\* =+\n   HOSTS AND MATCHES[\s\S]*?<\/script>/);
    return m ? m[0] : null;
  };
  const a = block("genstay-screener.html"), b = block("genstay-screener.demo.html");
  check(a && b, "a staff desk has no Hosts and matches block");
  check(a === b, "the Hosts and matches code differs between the full game and the demo");
}

if (problems.length) { console.log("PROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("all matching checks passed");
