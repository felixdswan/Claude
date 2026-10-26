/* ============================================================
   GenStay matching: suggests pairings between students (GenStay
   matching profiles, contract v1.1) and hosts (the older people
   offering a room, host contract v1.0 in genstay-host-fields.md).

   No page or network access. The staff desks load it from beside the
   game, and node can require() it for tests and batch runs.

     GenStayMatch.score(student, host)      one pairing: eligible?, 0–100, the parts, and why
     GenStayMatch.matchAll(students, hosts) every pairing, each side's ranked list, and suggested pairings
     GenStayMatch.parseHosts(text)          host profiles from JSON, or CSV/TSV with a heading row
     GenStayMatch.hostsToCsv(hosts)         the host spreadsheet, for editing and re-importing
     GenStayMatch.hostCsvTemplate()         the column headings and one example row
     GenStayMatch.blankHost()               the empty host shape

   A student is {id, name, profile, suggestedHostId}: profile is the
   applicant's GenStay profile with the staff review laid over it
   (meta.pairingStatus, meta.suggestedFor).

   How a pairing is judged:
   1. Hard filters. Any clash rules the pairing out, with the reason:
      availability, screening, both gender preferences, smoking, pets,
      other students, rent, length of stay, hours, essential help the
      student won't give, a required language, safety with a falls
      risk, a commute past the student's limit, dates months apart.
   2. A weighted score out of 100 (WEIGHTS), each part explained.
      Missing information scores half, so gaps neither help nor sink
      a pairing, and the reasons say what to check.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GenStayMatch = api;
})(this, function () {
  "use strict";
  var VERSION = "1.0.0";

  /* ---------- the host profile contract ---------- */
  var HOST_CONTRACT = {
    meta: {hostId: null, status: null, updatedAt: null, notes: null},
    host: {firstName: null, lastName: null, preferredName: null, age: null, gender: null, suburb: null, region: null,
           languages: [], formerCareer: null, careerField: null, phone: null, email: null},
    home: {availableFrom: null, minStayMonths: null, maxStayMonths: null, rentWeekly: null, rooms: null, otherStudents: null,
           nearCampuses: [], smokeFree: null, hostSmokes: null, pets: [], accessibility: null},
    wants: {studentGender: null, hoursPerWeek: {min: null, max: null}, helpWanted: [], mustHave: [], bestTimes: [],
            socialLevel: null, disciplines: [], language: null},
    about: {interests: [], canTeach: [], routine: null, quietAfter: null, diet: null, guests: null},
    care: {fallsRisk: null, notes: null, emergencyContact: null}
  };
  var HOST_STATUS = {active: "Looking for a student", paused: "Paused", matched: "Has a student"};

  /* Spreadsheet columns: heading, path, type. Lists take items separated by
     semicolons (or commas); a nearby campus can carry its travel time,
     "UTS City campus (25 min)". */
  var HOST_COLUMNS = [
    ["Host ID", "meta.hostId"], ["Status", "meta.status"],
    ["First name", "host.firstName"], ["Last name", "host.lastName"], ["Preferred name", "host.preferredName"],
    ["Age", "host.age", "num"], ["Gender", "host.gender"], ["Suburb", "host.suburb"], ["Region", "host.region"],
    ["Languages", "host.languages", "list"], ["Former career", "host.formerCareer"], ["Career field", "host.careerField"],
    ["Phone", "host.phone"], ["Email", "host.email"],
    ["Room free from", "home.availableFrom", "date"], ["Shortest stay (months)", "home.minStayMonths", "num"],
    ["Longest stay (months)", "home.maxStayMonths", "num"], ["Rent per week", "home.rentWeekly", "num"],
    ["Student rooms", "home.rooms", "num"], ["Students already living there", "home.otherStudents", "num"],
    ["Nearby campuses", "home.nearCampuses", "campuses"], ["Smoke-free home", "home.smokeFree", "bool"],
    ["Homeowner smokes", "home.hostSmokes", "bool"], ["Pets", "home.pets", "list"], ["Accessibility", "home.accessibility"],
    ["Student gender wanted", "wants.studentGender"], ["Hours a week from", "wants.hoursPerWeek.min", "num"],
    ["Hours a week to", "wants.hoursPerWeek.max", "num"], ["Help wanted", "wants.helpWanted", "list"],
    ["Help that is essential", "wants.mustHave", "list"], ["Best times", "wants.bestTimes", "list"],
    ["Time together (1-5)", "wants.socialLevel", "num"], ["Preferred study areas", "wants.disciplines", "list"],
    ["Language the student must speak", "wants.language"],
    ["Interests", "about.interests", "list"], ["Can teach or share", "about.canTeach", "list"], ["Routine", "about.routine"],
    ["Quiet after", "about.quietAfter"], ["Diet", "about.diet"], ["Guests", "about.guests"],
    ["Falls risk", "care.fallsRisk", "bool"], ["Care notes", "care.notes"], ["Emergency contact", "care.emergencyContact"],
    ["Notes", "meta.notes"], ["Updated", "meta.updatedAt", "date"]
  ];
  var COLUMN_ALIASES = {surname: "host.lastName", familyname: "host.lastName", givenname: "host.firstName", firstname: "host.firstName",
    lastname: "host.lastName", id: "meta.hostId", rent: "home.rentWeekly", weeklyrent: "home.rentWeekly",
    availablefrom: "home.availableFrom", roomavailablefrom: "home.availableFrom", campuses: "home.nearCampuses",
    helpneeded: "wants.helpWanted", essentialhelp: "wants.mustHave", hobbies: "about.interests", career: "host.formerCareer",
    timetogether: "wants.socialLevel", sociallevel: "wants.socialLevel", studentgender: "wants.studentGender",
    hoursaweek: "wants.hoursPerWeek", hoursperweek: "wants.hoursPerWeek"};

  /* Matched against both the students' answers and the hosts', so these
     lists are the options the game offers (pepaws-porch.html and .demo.html). */
  var VOCAB = {
    helpWanted: ["Company and conversation", "Cooking shared meals", "Tech and phone help", "Gardening", "Bins and light chores",
                 "Shopping and errands", "Lifts in the homeowner’s car", "Pet care"],
    notOffered: ["Personal care", "Managing medication", "Overnight care", "Heavy lifting", "Cleaning the whole house"],
    interests: ["Gardening", "Cooking and baking", "Reading", "Music", "Sport and fitness", "Walking", "Crafts",
                "Board games and puzzles", "Films and TV", "Art"],
    canTeach: ["Gardening", "Family recipes", "Local history", "Life advice", "Crafts", "Card games"],
    canOffer: ["Tech and phone help", "Cooking", "Conversation", "Gardening", "Music", "Language practice", "Help with forms and paperwork"],
    bestTimes: ["Weekday mornings", "Weekday afternoons", "Weekday evenings", "Saturdays", "Sundays"],
    disciplines: {health: "Health", carework: "Carework", allied_health: "Allied health", social_work: "Social work and community services",
                  psychology: "Psychology and counselling", education: "Education and teaching", other: "Other"}
  };
  var FIELD_WORD = {health: "health", carework: "carework", allied_health: "allied health", social_work: "social work",
                    psychology: "psychology", education: "education", other: "another field"};

  var WEIGHTS = {help: 20, company: 15, screening: 15, interests: 15, career: 10, location: 10, timing: 10, hours: 5};
  var PART_LABELS = {help: "Help", company: "Time together", screening: "Screening", interests: "Interests", career: "Career",
                     location: "Location", timing: "Dates", hours: "Hours"};
  var BLOCK_LABELS = {status: "not available", hostStatus: "homeowner not looking", screening: "screening", questions: "questions unfinished",
    gender: "gender preference", smoking: "smoking", pets: "pets", lodgers: "other students", rent: "rent", stay: "length of stay",
    hours: "hours", help: "help needed", language: "language", safety: "safety", commute: "commute", dates: "dates"};
  var AVAILABLE = ["new", "screening", "shortlisted", "intro_booked"];
  var STAFF_PAIRED = ["shortlisted", "intro_booked", "matched"];
  var SERIOUS = {threatening_language: "threatening language", drug_references: "drug references"};
  var TYPE_NAMES = {connector: "The Connector", considerate_companion: "The Considerate Companion",
                    independent_tenant: "The Independent Tenant", transactional_guest: "The Transactional Guest"};

  /* ---------- small helpers ---------- */
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function get(o, path) { return path.split(".").reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function setPath(o, path, v) {
    var keys = path.split(".");
    for (var i = 0; i < keys.length - 1; i++) { if (!isObj(o[keys[i]])) o[keys[i]] = {}; o = o[keys[i]]; }
    o[keys[keys.length - 1]] = v;
  }
  function blank(v) { return v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length); }
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[’‘`]/g, "'").replace(/&/g, " and ")
      .replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return !blank(x); });
    if (blank(v)) return [];
    var s = String(v);
    return s.split(s.indexOf(";") !== -1 ? /[;\n]/ : /[,\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function num(v) {
    if (blank(v)) return null;
    var n = Number(String(v).replace(/[$,\s]/g, ""));
    return isFinite(n) ? n : null;
  }
  function bool(v) {
    if (v === true || v === false) return v;
    var s = norm(v);
    if (/^(y|yes|true|1|ok|x)$/.test(s)) return true;
    if (/^(n|no|false|0|none)$/.test(s)) return false;
    return null;
  }
  function range(v) {
    if (blank(v)) return null;
    if (typeof v === "number") return {min: v, max: v};
    if (isObj(v)) {
      var a = num(v.min), b = num(v.max);
      if (a == null && b == null) return null;
      return {min: a == null ? b : a, max: b == null ? a : b};
    }
    var m = String(v).match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
    if (m) return {min: +m[1], max: +m[2]};
    var n = num(v);
    return n == null ? null : {min: n, max: n};
  }
  /* "2027-02-01" or the Australian "1/2/2027" -> "2027-02-01" */
  function isoDate(v) {
    if (blank(v)) return null;
    var s = String(v).trim(), m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    return s;
  }
  function dayNumber(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
  }
  function shortDate(iso) {
    var d = dayNumber(iso);
    if (d == null) return String(iso || "");
    var t = new Date(d * 86400000);
    return t.getUTCDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][t.getUTCMonth()] + " " + t.getUTCFullYear();
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function hoursText(r) { return r.min === r.max ? r.min + " hours" : r.min + "–" + r.max + " hours"; }
  function joinAnd(items) {
    return items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
  }
  function aOrAn(word) { return /^[aeiou]/i.test(word) ? "an " + word : "a " + word; }
  function clamp(x) { return Math.max(0, Math.min(1, x)); }

  /* ---------- shared meaning across the two sides' wording ----------
     "Cooking shared meals" (help), "Cooking and baking" (a hobby) and
     "Family recipes" (something to learn) all mean cooking. Words outside
     the lists still match on these keywords, or on the exact words. */
  var CONCEPTS = [
    ["personal_care", /personal care|shower|bathing|dressing|toilet/],
    ["medication", /medicat|medicine|tablets|pills/],
    ["overnight", /overnight|night care|night support/],
    ["heavy_lifting", /heavy|lifting/],
    ["cleaning", /clean/],
    ["company", /company|conversation|chat|talk|companionship/],
    ["cooking", /cook|bak|recipe|meal|scone/],
    ["tech", /tech|phone|computer|internet|tablet|ipad|email|online|video call/],
    ["garden", /garden|plant|weed|lawn/],
    ["chores", /\bbins?\b|chore|tidy|washing up|dishes/],
    ["errands", /shop|errand|grocer/],
    ["lifts", /\blifts?\b|driv|\bcar\b|appointment/],
    ["pets", /\bpets?\b|\bdogs?\b|\bcats?\b|\bbirds?\b/],
    ["music", /music|sing|choir|piano|guitar|band/],
    ["language", /language|speak/],
    ["paperwork", /\bforms?\b|paperwork|letters?\b|\bbills?\b|admin/],
    ["reading", /read|book|librar|novel/],
    ["sport", /sport|fitness|gym|footy|football|tennis|swim|cricket|yoga|exercise/],
    ["walking", /walk/],
    ["crafts", /craft|knit|sew|quilt|crochet/],
    ["games", /game|puzzle|\bcards?\b|crossword|chess|rummy|scrabble|bridge|mahjong/],
    ["films", /film|\btv\b|television|movie|cinema/],
    ["art", /\bart\b|paint|draw|sketch/],
    ["history", /history|heritage/],
    ["advice", /advice|wisdom|mentor/]
  ];
  function concept(label) {
    var s = norm(label);
    for (var i = 0; i < CONCEPTS.length; i++) if (CONCEPTS[i][1].test(s)) return CONCEPTS[i][0];
    return "text:" + s;
  }
  /* [{key, label}] with one entry per meaning */
  function concepts(v) {
    var seen = {}, out = [];
    list(v).forEach(function (label) {
      var key = concept(label);
      if (!seen[key]) { seen[key] = 1; out.push({key: key, label: String(label).trim()}); }
    });
    return out;
  }
  function keysOf(items) { var o = {}; items.forEach(function (x) { o[x.key] = 1; }); return o; }
  function common(a, b) { var k = keysOf(b); return a.filter(function (x) { return k[x.key]; }); }
  function labels(items, max) {
    var l = items.map(function (x) { return x.label; });
    return max && l.length > max ? l.slice(0, max).join(", ") + " and " + (l.length - max) + " more" : joinAnd(l);
  }

  /* ---------- careers: a field for each side ---------- */
  var FIELD_WORDS = [
    ["psychology", /psycholog|counsel|therapist|psychiatr|mental health/],
    ["allied_health", /physio|occupational|\bot\b|speech|dietit|nutrition|podiat|exercise physiolog|chiropract|osteopath|audiolog|optometr/],
    ["social_work", /social work|community services|community work|welfare|case work|youth work|child protection/],
    ["education", /teach|school|principal|lectur|tutor|education|early childhood|kindergarten|librarian/],
    ["carework", /aged care|disabilit|support worker|care worker|\bcarer\b|community care|home care/],
    ["health", /nurs|midwi|doctor|\bgp\b|medic|physician|surgeon|paramedic|ambulance|pharmac|hospital|dentist|dental|radiograph|health/]
  ];
  function fieldOf(text) {
    var s = norm(text);
    if (!s) return null;
    if (VOCAB.disciplines[s.replace(/ /g, "_")]) return s.replace(/ /g, "_");
    for (var k in VOCAB.disciplines) if (norm(VOCAB.disciplines[k]) === s) return k;
    for (var i = 0; i < FIELD_WORDS.length; i++) if (FIELD_WORDS[i][1].test(s)) return FIELD_WORDS[i][0];
    return null;
  }

  /* ---------- gender ---------- */
  function genderCode(v) {
    var s = norm(v).replace(/^(a|an) /, "");
    if (!s || /prefer not|not say|unknown|^n ?a$/.test(s)) return null;
    if (/^(f|female|woman|women|girl|she)\b/.test(s)) return "female";
    if (/^(m|male|man|men|boy|he)\b/.test(s)) return "male";
    return "other";
  }
  function genderPref(v) {
    var s = norm(v).replace(/^(a|an) /, "");
    if (!s || /any|either|no pref|both|don't mind|dont mind|not fussed|no preference/.test(s)) return "any";
    var g = genderCode(s);
    return g === "female" || g === "male" ? g : "any";
  }
  var GENDER_WORD = {female: "female", male: "male"};

  /* ---------- languages and place names: the same words, or one inside the other ---------- */
  function sameWords(a, b) {
    a = norm(a); b = norm(b);
    return !!a && !!b && (a === b || (a.length > 3 && b.indexOf(a) !== -1) || (b.length > 3 && a.indexOf(b) !== -1));
  }

  /* ---------- places ---------- */
  var PLACE_STOP = ("campus city university uni of the and at college institute technology tech school main centre center building "
    + "street st road rd sydney melbourne brisbane perth adelaide hobart canberra darwin australia australian nsw vic qld wa sa tas act nt "
    + "western eastern northern southern west east north south new near").split(" ");
  function placeTokens(s) {
    return norm(s).split(" ").filter(function (t) { return t.length > 1 && PLACE_STOP.indexOf(t) === -1; });
  }
  function campusEntries(v) {
    return (Array.isArray(v) ? v : list(v)).map(function (c) {
      if (isObj(c)) return {name: String(c.name || ""), mins: num(c.mins)};
      var m = String(c).match(/^(.*?)\s*\((\d+)\s*(?:min|mins|minutes)?\)\s*$/i);
      return m ? {name: m[1].trim(), mins: +m[2]} : {name: String(c).trim(), mins: null};
    }).filter(function (c) { return c.name; });
  }
  function campusMatch(studentCampus, entries) {
    var want = placeTokens(studentCampus);
    if (!want.length) return null;
    var best = null;
    entries.forEach(function (c) {
      var have = placeTokens(c.name), hits = want.filter(function (t) { return have.indexOf(t) !== -1; }).length;
      if (hits && (!best || hits > best.hits || (hits === best.hits && (c.mins || 999) < (best.mins || 999))))
        best = {name: c.name, mins: c.mins, hits: hits};
    });
    return best;
  }

  /* ---------- the two sides, normalised once ---------- */
  function hostName(h) {
    var x = (h && h.host) || {};
    return [x.preferredName || x.firstName, x.lastName].filter(Boolean).join(" ") || (h && h.meta && h.meta.hostId) || "Unnamed host";
  }
  function hostFullName(h) {
    var x = (h && h.host) || {};
    return [x.firstName, x.lastName].filter(Boolean).join(" ") || hostName(h);
  }
  function hostId(h) { return String(get(h, "meta.hostId") || ""); }

  function hostView(hp) {
    var h = hp || {}, x = h.host || {}, home = h.home || {}, w = h.wants || {}, ab = h.about || {}, care = h.care || {};
    var status = norm(get(h, "meta.status")) || "active";
    if (!HOST_STATUS[status]) status = /pause|hold|away/.test(status) ? "paused" : /match|placed|full|taken/.test(status) ? "matched" : "active";
    return {
      raw: h, id: hostId(h), name: hostName(h), fullName: hostFullName(h), status: status,
      gender: genderCode(x.gender), suburb: x.suburb || "", region: x.region || "",
      languages: list(x.languages), formerCareer: x.formerCareer || "", field: fieldOf(x.careerField) || fieldOf(x.formerCareer),
      availableFrom: isoDate(home.availableFrom), minStay: num(home.minStayMonths), maxStay: num(home.maxStayMonths),
      rent: num(home.rentWeekly), rooms: Math.max(1, num(home.rooms) || 1), otherStudents: num(home.otherStudents) || 0,
      campuses: campusEntries(home.nearCampuses), smokeFree: bool(home.smokeFree), hostSmokes: bool(home.hostSmokes),
      pets: list(home.pets).filter(function (p) { return !/^(none|no|nil|no pets)$/i.test(String(p).trim()); }),
      wantsGender: genderPref(w.studentGender), hours: range(w.hoursPerWeek), help: concepts(list(w.helpWanted).concat(list(w.mustHave))), mustHave: concepts(w.mustHave),
      bestTimes: concepts(w.bestTimes), social: num(w.socialLevel),
      disciplines: list(w.disciplines).map(fieldOf).filter(Boolean), language: blank(w.language) ? "" : String(w.language).trim(),
      interests: concepts(ab.interests), canTeach: concepts(ab.canTeach), fallsRisk: bool(care.fallsRisk) === true
    };
  }

  function studentView(st) {
    var s = st || {}, p = s.profile || {}, meta = p.meta || {}, stu = p.student || {}, pl = p.placement || {}, it = p.interests || {};
    var hh = p.household || {}, sup = p.support || {}, life = p.lifestyle || {}, sc = p.screening || {};
    var field = stu.discipline && stu.discipline !== "other" ? stu.discipline : fieldOf(it.careerGoal);
    return {
      raw: s, id: String(s.id || meta.profileId || ""), name: s.name || [stu.firstName, stu.lastName].filter(Boolean).join(" ") || "Unnamed applicant",
      status: meta.pairingStatus || "new", suggestedFor: meta.suggestedFor || "", suggestedHostId: s.suggestedHostId || "",
      complete: !!(meta.stages && meta.stages.postGame), hasGame: !blank(sc.profile), type: sc.profile || null,
      meters: sc.meters || {}, flags: sc.flags || [], motivation: sc.motivation || null, quickDemo: (sc.flags || []).indexOf("quick_demo") !== -1,
      gender: genderCode(stu.gender), genderLabel: stu.gender || "", wantsGender: genderPref(hh.homeownerGender),
      otherLodgers: hh.otherLodgers || null, smoker: bool(hh.smoker), needsSmokeFree: bool(hh.needsSmokeFree),
      okWithPets: bool(hh.okWithPets), petAllergy: bool(hh.petAllergy), accessibility: hh.accessibilityNeeds || "", dealbreakers: list(hh.dealbreakers),
      rent: num(sup.rentBudgetWeekly), hours: range(sup.hoursPerWeek), help: concepts(sup.helpTypes), notOffered: concepts(sup.notOffered),
      bestTimes: concepts(sup.bestTimes), hobbies: concepts(it.hobbies), canOffer: concepts(it.canOffer), wantsToLearn: concepts(it.wantsToLearn),
      languages: list(stu.languages), field: field, discipline: stu.discipline || null, careerGoal: it.careerGoal || "",
      fieldMentor: it.fieldMentor || null, social: num(life.socialLevel),
      campus: pl.campus || "", areas: list(pl.preferredAreas), maxCommute: num(pl.maxCommuteMins), maxCommuteFlex: num(pl.maxCommuteFlexMins),
      moveIn: isoDate(pl.moveInDate), flexWeeks: num(pl.moveInFlexWeeks) || 0, stay: num(pl.stayMonths)
    };
  }

  /* Is this student already paired with this host by staff? */
  function linkedTo(s, h) {
    if (s.suggestedHostId) return s.suggestedHostId === h.id;
    var n = norm(s.suggestedFor);
    return !!n && (n === norm(h.fullName) || n === norm(h.name));
  }

  /* What keeps a student out of matching with every host (the host can't change it). */
  function studentBlockers(s, linked) {
    var out = [], serious = s.flags.filter(function (f) { return SERIOUS[f]; });
    if (AVAILABLE.indexOf(s.status) === -1 && !(s.status === "matched" && linked))
      out.push({kind: "status", text: s.status === "matched" ? "Already matched" + (s.suggestedFor ? " with " + s.suggestedFor : "")
        : s.status === "not_suitable" ? "Marked not suitable" : s.status === "on_hold" ? "On hold" : "Status: " + s.status});
    if (!s.hasGame) out.push({kind: "screening", text: "Hasn’t finished the screening game"});
    else if (serious.length) out.push({kind: "screening", text: "Screening flagged " + joinAnd(serious.map(function (f) { return SERIOUS[f]; })) + ", so they’re kept out of automatic matching"});
    else if (s.type === "transactional_guest") out.push({kind: "screening", text: "Screening result is The Transactional Guest, which is kept out of automatic matching"});
    if (!s.complete) out.push({kind: "questions", text: "Hasn’t finished the matching questions"});
    return out;
  }

  /* ---------- one pairing ---------- */
  function judge(s, h) {
    var out = {studentId: s.id, hostId: h.id, eligible: true, score: 0, band: "weak", linked: linkedTo(s, h),
               blockers: [], strengths: [], cautions: [], parts: []};
    var block = function (kind, text) { out.blockers.push({kind: kind, text: text}); };
    var good = function (text) { out.strengths.push(text); };
    var warn = function (text) { out.cautions.push(text); };
    var part = function (key, value, note) {
      var v = clamp(value == null ? 0.5 : value);
      out.parts.push({key: key, label: PART_LABELS[key], weight: WEIGHTS[key], value: v, points: Math.round(v * WEIGHTS[key] * 10) / 10, note: note || ""});
    };

    /* 1. hard filters */
    studentBlockers(s, out.linked).forEach(function (b) { out.blockers.push(b); });
    if (h.status !== "active" && !out.linked) block("hostStatus", h.status === "paused" ? "This homeowner is paused" : "This homeowner already has a student");

    if (s.wantsGender !== "any" && h.gender && h.gender !== s.wantsGender)
      block("gender", "Asked for a " + GENDER_WORD[s.wantsGender] + " homeowner");
    else if (s.wantsGender !== "any" && !h.gender) warn("Asked for a " + GENDER_WORD[s.wantsGender] + " homeowner, and this host’s gender isn’t recorded");
    if (h.wantsGender !== "any" && s.gender !== h.wantsGender)
      block("gender", "The homeowner asked for a " + GENDER_WORD[h.wantsGender] + " student" + (s.gender ? "" : ", and the applicant’s gender isn’t stated"));

    var smokyHome = h.hostSmokes === true || h.smokeFree === false;
    if (s.smoker === true && h.smokeFree === true) block("smoking", "Smokes or vapes, and the home is smoke-free");
    if (s.needsSmokeFree === true && smokyHome) block("smoking", "Needs a smoke-free home, and this one isn’t");
    if (h.pets.length && s.petAllergy === true) block("pets", "Has a pet allergy, and the homeowner has " + joinAnd(h.pets.map(function (p) { return p.toLowerCase(); })));
    else if (h.pets.length && s.okWithPets === false) block("pets", "Would rather not live with pets, and the homeowner has " + joinAnd(h.pets.map(function (p) { return p.toLowerCase(); })));
    if (h.otherStudents > 0 && s.otherLodgers === "none") block("lodgers", "Wants to be the only student, and " + plural(h.otherStudents, "other student lives", "other students live") + " there");
    if (s.rent != null && h.rent != null && s.rent < h.rent) block("rent", "Rent is $" + h.rent + " a week, over the $" + s.rent + " budget");
    if (s.stay && h.minStay && s.stay < h.minStay) block("stay", "Wants " + s.stay + " months, and the homeowner asks for at least " + h.minStay);
    if (s.hours && h.hours && s.hours.max < h.hours.min) block("hours", "Offers " + hoursText(s.hours) + " a week, and the homeowner hopes for " + hoursText(h.hours));
    var refused = common(h.mustHave, s.notOffered);
    if (refused.length) block("help", "Not comfortable with " + labels(refused).toLowerCase() + ", which the homeowner needs");
    if (h.language && !s.languages.some(function (l) { return sameWords(l, h.language); }))
      block("language", "The homeowner needs someone who speaks " + h.language);
    if (h.fallsRisk && (s.flags.indexOf("low_safety_awareness") !== -1 || (s.meters.awareness != null && s.meters.awareness <= 3)))
      block("safety", "Low safety awareness in screening, and the homeowner has a falls risk");

    /* 2. the score */
    // help
    var offered = s.help.concat(s.canOffer), covered = common(h.help, offered);
    var help = h.help.length && s.help.length ? covered.length / h.help.length : null;
    var missing = h.mustHave.filter(function (x) { return !keysOf(offered)[x.key] && !keysOf(refused)[x.key]; });
    if (missing.length){ if (help != null) help *= 0.6; warn("Didn’t tick " + labels(missing).toLowerCase() + ", which the homeowner needs"); }
    if (covered.length) good("Can help with " + labels(covered, 4).toLowerCase());
    var unwilling = common(h.help, s.notOffered).filter(function (x) { return !keysOf(refused)[x.key]; });
    if (unwilling.length) warn("Not comfortable with " + labels(unwilling).toLowerCase() + ", which the homeowner would like");
    if (h.bestTimes.length && s.bestTimes.length && help != null) {
      var times = common(h.bestTimes, s.bestTimes);
      help = 0.8 * help + 0.2 * (times.length ? 1 : 0);
      if (!times.length) warn("No overlap in the best times to help");
    }
    part("help", help, help == null ? "not enough to compare" : covered.length + " of " + h.help.length + " wanted");

    // time together
    var c = s.meters.connection, bits = [];
    if (h.social && s.social) {
      var close = 1 - Math.abs(h.social - s.social) / 4;
      bits.push([close, 0.6]);
      if (close >= 0.75) good("Similar hopes for time together (homeowner " + h.social + "/5, applicant " + s.social + "/5)");
      else if (close <= 0.25) warn("Different hopes for time together (homeowner " + h.social + "/5, applicant " + s.social + "/5)");
    }
    if (h.social && c != null) bits.push([1 - Math.abs((h.social - 1) / 4 - c / 10), 0.4]);
    var company = bits.length ? bits.reduce(function (n, b) { return n + b[0] * b[1]; }, 0) / bits.reduce(function (n, b) { return n + b[1]; }, 0) : null;
    if (company != null && s.motivation === "company" && h.social >= 4) { company += 0.1; good("Came for company and conversation"); }
    part("company", company, h.social ? "homeowner " + h.social + "/5" + (s.social ? ", applicant " + s.social + "/5" : "") : "not enough to compare");

    // screening
    var m = s.meters, typeFit = {connector: 1, considerate_companion: 0.85, transactional_guest: 0}[s.type];
    if (s.type === "independent_tenant") typeFit = h.social && h.social <= 2 ? 0.85 : 0.55;
    var screening = null;
    if (typeFit != null) {
      var rr = ((m.respect == null ? 5 : m.respect) + (m.reliability == null ? 5 : m.reliability)) / 20;
      screening = 0.6 * typeFit + 0.4 * rr;
      if (s.type === "connector" || s.type === "considerate_companion") good("Screening: " + TYPE_NAMES[s.type]);
      else if (s.type === "independent_tenant" && h.social && h.social <= 2) good("An independent style suits this homeowner’s quieter home");
      else if (s.type === "independent_tenant") warn("Screening: The Independent Tenant, and the homeowner hopes for company");
    }
    if (h.fallsRisk && m.awareness != null && m.awareness > 3) {
      if (m.awareness >= 7) { screening = (screening == null ? 0.5 : screening) + 0.1; good("Strong safety awareness, which matters with the falls risk"); }
      else warn("Moderate safety awareness (" + m.awareness + "/10), and the homeowner has a falls risk");
    }
    if (s.flags.indexOf("welfare_concern") !== -1) warn("Possible welfare concern in screening: read the watch-point first");
    if (s.flags.indexOf("low_safety_awareness") !== -1 && !h.fallsRisk) warn("Low safety awareness in screening");
    if (s.flags.indexOf("answers_to_check") !== -1) warn("Some answers need checking (see the watch-point)");
    if (s.quickDemo) warn("Screened with the quick demo only");
    part("screening", screening, s.type ? TYPE_NAMES[s.type] || s.type : "no game result");

    // shared interests
    var shared = common(s.hobbies, h.interests), learn = common(s.wantsToLearn, h.canTeach);
    var sharedKeys = keysOf(shared.concat(learn));
    var gift = common(s.canOffer, h.interests).filter(function (x) { return !sharedKeys[x.key]; });
    var hostSide = h.interests.length + h.canTeach.length, studentSide = s.hobbies.length + s.wantsToLearn.length + s.canOffer.length;
    var interests = hostSide && studentSide ? (shared.length + 1.5 * learn.length + 0.5 * gift.length) / 3 : null;
    if (shared.length) good("Shared interests: " + labels(shared, 4).toLowerCase());
    if (learn.length) good("Wants to learn " + labels(learn).toLowerCase() + ", which the homeowner can teach");
    part("interests", interests, interests == null ? "not enough to compare" : shared.length + " shared, " + learn.length + " to learn");

    // career
    var mentor = {keen: 1, open: 0.75, no: 0.35}[s.fieldMentor];
    var career = null, listed = null;
    if (h.field && s.field) {
      if (h.field === s.field) {
        career = 0.5 + 0.5 * (mentor == null ? 0.6 : mentor);
        good("The homeowner " + (h.formerCareer ? "was " + aOrAn(h.formerCareer.toLowerCase()) : "worked in " + FIELD_WORD[h.field])
          + ", and the applicant " + (s.careerGoal && s.careerGoal !== "Not sure yet" ? "is heading for " + s.careerGoal.toLowerCase() : "studies " + FIELD_WORD[s.field])
          + (s.fieldMentor === "keen" ? " and would love a homeowner from their field" : ""));
      } else career = s.fieldMentor === "no" ? 0.6 : 0.3;
    }
    if (h.disciplines.length && s.field) {
      listed = h.disciplines.indexOf(s.field) !== -1;
      career = 0.8 * (career == null ? 0.5 : career) + (listed ? 0.2 : 0);
      if (listed) good("The homeowner hoped for " + aOrAn(FIELD_WORD[s.field]) + " student");
      else warn("The homeowner hoped for " + joinAnd(h.disciplines.map(function (d) { return FIELD_WORD[d]; })) + " students");
    }
    part("career", career, h.field && s.field ? (h.field === s.field ? "same field" : "different fields") : "not enough to compare");

    // location
    var location = null, where = "";
    if (s.campus && h.campuses.length) {
      var near = campusMatch(s.campus, h.campuses);
      if (near) {
        location = 1; where = near.name;
        if (near.mins != null && s.maxCommuteFlex && near.mins > s.maxCommuteFlex) {
          block("commute", "About " + near.mins + " minutes to " + near.name + ", past the applicant’s limit of " + s.maxCommuteFlex);
          location = 0;
        } else if (near.mins != null && s.maxCommute && near.mins > s.maxCommute) {
          location = 0.6; warn("About " + near.mins + " minutes to " + near.name + ", more than the applicant’s preferred " + s.maxCommute);
        } else good(near.mins != null ? "About " + near.mins + " minutes to " + near.name : "Near " + near.name);
      } else { location = 0.2; warn(s.campus + " isn’t on this homeowner’s list of nearby campuses"); }
    } else if (s.campus) warn("Check the commute from " + (h.suburb || "this home") + " to " + s.campus);
    if (s.areas.length && (h.suburb || h.region) && s.areas.some(function (a) { return sameWords(a, h.suburb) || sameWords(a, h.region); })) {
      location = Math.max(location == null ? 0 : location, 0.8); good("In an area the applicant asked for (" + (h.suburb || h.region) + ")");
    }
    part("location", location, where || (s.campus ? "commute unknown" : "no campus given"));

    // dates and length of stay
    var dateFit = null, stayFit = null;
    var a = dayNumber(s.moveIn), b = dayNumber(h.availableFrom);
    if (a != null && b != null) {
      var gap = (b - a) / 7, over = Math.max(0, Math.abs(gap) - s.flexWeeks);
      dateFit = Math.max(0, 1 - over / 12);
      var weeks = plural(Math.round(Math.abs(gap)), "week", "weeks");
      if (over > 12) block("dates", gap > 0 ? "The room is free from " + shortDate(h.availableFrom) + ", " + weeks + " after the applicant’s move-in date"
        : "The applicant can’t move in until " + shortDate(s.moveIn) + ", " + weeks + " after the room is free");
      else if (over > 4) warn(gap > 0 ? "The room is free from " + shortDate(h.availableFrom) + ", " + weeks + " after the applicant’s move-in date"
        : "The applicant moves in " + weeks + " after the room is free");
    }
    if (s.stay && (h.minStay || h.maxStay)) {
      stayFit = h.maxStay && s.stay > h.maxStay ? 0.6 : 1;
      if (stayFit < 1) warn("Wants " + s.stay + " months, and the homeowner offers up to " + h.maxStay);
    }
    var timing = dateFit == null && stayFit == null ? null : ((dateFit == null ? 0.5 : dateFit) + (stayFit == null ? 0.5 : stayFit)) / 2;
    part("timing", timing, dateFit == null ? "dates unknown" : over <= 1 ? "dates line up" : Math.round(over) + " weeks apart");

    // hours
    var hours = s.hours && h.hours ? (s.hours.max >= h.hours.min ? 1 : 0) : null;
    part("hours", hours, s.hours && h.hours ? hoursText(s.hours) + " offered, " + hoursText(h.hours) + " hoped for" : "not enough to compare");

    if (s.accessibility && !/^(none|no|n\/a|nil)\.?$/i.test(s.accessibility.trim())) warn("Check accessibility: " + s.accessibility);
    if (s.dealbreakers.length) warn("Check the applicant’s dealbreakers: " + s.dealbreakers.join(", "));
    if (s.status === "shortlisted" && s.suggestedFor && !out.linked) warn("Already shortlisted for " + s.suggestedFor);

    out.eligible = !out.blockers.length;
    out.score = Math.round(out.parts.reduce(function (n, p) { return n + p.value * p.weight; }, 0));
    out.band = out.score >= 80 ? "strong" : out.score >= 65 ? "good" : out.score >= 50 ? "possible" : "weak";
    return out;
  }

  function score(student, host) { return judge(studentView(student), hostView(host)); }

  function byScore(a, b) { return b.score - a.score || a.cautions.length - b.cautions.length; }
  function nearestFirst(a, b) { return a.blockers.length - b.blockers.length || b.score - a.score; }

  /* Every pairing, ranked both ways, and one suggested student per free
     room: staff's own pairings first, then the best remaining pairs in
     score order (each student and room used once). */
  function matchAll(students, hosts) {
    var ss = (students || []).map(studentView), hs = (hosts || []).map(hostView);
    var res = {version: VERSION, hosts: {}, students: {}, pairings: [], alsoPaired: [], unmatchedHosts: [], unmatchedStudents: []};
    hs.forEach(function (h) { res.hosts[h.id] = {id: h.id, name: h.name, fullName: h.fullName, status: h.status, ranked: [], ruledOut: [], why: {}}; });
    ss.forEach(function (s) {
      res.students[s.id] = {id: s.id, name: s.name, ranked: [], ruledOut: [], excluded: studentBlockers(s, false).map(function (b) { return b.text; })};
    });
    var all = [];
    hs.forEach(function (h) {
      ss.forEach(function (s) {
        var r = judge(s, h);
        r.studentName = s.name; r.hostName = h.name;
        all.push(r);
        var hr = res.hosts[h.id], sr = res.students[s.id];
        if (r.eligible) { hr.ranked.push(r); sr.ranked.push(r); }
        else {
          hr.ruledOut.push(r); sr.ruledOut.push(r);
          var kinds = {};
          r.blockers.forEach(function (b) { kinds[b.kind] = 1; });
          Object.keys(kinds).forEach(function (k) { hr.why[k] = (hr.why[k] || 0) + 1; });
        }
      });
    });
    Object.keys(res.hosts).forEach(function (id) { res.hosts[id].ranked.sort(byScore); res.hosts[id].ruledOut.sort(nearestFirst); });
    Object.keys(res.students).forEach(function (id) { res.students[id].ranked.sort(byScore); });

    var rooms = {}, placed = {}, statusOf = {}, staffLinked = {};
    ss.forEach(function (s) { statusOf[s.id] = s.status; });
    hs.forEach(function (h) { rooms[h.id] = h.status === "active" || ss.some(function (s) { return linkedTo(s, h); }) ? h.rooms : 0; });
    var take = function (r, locked) {
      rooms[r.hostId]--; placed[r.studentId] = true;
      res.pairings.push({hostId: r.hostId, studentId: r.studentId, hostName: r.hostName, studentName: r.studentName, score: r.score, band: r.band,
                         eligible: r.eligible, locked: locked, strengths: r.strengths.slice(0, 3), cautions: r.cautions.slice(0, 3), blockers: r.blockers});
    };
    /* Staff's own pairings first. When staff have shortlisted more applicants
       for a host than it has rooms, the best takes the room and the rest are
       listed in alsoPaired, with anything that would rule them out. */
    all.filter(function (r) { return r.linked && STAFF_PAIRED.indexOf(statusOf[r.studentId]) !== -1; }).sort(byScore).forEach(function (r) {
      staffLinked[r.studentId] = true;
      if (!placed[r.studentId] && rooms[r.hostId] > 0) take(r, true);
      else res.alsoPaired.push({hostId: r.hostId, studentId: r.studentId, hostName: r.hostName, studentName: r.studentName, status: statusOf[r.studentId],
                                score: r.score, band: r.band, eligible: r.eligible, blockers: r.blockers});
    });
    all.filter(function (r) { return r.eligible && !r.linked; }).sort(byScore).forEach(function (r) {
      if (!placed[r.studentId] && rooms[r.hostId] > 0 && res.hosts[r.hostId].status === "active") take(r, false);
    });
    res.pairings.sort(function (a, b) { return Number(b.locked) - Number(a.locked) || b.score - a.score; });
    res.unmatchedHosts = hs.filter(function (h) { return h.status === "active" && rooms[h.id] === h.rooms; }).map(function (h) {
      var why = res.hosts[h.id].why;
      return {id: h.id, name: h.name, eligible: res.hosts[h.id].ranked.length, ruledOut: res.hosts[h.id].ruledOut.length,
              reasons: Object.keys(why).sort(function (x, y) { return why[y] - why[x]; }).slice(0, 3).map(function (k) { return BLOCK_LABELS[k] + " (" + why[k] + ")"; })};
    });
    res.unmatchedStudents = ss.filter(function (s) { return !placed[s.id] && !staffLinked[s.id] && !res.students[s.id].excluded.length; })
      .map(function (s) { return {id: s.id, name: s.name, eligible: res.students[s.id].ranked.length}; });
    return res;
  }

  /* The host's details as [label, text] pairs, for staff to read. */
  function hostFacts(h) {
    h = h || {};
    var x = h.host || {}, home = h.home || {}, w = h.wants || {}, ab = h.about || {}, care = h.care || {}, meta = h.meta || {};
    var hrs = range(w.hoursPerWeek), pets = list(home.pets), must = keysOf(concepts(w.mustHave)), field = fieldOf(x.careerField);
    var wanted = list(w.helpWanted), wantedKeys = keysOf(concepts(wanted));
    list(w.mustHave).forEach(function (t) { if (!wantedKeys[concept(t)]) wanted.push(t); });
    var stay = [num(home.minStayMonths) ? "at least " + num(home.minStayMonths) + " months" : "", num(home.maxStayMonths) ? "up to " + num(home.maxStayMonths) + " months" : ""].filter(Boolean).join(", ");
    var rooms = num(home.rooms) || 1, others = num(home.otherStudents) || 0, g = genderPref(w.studentGender), contact = care.emergencyContact;
    return [
      ["Former career", x.formerCareer || (field ? VOCAB.disciplines[field] : "")],
      ["Languages", list(x.languages).join(", ")],
      ["Room free from", home.availableFrom ? shortDate(isoDate(home.availableFrom)) : ""],
      ["Length of stay", stay ? stay.charAt(0).toUpperCase() + stay.slice(1) : ""],
      ["Rent", num(home.rentWeekly) != null ? "$" + num(home.rentWeekly) + " a week" : ""],
      ["Rooms", plural(rooms, "student room", "student rooms") + (others ? ", " + plural(others, "student", "students") + " already there" : "")],
      ["Near", campusEntries(home.nearCampuses || []).map(function (c) { return c.name + (c.mins != null ? " (" + c.mins + " min)" : ""); }).join("; ")],
      ["Home", [home.smokeFree === true ? "Smoke-free" : home.smokeFree === false ? "Smoking allowed" : "", home.hostSmokes === true ? "the homeowner smokes" : "",
                pets.length ? "pets: " + pets.join(", ").toLowerCase() : "no pets"].filter(Boolean).join(", ")],
      ["Accessibility", home.accessibility || ""],
      ["Student gender", g === "female" ? "Female students" : g === "male" ? "Male students" : "Any"],
      ["Hours hoped for", hrs ? hoursText(hrs) + " a week" : ""],
      ["Time together", num(w.socialLevel) ? num(w.socialLevel) + " of 5" : ""],
      ["Help wanted", wanted.map(function (t) { return must[concept(t)] ? t + " (essential)" : t; }).join(", ")],
      ["Best times", list(w.bestTimes).join(", ")],
      ["Study areas hoped for", list(w.disciplines).map(function (d) { var f = fieldOf(d); return f ? VOCAB.disciplines[f] : d; }).join(", ")],
      ["Must speak", w.language || ""],
      ["Interests", list(ab.interests).join(", ")],
      ["Can teach or share", list(ab.canTeach).join(", ")],
      ["Routine", [ab.routine, ab.quietAfter ? "quiet after " + ab.quietAfter : ""].filter(Boolean).join("; ")],
      ["Diet", ab.diet || ""],
      ["Guests", ab.guests || ""],
      ["Falls risk", care.fallsRisk === true ? "Yes" : care.fallsRisk === false ? "No" : ""],
      ["Care notes", care.notes || ""],
      ["Emergency contact", isObj(contact) ? Object.keys(contact).map(function (k) { return contact[k]; }).filter(function (v) { return !blank(v); }).join(", ") : contact || ""],
      ["Contact", [x.phone, x.email].filter(Boolean).join(" · ")],
      ["Notes", meta.notes || ""]
    ].filter(function (f) { return !blank(f[1]); });
  }

  /* ---------- reading host lists ---------- */
  function blankHost() { return clone(HOST_CONTRACT); }
  function slug(s) { return norm(s).replace(/ /g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40); }

  /* Tidies one host record: known fields only, the right types, an id. */
  function normaliseHost(src, problems, where) {
    var h = blankHost(), unknown = [];
    (function walk(from, into, prefix) {
      Object.keys(from || {}).forEach(function (k) {
        if (k === "__proto__" || k === "constructor" || k === "prototype") return;
        var path = prefix ? prefix + "." + k : k;
        if (!Object.prototype.hasOwnProperty.call(into, k)) { unknown.push(path); return; }
        if (isObj(into[k]) && isObj(from[k])) walk(from[k], into[k], path);
        else if (from[k] !== undefined) into[k] = clone(from[k]);
      });
    })(src, h, "");
    if (unknown.length && problems) problems.push(where + ": ignored " + unknown.join(", "));
    if (!isObj(h.wants.hoursPerWeek)) h.wants.hoursPerWeek = range(h.wants.hoursPerWeek) || {min: null, max: null};
    HOST_COLUMNS.forEach(function (c) {
      var v = get(h, c[1]);
      if (c[2] === "num") setPath(h, c[1], num(v));
      else if (c[2] === "bool") setPath(h, c[1], bool(v));
      else if (c[2] === "list") setPath(h, c[1], list(v));
      else if (c[2] === "date") setPath(h, c[1], isoDate(v));
      else if (c[2] === "campuses") setPath(h, c[1], campusEntries(v));
      else if (typeof v === "string") setPath(h, c[1], v.trim() || null);
    });
    var st = norm(h.meta.status);
    h.meta.status = !st ? "active" : HOST_STATUS[st] ? st : /pause|hold|away/.test(st) ? "paused" : /match|placed|full|taken/.test(st) ? "matched" : "active";
    if (!h.meta.hostId) h.meta.hostId = "H-" + (slug([h.host.firstName, h.host.lastName, h.host.suburb].filter(Boolean).join(" ")) || Date.now().toString(36));
    h.meta.hostId = String(h.meta.hostId).replace(/[^A-Za-z0-9_.~:@+-]/g, "-").slice(0, 80);
    return h;
  }

  /* A small CSV/TSV reader: quoted cells, doubled quotes, line breaks in quotes. */
  function readTable(text) {
    var delim = (text.split(/\r?\n/)[0].match(/\t/g) || []).length ? "\t" : (text.split(/\r?\n/)[0].match(/;/g) || []).length > (text.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && !cell) q = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = ""; rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  }
  function columnFor(heading) {
    var k = norm(heading).replace(/[^a-z0-9]/g, "");
    if (!k) return null;
    for (var i = 0; i < HOST_COLUMNS.length; i++) {
      if (norm(HOST_COLUMNS[i][0]).replace(/[^a-z0-9]/g, "") === k || HOST_COLUMNS[i][1].toLowerCase().replace(/[^a-z0-9]/g, "") === k) return HOST_COLUMNS[i][1];
    }
    if (COLUMN_ALIASES[k]) return COLUMN_ALIASES[k];
    if (k === "name" || k === "fullname") return "name";
    return null;
  }

  /* Host profiles from pasted or uploaded text: JSON (one host, a list, or
     {hosts: [...]}) or a spreadsheet saved as CSV, or rows copied straight
     from one (tab-separated), with the heading row first. */
  function parseHosts(text) {
    var t = String(text == null ? "" : text).replace(/^﻿/, "").trim(), problems = [], hosts = [];
    if (!t) return {hosts: hosts, problems: ["There was nothing to read."]};
    if (/^[\[{]/.test(t)) {
      var v;
      try { v = JSON.parse(t); } catch (e) { return {hosts: hosts, problems: ["That isn’t valid JSON (" + e.message + ")."]}; }
      var items = Array.isArray(v) ? v : Array.isArray(v.hosts) ? v.hosts : [v];
      items.forEach(function (x, i) {
        if (isObj(x) && (isObj(x.host) || isObj(x.home) || isObj(x.wants))) hosts.push(normaliseHost(x, problems, "Host " + (i + 1)));
        else if (isObj(x) && (x.student || x.screening)) problems.push("Item " + (i + 1) + " is a student profile, not a host. Add it on the Applicants tab.");
        else problems.push("Item " + (i + 1) + " isn’t a host profile.");
      });
    } else {
      var rows = readTable(t);
      if (rows.length < 2) return {hosts: hosts, problems: ["Include the heading row and at least one host."]};
      var cols = rows[0].map(columnFor), skipped = rows[0].filter(function (c, i) { return c.trim() && !cols[i]; });
      if (!cols.some(Boolean)) return {hosts: hosts, problems: ["The first row doesn’t have any of the host template’s headings."]};
      if (skipped.length) problems.push("Ignored columns: " + skipped.join(", "));
      rows.slice(1).forEach(function (r, i) {
        var h = {};
        cols.forEach(function (path, j) {
          var cell = (r[j] || "").trim();
          if (!path || !cell) return;
          if (path === "name") { var parts = cell.split(/\s+/); setPath(h, "host.firstName", parts[0]); setPath(h, "host.lastName", parts.slice(1).join(" ") || null); }
          else setPath(h, path, cell);
        });
        if (Object.keys(h).length) hosts.push(normaliseHost(h, problems, "Row " + (i + 2)));
      });
    }
    var seen = {};
    hosts.forEach(function (h) {
      var id = h.meta.hostId, n = 2;
      while (seen[h.meta.hostId]) h.meta.hostId = id + "-" + n++;
      seen[h.meta.hostId] = 1;
    });
    return {hosts: hosts, problems: problems};
  }

  /* ---------- writing host lists ---------- */
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function cellFor(h, c) {
    var v = get(h, c[1]);
    if (c[2] === "campuses") return campusEntries(v || []).map(function (x) { return x.name + (x.mins != null ? " (" + x.mins + " min)" : ""); }).join("; ");
    if (c[2] === "list") return list(v).join("; ");
    if (c[2] === "bool") return v === true ? "Yes" : v === false ? "No" : "";
    if (isObj(v)) return Object.keys(v).map(function (k) { return v[k]; }).filter(function (x) { return !blank(x); }).join(", ");
    return v == null ? "" : v;
  }
  function hostsToCsv(hosts) {
    return [HOST_COLUMNS.map(function (c) { return csvCell(c[0]); }).join(",")]
      .concat((hosts || []).map(function (h) { return HOST_COLUMNS.map(function (c) { return csvCell(cellFor(h, c)); }).join(","); }))
      .join("\r\n") + "\r\n";
  }
  var EXAMPLE_HOST = {
    meta: {hostId: "H-0001", status: "active", notes: "Example row: replace with a real host, or delete it."},
    host: {firstName: "Margaret", lastName: "Hollis", preferredName: "Marg", age: 78, gender: "female", suburb: "Marrickville", region: "Inner West",
           languages: ["English"], formerCareer: "Nurse", careerField: "health"},
    home: {availableFrom: "2027-02-01", minStayMonths: 6, maxStayMonths: 12, rentWeekly: 150, rooms: 1, otherStudents: 0,
           nearCampuses: [{name: "UTS City campus", mins: 25}, {name: "University of Sydney, Camperdown", mins: 20}],
           smokeFree: true, hostSmokes: false, pets: [], accessibility: "Brick step out to the granny flat"},
    wants: {studentGender: "any", hoursPerWeek: {min: 8, max: 10},
            helpWanted: ["Company and conversation", "Cooking shared meals", "Tech and phone help", "Gardening", "Bins and light chores"],
            mustHave: ["Company and conversation"], bestTimes: ["Weekday evenings", "Saturdays"], socialLevel: 4,
            disciplines: ["health", "carework"], language: null},
    about: {interests: ["Gardening", "Cooking and baking", "Board games and puzzles", "Music"], canTeach: ["Gardening", "Family recipes", "Local history", "Life advice"],
            routine: "Up at 6, radio at half past four, dinner at six", quietAfter: "21:30", diet: "No restrictions", guests: "Daytime guests with notice"},
    care: {fallsRisk: true, notes: "Uneven brick step at the back", emergencyContact: "David Hollis (son)"}
  };
  function hostCsvTemplate() { return hostsToCsv([EXAMPLE_HOST]); }

  return {
    version: VERSION, HOST_CONTRACT: HOST_CONTRACT, HOST_COLUMNS: HOST_COLUMNS, HOST_STATUS: HOST_STATUS, VOCAB: VOCAB, WEIGHTS: WEIGHTS,
    PART_LABELS: PART_LABELS, EXAMPLE_HOST: EXAMPLE_HOST,
    score: score, matchAll: matchAll, parseHosts: parseHosts, hostsToCsv: hostsToCsv, hostCsvTemplate: hostCsvTemplate,
    blankHost: blankHost, hostName: hostName, hostFullName: hostFullName, hostId: hostId, hostFacts: hostFacts,
    concept: concept, fieldOf: fieldOf
  };
});
