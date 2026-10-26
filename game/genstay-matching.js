/* ============================================================
   GenStay matching (v2): pairs students (GenStay matching
   profiles, contract v1.1) with hosts, the older people offering
   a room (the host format of game/genstay-hosts.sample.json,
   described in genstay/genstay-host-fields.md).

   No page or network access. The staff desks and the quick demo
   load it from beside the game; node can require() it.

     GenStayMatch.score(student, host)       one pairing, judged from both sides
     GenStayMatch.matchAll(students, hosts)  every pairing, both sides' rankings, and the best overall allocation
     GenStayMatch.bestMatch(student, hosts)  one person's best host (the market-day demo's fictional pairing)
     GenStayMatch.parseHosts(text)           host profiles from JSON, or CSV/TSV with a heading row
     GenStayMatch.hostsToCsv(hosts)          the host spreadsheet; hostCsvTemplate() for a blank one
     GenStayMatch.hostFacts(host)            the host's details as [label, text] pairs

   A student is {id, name, profile, suggestedHostId}: profile is the
   applicant's GenStay profile with the staff review laid over it
   (meta.pairingStatus, meta.suggestedFor).

   THE METHOD
   1. Filters. A clash on either side's requirements rules the
      pairing out, with the reason: availability and screening, the
      host's sharer gender, age range and student types, smoking,
      pets, other sharers, hours, nights at home, driving, safety
      with a falls risk, house deal-breakers, stairs; the student's
      homeowner gender, budget, length of stay, commute and dates.
   2. Fit for the host: does the student give what the host needs?
      Help wanted, the host's particular needs against how the
      student actually behaved in the game (a falls risk against how
      they handled Marg's fall, a recent bereavement against how they
      handled Dorothy's death), time together, study area, routine,
      what the host wants to learn, languages.
   3. Fit for the student: does the home suit them? Commute, shared
      interests and what the host can teach, career, time together,
      cost, dates, why they came.
   4. Overall = the geometric mean of the two, out of 100, so a
      pairing only scores well when it suits both people.
   5. Allocation: one student per room, chosen to make the most
      suitable pairings overall (an optimal assignment, the Hungarian
      method), not first come first served. Pairings staff have
      already made are kept.
   Missing information counts as neutral (half), so gaps neither
   help nor sink a pairing, and the reasons say what to check.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GenStayMatch = api;
})(this, function () {
  "use strict";
  var VERSION = "2.0.0";

  /* ---------- hosts ---------- */
  var HOST_STATUS = {active: "Available", screening: "In screening", shortlisted: "Shortlisted", on_hold: "On hold", matched: "Has a sharer"};
  var HOST_UNAVAILABLE = ["on_hold", "matched", "paused", "withdrawn", "placed", "inactive"];

  /* The campuses hosts give commute times to. Students choose one of these
     in the game, so the keys must match placement.campus exactly; older
     free-text answers are recognised by the patterns. */
  var CAMPUSES = [
    ["UTS City Campus", "UTS City Campus (Ultimo)", /\buts\b|technology,? sydney|ultimo|broadway/],
    ["USyd Camperdown", "University of Sydney (Camperdown)", /usyd|university of sydney|sydney uni|camperdown|darlington/],
    ["UNSW Kensington", "UNSW (Kensington)", /unsw|new south wales|kensington/],
    ["Macquarie Uni", "Macquarie University", /macquarie|\bmq\b/],
    ["WSU Parramatta", "Western Sydney University (Parramatta)", /\bwsu\b|western sydney|parramatta/]
  ];
  var DEFAULT_STRETCH_MINS = 60; /* the longest commute when the student gives no limit */

  /* Study areas and careers, for both sides. Hosts' former fields include
     law, design, engineering and business; so do students' areas. */
  /* The study areas the program takes students from. FIELDS also names
     other fields, for hosts' former careers. */
  var PROGRAM_FIELDS = ["health", "carework", "allied_health", "social_work", "psychology", "education"];
  var FIELDS = {
    health: "Health", carework: "Carework", allied_health: "Allied health", social_work: "Social work",
    psychology: "Psychology and counselling", education: "Education", law: "Law", engineering: "Engineering and IT",
    business: "Business", design: "Design, architecture and the arts", science: "Science", other: "Another field"
  };
  var FIELD_WORD = {health: "health", carework: "carework", allied_health: "allied health", social_work: "social work",
    psychology: "psychology", education: "education", law: "law", engineering: "engineering", business: "business",
    design: "design", science: "science", other: "another field"};
  var RELATED = {health: ["allied_health", "carework", "psychology", "science"], allied_health: ["health", "carework"],
    carework: ["health", "allied_health", "social_work"], social_work: ["psychology", "carework", "education"],
    psychology: ["social_work", "health"], education: ["social_work", "psychology"], law: ["business"], business: ["law"],
    engineering: ["design", "science"], design: ["engineering"], science: ["engineering", "health"]};
  var FIELD_WORDS = [
    ["allied_health", /physio|occupational|\bot\b|speech|dietit|nutrition|podiat|exercise physiolog|chiropract|osteopath|audiolog|optometr/],
    ["psychology", /psycholog|counsel|therapist|psychiatr|mental health/],   // after allied health: a physiotherapist isn't a therapist here
    ["social_work", /social work|community services|community work|welfare|case work|youth work|child protection/],
    ["education", /teach|school|principal|lectur|tutor|education|early childhood|kindergarten|librarian|professor|academic/],
    ["carework", /aged care|disabilit|support worker|care worker|\bcarer\b|community care|home care/],
    ["health", /nurs|midwi|doctor|\bgp\b|medic|physician|surgeon|paramedic|ambulance|pharmac|hospital|dentist|dental|radiograph|health/],
    ["law", /\blaw\b|legal|solicitor|barrister|lawyer|judge|justice|policy and government/],
    ["engineering", /engineer|software|\bit\b|computing|computer|electrician|electrical|mechanical|aerospace|pilot|aviation|aeronaut|trade/],
    ["design", /architect|design|fashion|costume|\barts?\b|creative|graphic/],
    ["business", /business|accountant|accounting|finance|marketing|management|commerce|retail|café|cafe|bakery|banker|economics/],
    ["science", /science|scientist|chemist|biolog|physic|lab/]
  ];
  function fieldOf(text) {
    var s = norm(text);
    if (!s) return null;
    if (FIELDS[s.replace(/ /g, "_")]) return s.replace(/ /g, "_");
    for (var k in FIELDS) if (norm(FIELDS[k]) === s) return k;
    for (var i = 0; i < FIELD_WORDS.length; i++) if (FIELD_WORDS[i][1].test(s)) return FIELD_WORDS[i][0];
    return null;
  }
  function fieldMatch(a, b) { return !a || !b ? null : a === b ? 1 : (RELATED[a] || []).indexOf(b) !== -1 ? 0.6 : 0; }

  /* The games' answer options. Matched against hosts' wording by meaning (CONCEPTS). */
  var VOCAB = {
    helpTypes: ["Company and conversation", "Cooking shared meals", "Tech and phone help", "Gardening", "Bins and light chores",
                "Shopping and errands", "Lifts in the homeowner’s car", "Pet care", "Appointments and outings", "Being home in the evenings"],
    notOffered: ["Personal care", "Managing medication", "Overnight care", "Heavy lifting", "Cleaning the whole house"],
    hobbies: ["Gardening", "Cooking and baking", "Reading", "Music", "Sport and fitness", "Walking", "Crafts", "Board games and puzzles", "Films and TV", "Art"],
    wantsToLearn: ["Gardening", "Family recipes", "Local history", "Life advice", "Crafts", "Card games"],
    canOffer: ["Tech and phone help", "Cooking", "Conversation", "Gardening", "Music", "Language practice", "Help with forms and paperwork"],
    bestTimes: ["Weekday mornings", "Weekday afternoons", "Weekday evenings", "Saturdays", "Sundays"],
    campuses: CAMPUSES.map(function (c) { return c[0]; })
  };

  /* What a phrase means, so "shared_meals", "Cooking shared meals" and
     "Family recipes" all count as cooking. First match wins. */
  var CONCEPTS = [
    ["personal_care", /personal care|shower|bathing|dressing|toilet|transfers?\b/],
    ["medication", /medicat|medicine|tablets|pills/],
    ["overnight", /overnight|night care/],
    ["heavy_lifting", /heavy|lifting/],
    ["cleaning", /cleaning the whole|whole house|deep clean/],
    ["evening", /evening presence|home in the evenings|evenings at home|being home/],
    ["appointments", /appointment|accompany|outing/],
    ["diy", /\bfix|repair|electrical|trade skill|car maintenance|\bdiy\b/],
    ["career", /career|mentor|industry contacts|portfolio critique|exam prep/],
    ["study", /essay|writing feedback|tutor|study space|quiet study|homework/],
    ["cooking", /cook|bak|recipe|meal|scone|barbecue|dinner part|produce|cuisine/],
    ["films", /film|\btv\b|television|movie|cinema|drama|reality|theatre|show/],
    ["language", /language|\bfrench\b|\bitalian\b|\bgreek\b|\bswedish\b|vietnamese|cantonese|mandarin|hebrew|english conversation|conversation practice/],
    ["company", /company|companionship|conversation|chat|talk|debate/],
    ["tech", /tech|phone|computer|internet|tablet|ipad|email|online|video call|\bapps?\b|streaming|podcast|instagram|snapchat|social media|3d print|mygov|photo editing|digital/],
    ["garden", /garden|plant|weed|lawn|vegetable/],
    ["errands", /shop|errand|grocer/],
    ["lifts", /\blifts?\b|driv|\bcar\b/],
    ["pets", /\bpets?\b|\bdogs?\b|\bcats?\b|\bbirds?\b/],
    ["chores", /\bbins?\b|chore|tidy|housework|washing up|dishes|clean/],
    ["music", /music|sing|choir|piano|guitar|band|opera|jazz|classical|concert/],
    ["paperwork", /\bforms?\b|paperwork|letters?\b|\bbills?\b|admin/],
    ["reading", /read|book|librar|novel|literature|poetry/],
    ["sport", /sport|fitness|gym|footy|football|soccer|rugby|tennis|swim|cricket|yoga|tai chi|badminton|exercise|sailing|fishing|hiking/],
    ["walking", /walk/],
    ["crafts", /craft|knit|sew|quilt|crochet|woodwork|fashion|styling/],
    ["games", /game|puzzle|\bcards?\b|crossword|chess|rummy|scrabble|bridge|mahjong|backgammon|simulator/],
    ["art", /\bart\b|paint|draw|sketch|galler|photograph|architecture/],
    ["history", /history|heritage/],
    ["advice", /advice|wisdom|life lessons/],
    ["business", /stock market|business|finance|investing/]
  ];
  /* Concepts close enough to count for half. */
  var NEAR = {advice: ["career"], career: ["advice"], walking: ["sport"], sport: ["walking"], art: ["crafts"], crafts: ["art", "diy"], diy: ["crafts"], study: ["career"]};
  /* The host's help codes, in words. */
  var HELP_WORDS = {companionship: "company", shared_meals: "shared meals", tech_help: "tech help", grocery_shopping: "grocery shopping",
    evening_presence: "being home in the evenings", accompany_appointments: "going to appointments", pet_care: "pet care",
    light_housework: "light housework", cooking: "cooking", errands: "errands", gardening: "gardening", driving: "driving", outings: "outings"};

  /* Game evidence. Each landmark choice (screening.landmarks[].tags) says
     how the student handled that moment, from 0 to 1. */
  var TAG_QUALITY = {
    grief_present: 1, grief_invited: 1, grief_practical: 0.8, grief_shared: 0.7, grief_withdrawn: 0.4, grief_dismissed: 0.1,
    boundary_calm: 1, boundary_curious: 1, boundary_sharp: 0.5, boundary_lecture: 0.4, boundary_laughed: 0.3, boundary_avoided: 0.3,
    fall_checked: 1, fall_asked: 0.9, fall_called: 0.9, fall_lifted: 0.2, fall_dismissed: 0.1,
    emergency_called: 1, emergency_delayed: 0.4, emergency_froze: 0.3, emergency_water: 0.2, timeout: 0.3
  };
  var RISK_WORDS = {fall_risk: "a falls risk", recent_bereavement: "a recent bereavement", mild_memory_loss: "mild memory loss",
    remote_nominee: "family overseas or interstate", shared_bathroom: "a shared bathroom", home_cleanup_pending: "the home isn't ready yet",
    pension_income_test: "a pension income test", income_led: "an income-led reason for hosting", nominee_not_payer: "an unresolved payer"};

  var PART_LABELS = {help: "Help", care: "Care needs", company: "Time together", field: "Study area", lifestyle: "Routine",
    reciprocity: "Teaching", language: "Languages", commute: "Commute", interests: "Interests", career: "Career",
    money: "Cost", timing: "Dates", motivation: "Motivation"};
  var HOST_WEIGHTS = {help: 25, care: 20, company: 20, reciprocity: 10, field: 10, lifestyle: 10, language: 5};
  var STUDENT_WEIGHTS = {commute: 25, interests: 20, career: 15, company: 15, money: 10, timing: 10, motivation: 5};
  var BLOCK_LABELS = {status: "not available", hostStatus: "host not available", screening: "screening", questions: "questions unfinished",
    gender: "gender preference", age: "age range", studentType: "student type", smoking: "smoking", pets: "pets", lodgers: "other sharers",
    hours: "hours", nights: "nights at home", driving: "driving", safety: "safety", dealbreaker: "deal-breakers", access: "stairs",
    rent: "cost", stay: "length of stay", commute: "commute", dates: "dates"};
  var AVAILABLE = ["new", "screening", "shortlisted", "intro_booked"];
  var STAFF_PAIRED = ["shortlisted", "intro_booked", "matched"];
  var SERIOUS = {threatening_language: "threatening language", drug_references: "drug references"};
  var TYPE_NAMES = {connector: "The Connector", considerate_companion: "The Considerate Companion",
                    independent_tenant: "The Independent Tenant", transactional_guest: "The Transactional Guest"};
  var GENDER_WORD = {female: "female", male: "male"};

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
    if (Array.isArray(v)) return v.filter(function (x) { return !blank(x); }).map(function (x) { return typeof x === "string" ? x.trim() : x; });
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
    var n = num(String(v).replace(/\+$/, ""));
    return n == null ? null : /\+$/.test(String(v).trim()) ? {min: n, max: null} : {min: n, max: n};
  }
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
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function shortDate(iso) {
    var d = dayNumber(iso);
    if (d == null) return String(iso || "");
    var t = new Date(d * 86400000);
    return t.getUTCDate() + " " + MONTHS[t.getUTCMonth()] + " " + t.getUTCFullYear();
  }
  function minutesOfDay(t) {
    var m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var v = +m[1] * 60 + +m[2];
    return v < 300 ? v + 1440 : v; /* times after midnight count as late, not early */
  }
  function clockText(t) {
    var m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return String(t || "");
    var h = +m[1] % 24, ap = h >= 12 ? "pm" : "am";
    return (h % 12 || 12) + (m[2] === "00" ? "" : ":" + m[2]) + " " + ap;
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function rangeText(r, unit) { return (r.min === r.max || r.max == null ? r.min + (r.max == null ? "+" : "") : r.min + "–" + r.max) + (unit ? " " + unit : ""); }
  function joinAnd(items) { return items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1]; }
  function aOrAn(word) { return /^(two|three|four|several|some|\d)/i.test(word) ? word : /^[aeiou]/i.test(word) ? "an " + word : "a " + word; }
  var PROPER = /^(Italian|French|Greek|Swedish|Vietnamese|Cantonese|Mandarin|Hebrew|English|Arabic|Hindi|Gujarati|Igbo|Yoruba|Spanish|Korean|Auslan|Indian|Chinese|Sydney|Parramatta|Australian|Bollywood|Instagram|Snapchat|MyGov|Qantas|BBC|CSIRO|Buddhist|Sunday|Saturday|Easter)\b/;
  /* lowercases a leading word unless it's a name, or starts a name ("West African cooking") */
  function lowerFirst(s) { s = String(s || ""); return /^[A-Z][a-z]/.test(s) && !PROPER.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function clamp(x) { return Math.max(0, Math.min(1, x)); }
  function avg(pairs) { /* [[value, weight], ...] ignoring null values */
    var w = 0, t = 0;
    pairs.forEach(function (p) { if (p[0] != null) { t += p[0] * p[1]; w += p[1]; } });
    return w ? t / w : null;
  }

  function concept(label) {
    var s = norm(label);
    for (var i = 0; i < CONCEPTS.length; i++) if (CONCEPTS[i][1].test(s)) return CONCEPTS[i][0];
    return "text:" + s;
  }
  /* [{key, label}], one per meaning */
  function concepts(v) {
    var seen = {}, out = [];
    list(v).forEach(function (label) {
      var key = concept(label);
      if (!seen[key]) { seen[key] = 1; out.push({key: key, label: String(label).trim()}); }
    });
    return out;
  }
  function keysOf(items) { var o = {}; items.forEach(function (x) { o[x.key] = x; }); return o; }
  /* items of a that b also has; near meanings count for `half` */
  function overlap(a, b) {
    var k = keysOf(b), full = [], near = [];
    a.forEach(function (x) {
      if (k[x.key]) full.push({mine: x, theirs: k[x.key]});
      else (NEAR[x.key] || []).some(function (n) { if (k[n]) { near.push({mine: x, theirs: k[n]}); return true; } return false; });
    });
    return {full: full, near: near, count: full.length + near.length / 2};
  }
  function words(items, max) {
    var l = items.map(function (x) { return lowerFirst(x.label || x); });
    return max && l.length > max ? l.slice(0, max).join(", ") + " and " + (l.length - max) + " more" : joinAnd(l);
  }

  /* gender: "female", "male", "other" or null */
  function genderCode(v) {
    var s = norm(v).replace(/^(a|an) /, "");
    if (!s || /prefer not|not say|unknown|^n ?a$/.test(s)) return null;
    if (/^(f|female|woman|women|girl|she)\b/.test(s)) return "female";
    if (/^(m|male|man|men|boy|he)\b/.test(s)) return "male";
    return "other";
  }
  function genderPref(v) {
    var s = norm(v).replace(/^(a|an) /, "");
    if (!s || /any|either|no pref|both|don't mind|not fussed/.test(s)) return "any";
    var g = genderCode(s);
    return g === "female" || g === "male" ? g : "any";
  }
  function sameWords(a, b) {
    a = norm(a); b = norm(b);
    return !!a && !!b && (a === b || (a.length > 3 && b.indexOf(a) !== -1) || (b.length > 3 && a.indexOf(b) !== -1));
  }
  function campusKey(text) {
    var s = norm(text);
    if (!s) return null;
    for (var i = 0; i < CAMPUSES.length; i++) if (norm(CAMPUSES[i][0]) === s || CAMPUSES[i][2].test(s)) return CAMPUSES[i][0];
    return null;
  }
  function campusLabel(key) { var c = CAMPUSES.filter(function (x) { return x[0] === key; })[0]; return c ? c[1] : key; }
  /* "weekday evenings", "weekends", "Saturday morning"... -> time slots */
  function slots(v) {
    var out = {};
    list(v).forEach(function (t) {
      var s = norm(t), wd = /weekday/.test(s), we = /weekend/.test(s);
      if (/saturday/.test(s)) out.sat = 1;
      if (/sunday/.test(s)) out.sun = 1;
      if (we) { out.sat = 1; out.sun = 1; }
      if (!/saturday|sunday|weekend/.test(s) || wd) {
        if (/morning/.test(s)) out.wd_m = 1;
        if (/afternoon/.test(s)) out.wd_a = 1;
        if (/evening|night/.test(s)) out.wd_e = 1;
      }
    });
    return out;
  }

  /* ---------- names and pronouns ---------- */
  function hostName(h) {
    var x = (h && h.host) || {}, first = x.preferredName || x.firstName;
    if (x.householdType === "couple" && x.partner && x.partner.firstName) return [first + " and " + x.partner.firstName, x.lastName].filter(Boolean).join(" ");
    return [first, x.lastName].filter(Boolean).join(" ") || hostId(h) || "Unnamed host";
  }
  function hostFirst(h) {
    var x = (h && h.host) || {}, first = x.preferredName || x.firstName || hostName(h);
    return x.householdType === "couple" && x.partner && x.partner.firstName ? first + " and " + x.partner.firstName : first;
  }
  function hostFullName(h) {
    var x = (h && h.host) || {};
    return [x.firstName, x.lastName].filter(Boolean).join(" ") || hostName(h);
  }
  function hostId(h) { return String(get(h, "meta.hostId") || ""); }
  function pronouns(h) {
    var x = h.host || {}, p = norm(x.pronouns);
    if (x.householdType === "couple") return {they: "they", them: "them", their: "their", s: ""};
    if (/^she/.test(p) || (!p && genderCode(x.gender) === "female")) return {they: "she", them: "her", their: "her", s: "s"};
    if (/^he/.test(p) || (!p && genderCode(x.gender) === "male")) return {they: "he", them: "him", their: "his", s: "s"};
    return {they: "they", them: "them", their: "their", s: ""};
  }

  /* ---------- the two sides, normalised once ---------- */
  function hostView(hp) {
    var h = hp || {}, meta = h.meta || {}, x = h.host || {}, home = h.home || {}, pl = h.placement || {}, it = h.interests || {};
    var pr = h.preferences || {}, hh = h.household || {}, sup = h.support || {}, life = h.lifestyle || {}, sc = h.screening || {};
    var status = norm(meta.pairingStatus).replace(/ /g, "_");
    var commute = {};
    Object.keys(pl.campusCommuteMins || {}).forEach(function (k) {
      var key = campusKey(k) || k, m = num(pl.campusCommuteMins[k]);
      if (m != null) commute[key] = m;
    });
    var age = range(pr.sharerAgeRange) || {};
    var v = {
      raw: h, id: hostId(h), name: hostName(h), first: hostFirst(h), fullName: hostFullName(h), p: pronouns(h),
      status: status || "active", available: HOST_UNAVAILABLE.indexOf(status) === -1,
      gender: genderCode(x.gender), partnerGender: x.householdType === "couple" && x.partner ? genderCode(x.partner.gender) : null,
      partnerName: x.partner && x.partner.firstName, age: num(x.age), languages: list(x.languages),
      formerCareer: x.formerCareer || "", field: fieldOf(x.discipline) || fieldOf(x.formerCareer),
      suburb: home.suburb || "", rooms: Math.max(1, num(home.roomsOffered) || 1), bathroom: home.sharerBathroom || "",
      stairs: bool(home.stairs) === true, lift: list(home.accessibilityFeatures).some(function (f) { return /lift|single level|step.?free/i.test(f); }),
      ready: !home.readiness || /^ready$/i.test(home.readiness), readiness: home.readiness || "",
      commute: commute, transport: list(pl.transportNearby),
      availableFrom: isoDate(pl.availableFrom), flexWeeks: num(pl.availableFlexWeeks) || 0, minStay: num(pl.minStayMonths),
      hobbies: concepts(it.hobbies), canOffer: concepts(it.canOffer), wantsToLearn: concepts(it.wantsToLearn),
      canOfferText: list(it.canOffer), settles: list(it.canOffer).some(function (t) { return /settl/i.test(t); }),
      wantsGender: genderPref(pr.sharerGender), ageMin: age.min == null ? null : age.min, ageMax: age.max == null ? null : age.max,
      /* a preference for a study area outside the program can never be met, so it counts as no preference */
      disciplines: list(pr.preferredDisciplines).map(fieldOf).filter(function (f) { return PROGRAM_FIELDS.indexOf(f) !== -1; }), studentTypes: list(pr.studentTypes).map(norm),
      otherLodgers: norm(pr.otherLodgers) || null, languagesWelcome: list(pr.languagesWelcome),
      smoker: bool(hh.smoker), smokeFree: bool(hh.smokeFreeHome), diet: hh.diet || "", dealbreakers: list(hh.dealbreakers),
      pets: list(hh.pets).filter(function (p) { return !/^(none|no|nil|no pets)$/i.test(String(p).trim()); }),
      hours: range(sup.hoursPerWeek), paidHours: num(get(sup, "paidAddOn.hoursPerWeek")),
      help: list(sup.helpWanted).map(function (code) { return {key: concept(code), code: code, label: HELP_WORDS[code] || String(code).replace(/_/g, " ")}; }),
      bestTimes: slots(sup.bestTimes), nights: range(sup.nightsHomePerWeek), needsDriver: bool(sup.needsDriver) === true,
      payment: num(sup.lodgerPaymentWeekly),
      bedtime: minutesOfDay(life.bedtime), quietAfter: minutesOfDay(life.quietAfter), quietText: life.quietAfter || "",
      social: num(life.socialLevel), guests: norm(life.guests), tidiness: norm(life.tidiness),
      motivation: list(sc.motivation).map(norm), risks: {}, watchPoint: sc.watchPoint || "",
      pending: Object.keys(h.checks || {}).filter(function (k) { return !/^(cleared|not required|not_required)$/i.test(String(h.checks[k])); })
        .map(function (k) { return k.replace(/([A-Z])/g, " $1").toLowerCase() + " (" + String(h.checks[k]).replace(/_/g, " ") + ")"; })
    };
    list(sc.riskFlags).forEach(function (f) { v.risks[norm(f).replace(/ /g, "_")] = true; });
    return v;
  }

  function studentView(st) {
    var s = st || {}, p = s.profile || {}, meta = p.meta || {}, stu = p.student || {}, pl = p.placement || {}, it = p.interests || {};
    var hh = p.household || {}, sup = p.support || {}, life = p.lifestyle || {}, sc = p.screening || {};
    var field = stu.discipline && stu.discipline !== "other" ? (FIELDS[stu.discipline] ? stu.discipline : fieldOf(stu.discipline)) : null;
    var goalField = fieldOf(it.careerGoal);
    var tags = {};
    (sc.landmarks || []).forEach(function (l) {
      if (!isObj(l)) return;
      list(l.tags || l.tag).forEach(function (t) { if (TAG_QUALITY[t] != null) tags[l.day] = (tags[l.day] || []).concat([{tag: t, response: l.response}]); });
    });
    var licence = sup.driversLicence;
    var offers = concepts(list(sup.helpTypes).concat(list(it.canOffer)));
    return {
      raw: s, id: String(s.id || meta.profileId || ""), name: s.name || [stu.firstName, stu.lastName].filter(Boolean).join(" ") || "Unnamed applicant",
      first: stu.preferredName || stu.firstName || "",
      status: meta.pairingStatus || "new", suggestedFor: meta.suggestedFor || "", suggestedHostId: s.suggestedHostId || "",
      complete: !!(meta.stages && meta.stages.postGame), hasGame: !blank(sc.profile), type: sc.profile || null,
      meters: sc.meters || {}, flags: sc.flags || [], motivation: sc.motivation || null, quickDemo: (sc.flags || []).indexOf("quick_demo") !== -1,
      evidence: tags,
      gender: genderCode(stu.gender), age: num(stu.age), studentType: norm(stu.studentType) || null, languages: list(stu.languages),
      field: field || goalField, goalField: goalField, discipline: stu.discipline || null, careerGoal: it.careerGoal || "",
      fieldMentor: it.fieldMentor || null,
      wantsGender: genderPref(hh.homeownerGender), otherLodgers: hh.otherLodgers || null,
      smoker: bool(hh.smoker), needsSmokeFree: bool(hh.needsSmokeFree), okWithPets: bool(hh.okWithPets), petAllergy: bool(hh.petAllergy),
      accessibility: hh.accessibilityNeeds || "", dealbreakers: list(hh.dealbreakers),
      rent: num(sup.rentBudgetWeekly), hours: range(sup.hoursPerWeek), nights: range(sup.nightsHomePerWeek),
      licence: blank(licence) ? null : bool(licence) === false || /no licence|learner/i.test(String(licence)) ? false : true,
      offers: offers, notOffered: concepts(sup.notOffered), bestTimes: slots(sup.bestTimes),
      hobbies: concepts(it.hobbies), wantsToLearn: concepts(it.wantsToLearn), canOffer: concepts(it.canOffer),
      social: num(life.socialLevel), bedtime: minutesOfDay(life.bedtime), quietAfter: minutesOfDay(life.quietAfter),
      guests: norm(life.guests), tidiness: norm(life.tidiness),
      campus: pl.campus || "", campusKey: campusKey(pl.campus), maxCommute: num(pl.maxCommuteMins), maxCommuteFlex: num(pl.maxCommuteFlexMins),
      moveIn: isoDate(pl.moveInDate), flexWeeks: num(pl.moveInFlexWeeks) || 0, stay: num(pl.stayMonths)
    };
  }

  /* Is this student already paired with this host by staff? */
  function linkedTo(s, h) {
    if (s.suggestedHostId) return s.suggestedHostId === h.id;
    var n = norm(s.suggestedFor);
    return !!n && (n === norm(h.fullName) || n === norm(h.name));
  }
  /* What keeps a student out of matching with every host (no host can change it). */
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

  /* How the student handled a landmark day, 0–1, or null. */
  function evidence(s, day) {
    var e = s.evidence[day];
    return e && e.length ? TAG_QUALITY[e[0].tag] : null; /* the day's first choice: the instinct, not the recovery */
  }
  function evidenceText(s, day) {
    var e = s.evidence[day];
    return e && e.length ? String(e[0].response || "").split(" · ")[0].replace(/\.$/, "") : "";
  }
  function m10(v) { return v == null ? null : clamp(v / 10); }

  /* ---------- one pairing, judged from both sides ---------- */
  function judge(s, h) {
    var out = {studentId: s.id, hostId: h.id, studentName: s.name, hostName: h.name, eligible: true, score: 0, band: "weak",
               hostFit: 0, studentFit: 0, linked: linkedTo(s, h), blockers: [], strengths: [], cautions: [],
               forStudent: [], talkAbout: [], parts: {host: [], student: []}};
    var P = h.p, me = [];
    var block = function (kind, text, you) { out.blockers.push({kind: kind, text: text, you: you || text}); };
    var good = function (text) { out.strengths.push(text); };
    var warn = function (text) { out.cautions.push(text); };
    var tell = function (rank, text) { me.push([rank, text]); };
    var part = function (side, key, value, note) {
      var w = (side === "host" ? HOST_WEIGHTS : STUDENT_WEIGHTS)[key], v = clamp(value == null ? 0.5 : value);
      out.parts[side].push({key: key, label: PART_LABELS[key], weight: w, value: v, points: Math.round(v * w * 10) / 10, note: note || (value == null ? "not enough to compare" : "")});
    };
    var hostWord = h.first;

    /* 1. filters: availability and screening */
    studentBlockers(s, out.linked).forEach(function (b) { out.blockers.push({kind: b.kind, text: b.text, you: b.text}); });
    if (!h.available && !out.linked) block("hostStatus", hostWord + " is " + (HOST_STATUS[h.status] || h.status.replace(/_/g, " ")).toLowerCase());

    /* the host's requirements */
    if (h.wantsGender !== "any" && s.gender !== h.wantsGender)
      block("gender", hostWord + " asked for a " + GENDER_WORD[h.wantsGender] + " sharer" + (s.gender ? "" : ", and the applicant’s gender isn’t stated"),
        hostWord + " asked for a " + GENDER_WORD[h.wantsGender] + " sharer");
    var ageText = h.ageMin != null ? (h.ageMax != null ? h.ageMin + " to " + h.ageMax : h.ageMin + " or over") : "up to " + h.ageMax;
    if (s.age != null && ((h.ageMin != null && s.age < h.ageMin) || (h.ageMax != null && s.age > h.ageMax)))
      block("age", hostWord + " is looking for a sharer aged " + ageText + "; the applicant is " + s.age, hostWord + " is looking for someone aged " + ageText);
    else if (s.age == null && h.ageMin != null && h.ageMin > 18) warn("Check the applicant’s age: " + hostWord + " is looking for " + ageText);
    if (h.studentTypes.length && s.studentType && h.studentTypes.indexOf(s.studentType) === -1)
      block("studentType", hostWord + " is looking for " + joinAnd(h.studentTypes) + " students");
    if (s.smoker === true && (h.smokeFree === true || h.dealbreakers.some(function (d) { return /^smok/i.test(d); })))
      block("smoking", "Smokes or vapes, and " + hostWord + "’s home is smoke-free", hostWord + "’s home is smoke-free");
    if (h.pets.length) {
      var petText = joinAnd(h.pets.map(function (x) { return lowerFirst(x); }));
      if (s.petAllergy === true) block("pets", "Has a pet allergy, and " + hostWord + " has " + aOrAn(petText), hostWord + " has " + aOrAn(petText));
      else if (s.okWithPets === false) block("pets", "Would rather not live with pets, and " + hostWord + " has " + aOrAn(petText), hostWord + " has " + aOrAn(petText));
    }
    if (h.rooms >= 2 && h.otherLodgers === "prefer" && s.otherLodgers === "none")
      block("lodgers", hostWord + " is looking for two sharers, and the applicant wants to be the only student", hostWord + " is looking for two sharers");
    else if (h.rooms >= 2 && s.otherLodgers === "none") warn(hostWord + " has " + h.rooms + " rooms, so the applicant may share the home with another student");
    if (s.otherLodgers === "prefer" && h.rooms < 2) warn("Would like another student there; " + hostWord + " has one room");
    if (s.hours && h.hours && s.hours.max < h.hours.min)
      block("hours", "Offers " + rangeText(s.hours, "hours") + " a week; " + hostWord + " hopes for " + rangeText(h.hours, "hours"), hostWord + " hopes for " + rangeText(h.hours, "hours") + " a week");
    var eveningOffered = !!keysOf(s.offers).evening;
    if (s.nights && h.nights && s.nights.max < h.nights.min)
      block("nights", "Home " + rangeText(s.nights) + " nights a week; " + hostWord + " needs " + rangeText(h.nights), hostWord + " needs someone home " + rangeText(h.nights) + " nights a week");
    else if (!s.nights && h.nights && h.nights.min >= 5 && !eveningOffered) warn(hostWord + " needs someone home " + rangeText(h.nights) + " nights a week: check");
    if (h.needsDriver) {
      if (s.licence === false) block("driving", hostWord + " needs a driver, and the applicant has no full licence", hostWord + " needs someone who can drive");
      else if (s.licence !== true && !keysOf(s.offers).lifts) block("driving", hostWord + " needs a driver, and the applicant didn’t offer lifts", hostWord + " needs someone who can drive");
      else warn("Confirm a full licence and insurance on " + hostWord + "’s car before the intro");
    }
    var aware = s.meters.awareness;
    if (h.risks.fall_risk && (s.flags.indexOf("low_safety_awareness") !== -1 || (aware != null && aware <= 3)))
      block("safety", "Low safety awareness in screening, and " + hostWord + " has a falls risk", hostWord + " needs someone very safety-aware");
    if (/wheelchair|mobility|walking frame|crutches|can'?t (do|climb) stairs|cannot climb|no stairs/i.test(s.accessibility) && h.stairs && !h.lift)
      block("access", "Accessibility need (" + s.accessibility + "), and " + hostWord + "’s home has stairs");

    /* the host's deal-breakers: the ones the student's answers can test; the rest are to talk through */
    var discuss = [];
    h.dealbreakers.forEach(function (d) {
      var t = norm(d);
      if (/smok/.test(t) || /\bdogs?\b|\bcats?\b|\bpets?\b/.test(t)) { /* covered by the smoking and pet filters */ }
      else if (/keeps? to (their|his|her) room|keep to themsel/.test(t)) {
        if (s.social != null && s.social <= 1) block("dealbreaker", hostWord + " doesn’t want a sharer who keeps to their room, and the applicant prefers to be mostly independent", hostWord + " is looking for someone sociable");
        else if (s.social === 2) warn(hostWord + " doesn’t want a sharer who keeps to their room; the applicant leans independent");
      } else if (/guests/.test(t)) {
        if (/most weeks|often/.test(s.guests)) block("dealbreaker", hostWord + "’s deal-breaker: " + lowerFirst(d) + "; the applicant has guests " + s.guests, hostWord + "’s deal-breaker: " + lowerFirst(d));
        else discuss.push(d);
      } else if (/noise after|loud music|after midnight/.test(t)) {
        var tm = String(d).match(/(\d{1,2}):(\d{2})/), limit = /after midnight/.test(t) ? 1440 : tm ? minutesOfDay(tm[1] + ":" + tm[2]) : null;
        if (limit && s.bedtime != null && s.bedtime > limit + 60) warn(hostWord + "’s deal-breaker: " + lowerFirst(d) + "; the applicant’s bedtime is later");
        else discuss.push(d);
      } else discuss.push(d);
    });
    if (discuss.length) { warn("Talk through " + hostWord + "’s deal-breakers: " + discuss.map(lowerFirst).join("; ")); out.talkAbout.push(hostWord + " draw" + P.s + " the line at " + joinAnd(discuss.map(lowerFirst))); }
    if (/kosher|halal|no pork|vegetarian|vegan/i.test(h.diet)) {
      warn("Kitchen: " + h.diet);
      /* the participant needn't read the same food rule twice */
      if (!discuss.some(function (d) { return /pork|shellfish|meat/i.test(d); })) out.talkAbout.push("food at home: " + lowerFirst(h.diet).replace(/;/g, ","));
    }
    if (h.pets.length && s.okWithPets === true) out.talkAbout.push(hostWord + " has " + aOrAn(joinAnd(h.pets.map(lowerFirst))));

    /* the student's requirements */
    /* a couple fits only if both partners do: the preference is often about feeling safe at home */
    if (s.wantsGender !== "any" && ((h.gender && h.gender !== s.wantsGender) || (h.partnerGender && h.partnerGender !== s.wantsGender))) {
      var couple = h.partnerGender ? ", and " + h.first + " are a couple" : "";
      block("gender", "Asked for a " + GENDER_WORD[s.wantsGender] + " homeowner" + couple, "you asked for a " + GENDER_WORD[s.wantsGender] + " homeowner" + couple);
    }
    if (s.needsSmokeFree === true && (h.smoker === true || h.smokeFree === false))
      block("smoking", "Needs a smoke-free home, and " + hostWord + " smokes", "you need a smoke-free home");
    if (s.rent != null && h.payment != null && s.rent < h.payment)
      block("rent", hostWord + " asks $" + h.payment + " a week, over the $" + s.rent + " budget", hostWord + " asks $" + h.payment + " a week, over your budget");
    if (s.stay && h.minStay && s.stay < h.minStay)
      block("stay", "Wants " + s.stay + " months; " + hostWord + " asks for at least " + h.minStay, hostWord + " asks for at least " + h.minStay + " months");
    s.dealbreakers.forEach(function (d) {
      var t = norm(d);
      if (/pet|dog|cat/.test(t) && h.pets.length) block("pets", "The applicant’s deal-breaker: " + d, "your deal-breaker: " + d);
      else if (/smok/.test(t) && (h.smoker || h.smokeFree === false)) block("smoking", "The applicant’s deal-breaker: " + d, "your deal-breaker: " + d);
      else if (/stairs/.test(t) && h.stairs && !h.lift) block("access", "The applicant’s deal-breaker: " + d, "your deal-breaker: " + d);
      else if (/bathroom/.test(t) && !/private/i.test(h.bathroom)) block("access", "The applicant’s deal-breaker: " + d + " (" + hostWord + "’s bathroom is " + h.bathroom + ")", "your deal-breaker: " + d);
    });

    /* commute */
    var mins = s.campusKey ? h.commute[s.campusKey] : null, stretch = s.maxCommuteFlex || DEFAULT_STRETCH_MINS, commute = null;
    var by = h.transport.length ? " by " + joinAnd(h.transport.slice(0, 2)) : "";
    if (mins != null) {
      commute = clamp(1 - (mins - 15) / 50);
      if (s.maxCommute && mins <= s.maxCommute) commute = Math.max(commute, 0.75);
      if (mins > stretch) block("commute", "About " + mins + " minutes to " + s.campusKey + ", past " + (s.maxCommuteFlex ? "the applicant’s limit of " + stretch : "an hour"),
        "it’s about " + mins + " minutes to your campus");
      else if (s.maxCommute && mins > s.maxCommute) warn("About " + mins + " minutes to " + s.campusKey + ", more than the applicant’s preferred " + s.maxCommute);
      else if (mins <= 25) { good("About " + mins + " minutes to " + s.campusKey + by); tell(6, mins + " minutes to " + s.campusKey + by); }
      else good("About " + mins + " minutes to " + s.campusKey);
    } else if (s.campus) warn("Check the commute from " + (h.suburb || "this home") + " to " + s.campus);
    part("student", "commute", commute, mins != null ? mins + " min" : s.campus ? "no time for this campus" : "no campus given");

    /* dates */
    var a = dayNumber(s.moveIn), b = dayNumber(h.availableFrom), timing = null;
    if (a != null && b != null) {
      var gap = (b - a) / 7, over = Math.max(0, Math.abs(gap) - s.flexWeeks - h.flexWeeks), weeks = plural(Math.round(Math.abs(gap)), "week", "weeks");
      timing = clamp(1 - over / 8);
      if (over > 8) block("dates", gap > 0 ? "The room is free from " + shortDate(h.availableFrom) + ", " + weeks + " after the applicant’s move-in date"
        : "The applicant moves in " + shortDate(s.moveIn) + ", " + weeks + " after the room is free", "the room is free from " + shortDate(h.availableFrom));
      else if (over > 2) warn(gap > 0 ? "The room is free from " + shortDate(h.availableFrom) + ", " + weeks + " after the applicant’s move-in date"
        : "The applicant moves in " + weeks + " after the room is free");
    }
    part("student", "timing", timing, a != null && b != null ? (over <= 0 ? "dates line up" : Math.round(over) + " weeks beyond both flexibilities") : "dates unknown");

    /* 2. fit for the host */
    // help wanted
    var offerKeys = keysOf(s.offers), covered = [], missing = [];
    h.help.forEach(function (x) {
      var ok = offerKeys[x.key] || (x.key === "evening" && s.nights && h.nights && s.nights.min >= h.nights.min) || (x.key === "lifts" && s.licence === true);
      (ok ? covered : missing).push(x);
    });
    var help = h.help.length && s.offers.length ? covered.length / h.help.length : null;
    var notOffered = keysOf(s.notOffered), refused = h.help.filter(function (x) { return notOffered[x.key]; });
    var bt = Object.keys(h.bestTimes), stimes = Object.keys(s.bestTimes);
    if (help != null && bt.length && stimes.length) {
      var shared = bt.filter(function (k) { return s.bestTimes[k]; });
      help = 0.8 * help + 0.2 * (shared.length ? 1 : 0);
      if (!shared.length) warn("No overlap in the best times to help");
    }
    if (covered.length) { good("Can help with " + words(covered, 4)); if (covered.length >= 2) tell(5, hostWord + " would love help with " + words(covered.slice(0, 2)) + ", which you offered"); }
    if (missing.length && help != null) warn("Didn’t offer " + words(missing, 3));
    if (refused.length) warn("Not comfortable with " + words(refused) + ", which " + hostWord + " would like");
    if (h.paidHours && s.hours && h.hours && s.hours.max >= h.hours.max + 4) good("Offers enough hours to take on " + hostWord + "’s " + h.paidHours + " paid extra hours a week");
    part("host", "help", help, help == null ? null : covered.length + " of " + h.help.length + " wanted");

    // care needs, against how the student behaved in the game
    var m = s.meters, general = null, typeFit = {connector: 1, considerate_companion: 0.85, transactional_guest: 0.1}[s.type];
    if (s.type === "independent_tenant") typeFit = h.social != null && h.social <= 2 ? 0.85 : 0.6;
    if (typeFit != null) general = 0.6 * typeFit + 0.4 * (((m.respect == null ? 5 : m.respect) + (m.reliability == null ? 5 : m.reliability)) / 20);
    var needs = [], needWords = [];
    if (h.risks.fall_risk) {
      var fall = avg([[m10(aware), 0.5], [evidence(s, 11), 0.3], [evidence(s, 14), 0.2]]);
      if (fall != null) needs.push(fall + (s.flags.indexOf("noticed_step") !== -1 ? 0.05 : 0));
      needWords.push("falls risk");
      if (evidence(s, 11) >= 0.9) good("Handled Marg’s fall well in screening (“" + evidenceText(s, 11) + "”), which matters with " + hostWord + "’s falls risk");
      else if (evidence(s, 11) != null && evidence(s, 11) <= 0.2) warn("Handled Marg’s fall poorly (“" + evidenceText(s, 11) + "”), and " + hostWord + " has a falls risk");
      else if (aware != null && aware >= 7) good("Strong safety awareness (" + aware + "/10), which matters with " + hostWord + "’s falls risk");
    }
    if (h.risks.recent_bereavement) {
      var grief = avg([[evidence(s, 6), 0.6], [m10(m.connection), 0.4]]);
      if (grief != null) needs.push(grief);
      needWords.push("recent bereavement");
      if (evidence(s, 6) >= 1) good("Met Marg’s grief with care in screening (“" + evidenceText(s, 6) + "”), which matters after " + hostWord + "’s recent loss");
      else if (evidence(s, 6) != null && evidence(s, 6) <= 0.4) warn("Struggled with Marg’s grief in screening (“" + evidenceText(s, 6) + "”), and " + hostWord + " is recently bereaved");
    }
    if (h.risks.mild_memory_loss) {
      var patience = avg([[m10(m.respect), 0.4], [m10(m.reliability), 0.4], [evidence(s, 9), 0.2]]);
      if (patience != null) needs.push(patience);
      needWords.push("mild memory loss");
      if (m.reliability != null && m.reliability <= 4) warn("Reliability is low (" + m.reliability + "/10), and " + hostWord + " needs a steady routine");
      else if (m.respect >= 7 && m.reliability >= 7) good("Respectful and reliable in screening, which suits " + hostWord + "’s need for a steady routine");
    }
    if (h.risks.remote_nominee && m.reliability != null) { needs.push(m10(m.reliability)); needWords.push("family far away"); }
    var care = needs.length ? (general == null ? avg(needs.map(function (x) { return [x, 1]; })) : 0.65 * avg(needs.map(function (x) { return [x, 1]; })) + 0.35 * general) : general;
    if (s.type === "connector" || s.type === "considerate_companion") good("Screening: " + TYPE_NAMES[s.type]);
    else if (s.type === "independent_tenant" && h.social != null && h.social <= 2) good("An independent style suits " + hostWord + "’s quieter home");
    else if (s.type === "independent_tenant") warn("Screening: The Independent Tenant, and " + hostWord + " hopes for company");
    if (s.flags.indexOf("welfare_concern") !== -1) warn("Possible welfare concern in screening: read the watch-point first");
    if (s.flags.indexOf("low_safety_awareness") !== -1 && !h.risks.fall_risk) warn("Low safety awareness in screening");
    if (s.flags.indexOf("answers_to_check") !== -1) warn("Some answers need checking (see the watch-point)");
    if (s.quickDemo) warn("Screened with the quick demo only");
    part("host", "care", care, needWords.length ? "against " + joinAnd(needWords) : s.type ? TYPE_NAMES[s.type] || s.type : "no game result");

    // time together (both sides)
    var company = null;
    if (h.social != null && s.social != null) {
      var close = 1 - Math.abs(h.social - s.social) / 4;
      company = close;
      if (h.social >= 4 && m.connection != null) company = 0.7 * close + 0.3 * m10(m.connection);
      if (close >= 0.75) {
        good("Similar hopes for time together (" + hostWord + " " + h.social + "/5, applicant " + s.social + "/5)");
        tell(4, h.social >= 4 ? "You’d both like plenty of time together" : h.social <= 2 ? "You both value your own space" : "You both like a mix of company and quiet");
      } else if (close <= 0.25) warn("Different hopes for time together (" + hostWord + " " + h.social + "/5, applicant " + s.social + "/5)");
    } else if (h.social != null && h.social >= 4 && m.connection != null) company = m10(m.connection);
    part("host", "company", company, h.social != null ? hostWord + " " + h.social + "/5" + (s.social != null ? ", applicant " + s.social + "/5" : "") : null);
    part("student", "company", company, h.social != null && s.social != null ? "both answered" : null);

    // what the host wants to learn, and what the student offers
    var teach = overlap(h.wantsToLearn, s.hobbies.concat(s.offers));   /* an offer outranks a hobby with the same meaning */
    var reciprocity = h.wantsToLearn.length ? clamp(0.3 + 0.7 * teach.count) : null;
    if (teach.full.length) {
      var t0 = teach.full[0], offered = !!offerKeys[t0.theirs.key], what = lowerFirst(t0.theirs.label);
      good(hostWord + " would like a hand with " + lowerFirst(t0.mine.label) + "; the applicant " + (offered ? "offers " : "enjoys ") + what);
      tell(7, hostWord + " would like a hand with " + lowerFirst(t0.mine.label) + (offered ? ", and you offered " : ", and you’re into ") + what);
    }
    part("host", "reciprocity", reciprocity, h.wantsToLearn.length ? teach.full.length + " of " + h.wantsToLearn.length + " things " + P.they + " want" + P.s + " to learn" : null);

    // study area the host hoped for
    var field = null;
    if (h.disciplines.length && s.field) {
      var best = Math.max.apply(null, h.disciplines.map(function (d) { return fieldMatch(d, s.field) || 0; }));
      field = best === 1 ? 1 : best > 0 ? 0.6 : 0.25;
      if (best === 1) good(hostWord + " hoped for " + aOrAn(FIELD_WORD[s.field]) + " student");
      else if (!best) warn(hostWord + " hoped for " + joinAnd(h.disciplines.map(function (d) { return FIELD_WORD[d]; })) + " students");
    } else if (!h.disciplines.length) field = 0.6;
    part("host", "field", field, h.disciplines.length ? "hoped for " + joinAnd(h.disciplines.map(function (d) { return FIELD_WORD[d]; })) : "no preference");

    // routine: bedtimes and quiet hours, guests, tidiness
    var routine = [];
    if (h.quietAfter != null && s.bedtime != null) {
      var late = s.bedtime - h.quietAfter;
      routine.push([late <= 60 ? 1 : late <= 120 ? 0.6 : 0.2, 2]);
      if (late > 120) warn(hostWord + " likes quiet after " + clockText(h.quietText) + "; the applicant goes to bed much later");
    }
    if (h.bedtime != null && s.bedtime != null && h.bedtime >= 1440 && s.bedtime >= 1380) { routine.push([1, 1]); good("Night owls both: " + hostWord + " is up past midnight too"); }
    var hostGuests = /^no$|never|rarely/.test(h.guests) ? 0 : /ask|notice|daytime/.test(h.guests) ? 1 : h.guests ? 2 : null;
    var stuGuests = /rarely/.test(s.guests) ? 0 : /occasionally/.test(s.guests) ? 1 : /most weeks|often/.test(s.guests) ? 2 : null;
    if (hostGuests != null && stuGuests != null) routine.push([stuGuests <= hostGuests ? 1 : stuGuests - hostGuests === 1 ? 0.5 : 0.1, 1]);
    var tidy = function (t) { return /very tidy/.test(t) ? 3 : /tidy/.test(t) ? 2 : /relaxed/.test(t) ? 1 : /working on it/.test(t) ? 0 : null; };
    var ht = tidy(h.tidiness), st = tidy(s.tidiness);
    if (ht != null && st != null) routine.push([st >= ht - 1 ? 1 : 0.4, 1]);
    part("host", "lifestyle", avg(routine), routine.length ? "" : "not enough to compare");

    // languages
    var lang = null;
    if (h.languagesWelcome.length) {
      var spoken = h.languagesWelcome.filter(function (l) { return s.languages.some(function (x) { return sameWords(x, l); }); });
      lang = spoken.length ? 1 : 0.5;
      if (spoken.length) { good("Speaks " + joinAnd(spoken) + ", which " + hostWord + " welcomes"); tell(6, hostWord + " speaks " + spoken[0] + " too"); }
    }
    part("host", "language", lang, h.languagesWelcome.length ? "welcomes " + joinAnd(h.languagesWelcome) : null);

    /* 3. fit for the student */
    // interests: shared hobbies, and what the host can teach them
    var both = overlap(s.hobbies, h.hobbies.concat(h.canOffer)), learn = overlap(s.wantsToLearn, h.hobbies.concat(h.canOffer));  /* something the host offers outranks a hobby */
    var interests = (h.hobbies.length + h.canOffer.length) && (s.hobbies.length + s.wantsToLearn.length)
      ? clamp((both.count + 1.5 * learn.count) / 3) : null;
    if (both.full.length) { good("Shared interests: " + words(both.full.map(function (x) { return x.mine; }), 3)); tell(6, "You both enjoy " + words(both.full.map(function (x) { return x.mine; }), 2)); }
    if (learn.full.length) {
      var l0 = learn.full[0], lt = lowerFirst(l0.theirs.label.replace(/ (lessons|knowledge)$/i, "")), want = lowerFirst(l0.mine.label);
      if (keysOf(h.canOffer)[l0.theirs.key]) { good("Wants to learn " + want + "; " + hostWord + " can teach " + lt); tell(8, hostWord + " could teach you " + lt); }
      else { good("Wants to learn " + want + "; " + hostWord + " enjoys " + lt); tell(7, "You’d like to learn " + want + ", and " + hostWord + " loves " + lt); }
    }
    if (h.settles && s.studentType === "international") { good(hostWord + " offers help settling into Sydney"); tell(7, hostWord + " would help you settle into Sydney"); }
    part("student", "interests", interests, interests == null ? null : both.full.length + " shared, " + learn.full.length + " to learn");

    // career
    var career = null, fm = s.fieldMentor;
    var cm = Math.max(fieldMatch(h.field, s.field) || 0, fieldMatch(h.field, s.goalField) || 0);
    if (h.field && (s.field || s.goalField)) {
      if (fm === "no") career = 0.6;
      else career = cm === 1 ? (fm === "keen" ? 1 : 0.85) : cm > 0 ? 0.6 : 0.25;
      var mentors = h.canOffer.some(function (x) { return x.key === "career"; });
      if (cm && mentors && fm !== "no") career = Math.min(1, career + 0.1);
      if (cm === 1) {
        var was = /^(owned|ran|worked|taught|managed|built|founded)\b/i.test(h.formerCareer) ? lowerFirst(h.formerCareer.split(",")[0])
          : "was " + aOrAn(lowerFirst(h.formerCareer.split(",")[0]) || FIELD_WORD[h.field]);
        var goal = s.careerGoal && !/not sure|something else/i.test(s.careerGoal) ? lowerFirst(s.careerGoal) : FIELD_WORD[s.field || s.goalField];
        good(hostWord + " " + was + ", and the applicant is heading for " + goal + (fm === "keen" ? " and would love a homeowner from their field" : ""));
        tell(fm === "keen" ? 9 : 7, hostWord + " " + was + ", and you’re heading for " + goal);
      }
    }
    part("student", "career", career, h.field ? FIELD_WORD[h.field] + (s.field ? " and " + FIELD_WORD[s.field] : "") : null);

    // cost
    var money = null;
    if (s.rent != null && h.payment != null && s.rent > 0) {
      money = clamp(0.5 + 0.5 * (1 - h.payment / s.rent));
      if (h.payment <= s.rent) tell(3, "$" + h.payment + " a week, within your budget");
    }
    part("student", "money", money, h.payment != null ? "$" + h.payment + " a week" + (s.rent != null ? " of $" + s.rent : "") : null);

    // why they came
    var motive = null, mv = s.motivation;
    if (mv) {
      motive = mv === "company" ? (h.social >= 4 ? 1 : h.social != null && h.social <= 2 ? 0.3 : 0.6)
        : mv === "quiet_space" ? (h.social != null && h.social <= 3 ? 1 : 0.5) + (h.canOfferText.some(function (t) { return /study space/i.test(t); }) ? 0.2 : 0)
        : mv === "saving_money" ? (h.payment != null ? clamp(1 - (h.payment - 60) / 120) : 0.5)
        : mv === "learning" ? (h.canOffer.length ? 1 : 0.5) : 0.5;
      if (mv === "company" && h.social >= 4) good("Came for company, and " + hostWord + " wants plenty of it");
    }
    part("student", "motivation", motive, mv ? mv.replace(/_/g, " ") : null);

    /* readiness and staff notes */
    if (!h.ready) warn(hostWord + "’s home isn’t ready yet (" + h.readiness.replace(/_/g, " ") + ")");
    if (h.pending.length) warn(hostWord + "’s checks still to clear: " + h.pending.join(", "));
    Object.keys(h.risks).forEach(function (r) { if (/pension|income|payer/.test(r)) warn(hostWord + ": " + (RISK_WORDS[r] || r.replace(/_/g, " ")) + " (see the watch-point)"); });
    if (h.risks.shared_bathroom || /shared with host/i.test(h.bathroom)) out.talkAbout.push("you’d share a bathroom with " + h.p.them);
    if (s.status === "shortlisted" && s.suggestedFor && !out.linked) warn("Already shortlisted for " + s.suggestedFor);

    /* overall: the geometric mean of the two sides */
    var side = function (parts) { var w = 0, t = 0; parts.forEach(function (p) { t += p.value * p.weight; w += p.weight; }); return w ? t / w : 0; };
    out.hostFit = Math.round(side(out.parts.host) * 100);
    out.studentFit = Math.round(side(out.parts.student) * 100);
    out.score = Math.round(Math.sqrt(side(out.parts.host) * side(out.parts.student)) * 100);
    out.eligible = !out.blockers.length;
    out.band = out.score >= 80 ? "strong" : out.score >= 65 ? "good" : out.score >= 50 ? "possible" : "weak";
    out.forStudent = me.sort(function (x, y) { return y[0] - x[0]; }).map(function (x) { return x[1]; })
      .filter(function (t, i, all) { return all.indexOf(t) === i; }).slice(0, 4);
    out.talkAbout = out.talkAbout.slice(0, 2);
    return out;
  }

  function score(student, host) { return judge(studentView(student), hostView(host)); }
  function hostStatus(host) { var v = hostView(host); return {code: v.status, label: HOST_STATUS[v.status] || v.status.replace(/_/g, " "), available: v.available}; }
  function byScore(a, b) { return b.score - a.score || a.cautions.length - b.cautions.length || String(a.hostId).localeCompare(String(b.hostId)); }
  function nearestFirst(a, b) { return a.blockers.length - b.blockers.length || b.score - a.score; }

  /* ---------- the best allocation: the Hungarian method ----------
     Minimum-cost assignment of every row to a different column (rows ≤
     columns), in O(rows² × columns). */
  function assign(cost) {
    var n = cost.length, mcols = n ? cost[0].length : 0, INF = 1e15;
    var u = new Array(n + 1).fill(0), v = new Array(mcols + 1).fill(0), p = new Array(mcols + 1).fill(0), way = new Array(mcols + 1).fill(0);
    for (var i = 1; i <= n; i++) {
      p[0] = i;
      var j0 = 0, minv = new Array(mcols + 1).fill(INF), used = new Array(mcols + 1).fill(false);
      do {
        used[j0] = true;
        var i0 = p[j0], delta = INF, j1 = 0;
        for (var j = 1; j <= mcols; j++) if (!used[j]) {
          var cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (j = 0; j <= mcols; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        j0 = j1;
      } while (p[j0] !== 0);
      do { var jn = way[j0]; p[j0] = p[jn]; j0 = jn; } while (j0);
    }
    var rowTo = new Array(n).fill(-1);
    for (var c = 1; c <= mcols; c++) if (p[c]) rowTo[p[c] - 1] = c - 1;
    return rowTo;
  }
  /* Pairs students with rooms to make as many suitable pairings as possible
     and, among those, the highest total score. */
  function bestAllocation(results, students, slots) {
    if (!students.length || !slots.length) return [];
    var BIG = 1e6, byPair = {};
    results.forEach(function (r) { byPair[r.studentId + "\u0000" + r.hostId] = r; });
    var studentsAreRows = students.length <= slots.length;
    var rows = studentsAreRows ? students : slots, cols = studentsAreRows ? slots : students;
    var cost = rows.map(function (rw) {
      return cols.map(function (cl) {
        var r = byPair[(studentsAreRows ? rw : cl) + "\u0000" + (studentsAreRows ? cl : rw)];
        return r && r.eligible ? 100 - r.score : BIG;
      });
    });
    return assign(cost).map(function (c, i) {
      if (c < 0) return null;
      var sid = studentsAreRows ? rows[i] : cols[c], hid = studentsAreRows ? cols[c] : rows[i], r = byPair[sid + "\u0000" + hid];
      return r && r.eligible ? r : null;
    }).filter(Boolean);
  }

  /* Every pairing ranked both ways, and the best allocation: staff's own
     pairings first, then one student per remaining room. */
  function matchAll(students, hosts) {
    var ss = (students || []).map(studentView), hs = (hosts || []).map(hostView);
    var res = {version: VERSION, method: "optimal", hosts: {}, students: {}, pairings: [], alsoPaired: [], unmatchedHosts: [], unmatchedStudents: []};
    hs.forEach(function (h) { res.hosts[h.id] = {id: h.id, name: h.name, status: h.status, available: h.available, rooms: h.rooms, ranked: [], ruledOut: [], why: {}}; });
    ss.forEach(function (s) { res.students[s.id] = {id: s.id, name: s.name, ranked: [], ruledOut: [], excluded: studentBlockers(s, false).map(function (b) { return b.text; })}; });
    var all = [];
    hs.forEach(function (h) {
      ss.forEach(function (s) {
        var r = judge(s, h);
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
    Object.keys(res.students).forEach(function (id) { res.students[id].ranked.sort(byScore); res.students[id].ruledOut.sort(nearestFirst); });

    var statusOf = {}, rooms = {}, placed = {}, staffLinked = {};
    ss.forEach(function (s) { statusOf[s.id] = s.status; });
    hs.forEach(function (h) { rooms[h.id] = h.available || ss.some(function (s) { return linkedTo(s, h); }) ? h.rooms : 0; });
    var rankOf = function (list, r) { return list.indexOf(r) + 1; };
    var record = function (r, locked) {
      rooms[r.hostId]--; placed[r.studentId] = true;
      res.pairings.push({hostId: r.hostId, studentId: r.studentId, hostName: r.hostName, studentName: r.studentName, score: r.score, band: r.band,
        hostFit: r.hostFit, studentFit: r.studentFit, eligible: r.eligible, locked: locked,
        studentRank: rankOf(res.students[r.studentId].ranked, r), hostRank: rankOf(res.hosts[r.hostId].ranked, r),
        strengths: r.strengths.slice(0, 3), cautions: r.cautions.slice(0, 3), blockers: r.blockers});
    };
    /* staff's own pairings; extra shortlisted applicants for a full host are listed */
    all.filter(function (r) { return r.linked && STAFF_PAIRED.indexOf(statusOf[r.studentId]) !== -1; }).sort(byScore).forEach(function (r) {
      staffLinked[r.studentId] = true;
      if (!placed[r.studentId] && rooms[r.hostId] > 0) record(r, true);
      else res.alsoPaired.push({hostId: r.hostId, studentId: r.studentId, hostName: r.hostName, studentName: r.studentName, status: statusOf[r.studentId],
                                score: r.score, band: r.band, eligible: r.eligible, blockers: r.blockers});
    });
    /* everyone else: the best overall allocation */
    var pool = ss.filter(function (s) { return !placed[s.id] && !staffLinked[s.id] && !res.students[s.id].excluded.length; }).map(function (s) { return s.id; });
    var slots = [];
    hs.forEach(function (h) { if (h.available) for (var k = 0; k < rooms[h.id]; k++) slots.push(h.id); });
    bestAllocation(all, pool, slots).forEach(function (r) { record(r, false); });
    res.pairings.sort(function (a, b) { return Number(b.locked) - Number(a.locked) || b.score - a.score; });
    res.unmatchedHosts = hs.filter(function (h) { return h.available && rooms[h.id] === h.rooms; }).map(function (h) {
      var why = res.hosts[h.id].why;
      return {id: h.id, name: h.name, eligible: res.hosts[h.id].ranked.length, ruledOut: res.hosts[h.id].ruledOut.length,
              reasons: Object.keys(why).sort(function (x, y) { return why[y] - why[x]; }).slice(0, 3).map(function (k) { return BLOCK_LABELS[k] + " (" + why[k] + ")"; })};
    });
    res.unmatchedStudents = ss.filter(function (s) { return !placed[s.id] && !staffLinked[s.id] && !res.students[s.id].excluded.length; })
      .map(function (s) { return {id: s.id, name: s.name, eligible: res.students[s.id].ranked.length}; });
    return res;
  }

  /* One person's best host among those available, for the market-day demo:
     every participant gets their own best match (hosts aren't used up).
     When no host passes every filter, the closest one is returned with
     what stands in the way. */
  function bestMatch(student, hosts) {
    var s = studentView(student);
    var hs = (hosts || []).map(hostView).filter(function (h) { return h.available; });
    if (!hs.length) return null;
    var all = hs.map(function (h) { return judge(s, h); });
    var own = studentBlockers(s, false).map(function (b) { return b.kind; });
    var hostOnly = function (r) { return r.blockers.filter(function (b) { return own.indexOf(b.kind) === -1; }); };
    var ok = all.filter(function (r) { return r.eligible; }).sort(byScore);
    var pick = ok[0], closest = false;
    if (!pick) {
      /* rank by the pairing's own blockers, setting aside the student's (screening, status) */
      pick = all.slice().sort(function (a, b) { return hostOnly(a).length - hostOnly(b).length || b.score - a.score; })[0];
      closest = hostOnly(pick).length > 0;
    }
    var h = hs.filter(function (x) { return x.id === pick.hostId; })[0].raw;
    return {host: h, result: pick, closest: closest, setAside: own, ranked: ok.map(function (r) { return {hostId: r.hostId, hostName: r.hostName, score: r.score}; }),
            standsInWay: closest ? hostOnly(pick).map(function (b) { return b.you; }) : []};
  }

  /* ---------- reading and writing host lists ---------- */
  /* Spreadsheet columns: heading, path, type. Lists separate items with
     semicolons (or commas); commute times read "UTS City Campus: 15;
     USyd Camperdown: 10"; ranges read "18-40". */
  var HOST_COLUMNS = [
    ["Host ID", "meta.hostId"], ["Status", "meta.pairingStatus"], ["Host fit", "meta.hostFit"], ["Updated", "meta.updatedAt", "date"],
    ["First name", "host.firstName"], ["Last name", "host.lastName"], ["Preferred name", "host.preferredName"], ["Age", "host.age", "num"],
    ["Gender", "host.gender"], ["Pronouns", "host.pronouns"], ["Household", "host.householdType"],
    ["Partner's name", "host.partner.firstName"], ["Partner's age", "host.partner.age", "num"], ["Partner's gender", "host.partner.gender"],
    ["Country of origin", "host.countryOfOrigin"], ["Languages", "host.languages", "list"], ["Former career", "host.formerCareer"],
    ["Career field", "host.discipline"], ["Income support", "host.incomeSupport"],
    ["Nominee", "familyNominee.name"], ["Nominee relationship", "familyNominee.relationship"], ["Nominee location", "familyNominee.location"],
    ["Nominee pays", "familyNominee.isPayer", "bool"],
    ["Suburb", "home.suburb"], ["Postcode", "home.postcode"], ["Home type", "home.homeType"], ["Rooms offered", "home.roomsOffered", "num"],
    ["Sharer bathroom", "home.sharerBathroom"], ["Stairs", "home.stairs", "bool"], ["Accessibility features", "home.accessibilityFeatures", "list"],
    ["Home ready", "home.readiness"],
    ["Commute minutes", "placement.campusCommuteMins", "map"], ["Transport nearby", "placement.transportNearby", "list"],
    ["Available from", "placement.availableFrom", "date"], ["Flexible by (weeks)", "placement.availableFlexWeeks", "num"],
    ["Shortest stay (months)", "placement.minStayMonths", "num"], ["Open to extending", "placement.openToExtend", "bool"],
    ["Hobbies", "interests.hobbies", "list"], ["Can offer", "interests.canOffer", "list"], ["Wants to learn", "interests.wantsToLearn", "list"],
    ["Sharer gender", "preferences.sharerGender"], ["Sharer age", "preferences.sharerAgeRange", "range"],
    ["Preferred study areas", "preferences.preferredDisciplines", "list"], ["Student types", "preferences.studentTypes", "list"],
    ["Other sharers", "preferences.otherLodgers"], ["Languages welcome", "preferences.languagesWelcome", "list"],
    ["Smoker", "household.smoker", "bool"], ["Smoke-free home", "household.smokeFreeHome", "bool"], ["Pets", "household.pets", "list"],
    ["Diet", "household.diet"], ["Deal-breakers", "household.dealbreakers", "list"],
    ["Hours a week", "support.hoursPerWeek", "range"], ["Paid extra hours a week", "support.paidAddOn.hoursPerWeek", "num"],
    ["Help wanted", "support.helpWanted", "list"], ["Best times", "support.bestTimes", "list"],
    ["Nights at home a week", "support.nightsHomePerWeek", "range"], ["Needs a driver", "support.needsDriver", "bool"],
    ["Car for the sharer", "support.carAvailableForSharer", "bool"], ["Out of scope", "support.outOfScope", "list"],
    ["Payment a week", "support.lodgerPaymentWeekly", "num"],
    ["Bedtime", "lifestyle.bedtime"], ["Wake time", "lifestyle.wakeTime"], ["Quiet after", "lifestyle.quietAfter"],
    ["Weekdays", "lifestyle.weekdays"], ["Weekends", "lifestyle.weekends"], ["Time together (1-5)", "lifestyle.socialLevel", "num"],
    ["Social note", "lifestyle.socialNote"], ["Guests", "lifestyle.guests"], ["Tidiness", "lifestyle.tidiness"], ["Communication", "lifestyle.communication"],
    ["Motivation", "screening.motivation", "list"], ["Risk flags", "screening.riskFlags", "list"], ["Watch-point", "screening.watchPoint"]
  ];
  var COLUMN_ALIASES = {surname: "host.lastName", familyname: "host.lastName", givenname: "host.firstName", id: "meta.hostId",
    pairingstatus: "meta.pairingStatus", rent: "support.lodgerPaymentWeekly", weeklyrent: "support.lodgerPaymentWeekly",
    paymentperweek: "support.lodgerPaymentWeekly", lodgerpayment: "support.lodgerPaymentWeekly", availablefrom: "placement.availableFrom",
    roomfreefrom: "placement.availableFrom", commute: "placement.campusCommuteMins", campuses: "placement.campusCommuteMins",
    helpneeded: "support.helpWanted", interests: "interests.hobbies", career: "host.formerCareer", discipline: "host.discipline",
    timetogether: "lifestyle.socialLevel", sociallevel: "lifestyle.socialLevel", studentgender: "preferences.sharerGender",
    studentgenderwanted: "preferences.sharerGender", sharerage: "preferences.sharerAgeRange", agerange: "preferences.sharerAgeRange",
    hoursaweek: "support.hoursPerWeek", hoursperweek: "support.hoursPerWeek", dealbreakers: "household.dealbreakers",
    otherlodgers: "preferences.otherLodgers", rooms: "home.roomsOffered", studentrooms: "home.roomsOffered"};

  function blankHost() {
    var h = {};
    HOST_COLUMNS.forEach(function (c) { setPath(h, c[1], /list/.test(c[2] || "") ? [] : c[2] === "map" ? {} : null); });
    return h;
  }
  function slug(s) { return norm(s).replace(/ /g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40); }
  function commuteMap(v) {
    if (isObj(v)) { var o = {}; Object.keys(v).forEach(function (k) { var n = num(v[k]); if (n != null) o[k] = n; }); return o; }
    var out = {};
    list(v).forEach(function (pair) {
      var m = String(pair).match(/^(.*?)[:=]\s*(\d+)\s*(?:min|mins|minutes)?\s*$/i) || String(pair).match(/^(.*?)\s*\((\d+)\s*(?:min|mins|minutes)?\)\s*$/i);
      if (m) out[campusKey(m[1]) || m[1].trim()] = +m[2];
    });
    return out;
  }
  /* Tidies one host record: the right types for known fields, everything else kept, an id. */
  function normaliseHost(src) {
    var h = clone(src) || {};
    (function strip(o) { if (isObj(o)) Object.keys(o).forEach(function (k) { if (k === "__proto__" || k === "constructor" || k === "prototype") delete o[k]; else strip(o[k]); }); })(h);
    HOST_COLUMNS.forEach(function (c) {
      var v = get(h, c[1]);
      if (v === undefined) return;
      if (c[2] === "num") setPath(h, c[1], num(v));
      else if (c[2] === "bool") setPath(h, c[1], bool(v));
      else if (c[2] === "list") setPath(h, c[1], list(v));
      else if (c[2] === "date") setPath(h, c[1], isoDate(v));
      else if (c[2] === "range") setPath(h, c[1], range(v));
      else if (c[2] === "map") setPath(h, c[1], commuteMap(v));
      else if (typeof v === "string") setPath(h, c[1], v.trim() || null);
    });
    if (!isObj(h.meta)) h.meta = {};
    if (h.meta.pairingStatus) h.meta.pairingStatus = norm(h.meta.pairingStatus).replace(/ /g, "_");
    if (!h.meta.hostId) h.meta.hostId = "H-" + (slug([get(h, "host.firstName"), get(h, "host.lastName"), get(h, "home.suburb")].filter(Boolean).join(" ")) || Date.now().toString(36));
    h.meta.hostId = String(h.meta.hostId).replace(/[^A-Za-z0-9_.~:@+-]/g, "-").slice(0, 80);
    return h;
  }

  /* A small CSV/TSV reader: quoted cells, doubled quotes, line breaks in quotes. */
  function readTable(text) {
    var first = text.split(/\r?\n/)[0];
    var delim = (first.match(/\t/g) || []).length ? "\t" : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
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
  function isHost(x) { return isObj(x) && (isObj(x.host) || isObj(x.home) || isObj(x.preferences) || isObj(x.support)) && !x.student; }

  /* Host profiles from pasted or uploaded text: JSON (one host, a list, or
     {hosts: [...]}) or a spreadsheet saved as CSV, or rows copied straight
     from one (tab-separated), heading row first. */
  function parseHosts(text) {
    var t = String(text == null ? "" : text).replace(/^﻿/, "").trim(), problems = [], hosts = [];
    if (!t) return {hosts: hosts, problems: ["There was nothing to read."]};
    if (/^[\[{]/.test(t)) {
      var v;
      try { v = JSON.parse(t); } catch (e) { return {hosts: hosts, problems: ["That isn’t valid JSON (" + e.message + ")."]}; }
      var items = Array.isArray(v) ? v : Array.isArray(v.hosts) ? v.hosts : [v];
      items.forEach(function (x, i) {
        if (isHost(x)) hosts.push(normaliseHost(x));
        else if (isObj(x) && (x.student || x.screening)) problems.push("Item " + (i + 1) + " is a student profile, not a host. Add it on the Applicants tab.");
        else problems.push("Item " + (i + 1) + " isn’t a host profile.");
      });
    } else {
      var rows = readTable(t);
      if (rows.length < 2) return {hosts: hosts, problems: ["Include the heading row and at least one host."]};
      var cols = rows[0].map(columnFor), skipped = rows[0].filter(function (c, i) { return c.trim() && !cols[i]; });
      if (!cols.some(Boolean)) return {hosts: hosts, problems: ["The first row doesn’t have any of the host template’s headings."]};
      if (skipped.length) problems.push("Ignored columns: " + skipped.join(", "));
      rows.slice(1).forEach(function (r) {
        var h = {};
        cols.forEach(function (path, j) {
          var cell = (r[j] || "").trim();
          if (!path || !cell) return;
          if (path === "name") { var parts = cell.split(/\s+/); setPath(h, "host.firstName", parts[0]); setPath(h, "host.lastName", parts.slice(1).join(" ") || null); }
          else setPath(h, path, cell);
        });
        if (Object.keys(h).length) hosts.push(normaliseHost(h));
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

  function csvCell(v) {
    var s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function cellFor(h, c) {
    var v = get(h, c[1]);
    if (v == null) return "";
    if (c[2] === "map") return Object.keys(v).map(function (k) { return k + ": " + v[k]; }).join("; ");
    if (c[2] === "range") { var r = range(v); return r ? (r.min === r.max ? String(r.min) : r.min + "-" + (r.max == null ? "" : r.max)) : ""; }
    if (c[2] === "list") return list(v).join("; ");
    if (c[2] === "bool") return v === true ? "Yes" : v === false ? "No" : "";
    if (isObj(v)) return Object.keys(v).map(function (k) { return v[k]; }).filter(function (x) { return !blank(x); }).join(", ");
    return v;
  }
  function hostsToCsv(hosts) {
    return [HOST_COLUMNS.map(function (c) { return csvCell(c[0]); }).join(",")]
      .concat((hosts || []).map(function (h) { return HOST_COLUMNS.map(function (c) { return csvCell(cellFor(h, c)); }).join(","); }))
      .join("\r\n") + "\r\n";
  }
  var EXAMPLE_HOST = {
    meta: {hostId: "GH-EXAMPLE", pairingStatus: "screening", hostFit: "core", updatedAt: "2027-01-15"},
    host: {firstName: "Margaret", lastName: "Hollis", preferredName: "Marg", age: 78, gender: "female", pronouns: "she/her", householdType: "single",
           countryOfOrigin: "Australia", languages: ["English"], formerCareer: "Nurse", discipline: "health", incomeSupport: "part_pension"},
    familyNominee: {name: "David Hollis", relationship: "son", location: "local", isPayer: true},
    home: {suburb: "Marrickville", postcode: "2204", homeType: "weatherboard cottage with a granny flat", roomsOffered: 1, sharerBathroom: "private",
           stairs: true, accessibilityFeatures: [], readiness: "ready"},
    placement: {campusCommuteMins: {"UTS City Campus": 25, "USyd Camperdown": 20, "UNSW Kensington": 40, "Macquarie Uni": 60, "WSU Parramatta": 45},
                transportNearby: ["train", "bus"], availableFrom: "2027-02-01", availableFlexWeeks: 2, minStayMonths: 6, openToExtend: true},
    interests: {hobbies: ["gardening", "baking", "the radio", "community garden"], canOffer: ["family recipes", "gardening", "nursing career advice"],
                wantsToLearn: ["video calls", "online banking"]},
    preferences: {sharerGender: "any", sharerAgeRange: {min: 18, max: 40}, preferredDisciplines: ["health", "carework"], studentTypes: ["domestic", "international"],
                  otherLodgers: "none", languagesWelcome: []},
    household: {smoker: false, smokeFreeHome: true, pets: [], diet: "omnivore", dealbreakers: ["smoking"]},
    support: {hoursPerWeek: {min: 8, max: 10}, helpWanted: ["companionship", "shared_meals", "tech_help", "gardening"], bestTimes: ["weekday evenings", "Saturday"],
              nightsHomePerWeek: {min: 4, max: 6}, needsDriver: false, carAvailableForSharer: false, outOfScope: ["personal_care", "medication"], lodgerPaymentWeekly: 90},
    lifestyle: {bedtime: "21:30", wakeTime: "06:00", quietAfter: "21:00", socialLevel: 4, guests: "Daytime visitors fine", tidiness: "tidy", communication: "in person"},
    screening: {motivation: ["company"], riskFlags: ["fall_risk"], watchPoint: "Example row: replace with a real host, or delete it."}
  };
  function hostCsvTemplate() { return hostsToCsv([EXAMPLE_HOST]); }

  /* The host's details as [label, text] pairs, for staff to read. */
  function hostFacts(raw) {
    var h = hostView(raw || {}), x = (raw && raw.host) || {}, nom = (raw && raw.familyNominee) || {}, life = (raw && raw.lifestyle) || {}, sup = (raw && raw.support) || {};
    var commute = Object.keys(h.commute).map(function (k) { return k + " " + h.commute[k] + " min"; }).join(", ");
    return [
      ["Household", [x.householdType === "couple" && x.partner ? "Couple, with " + x.partner.firstName + (x.partner.age ? " (" + x.partner.age + ")" : "") : x.maritalStatus ? lowerFirst(x.maritalStatus) : "", x.countryOfOrigin ? "from " + x.countryOfOrigin : ""].filter(Boolean).join(", ")],
      ["Former career", h.formerCareer],
      ["Languages", h.languages.join(", ")],
      ["Home", [raw && raw.home && raw.home.homeType, h.rooms > 1 ? h.rooms + " rooms offered" : "", h.bathroom ? h.bathroom + " bathroom" : "", h.stairs ? "stairs" + (h.lift ? " (lift)" : "") : "no stairs", h.ready ? "" : "not ready: " + h.readiness.replace(/_/g, " ")].filter(Boolean).join(", ")],
      ["Commute", commute],
      ["Available", [h.availableFrom ? "from " + shortDate(h.availableFrom) + (h.flexWeeks ? " ± " + plural(h.flexWeeks, "week", "weeks") : "") : "", h.minStay ? "at least " + h.minStay + " months" : ""].filter(Boolean).join(", ")],
      ["Payment", h.payment != null ? "$" + h.payment + " a week" : ""],
      ["Sharer wanted", [h.wantsGender === "any" ? "any gender" : h.wantsGender, h.ageMin != null || h.ageMax != null ? "aged " + (h.ageMin != null ? h.ageMin : "") + "–" + (h.ageMax != null ? h.ageMax : "") : "", h.disciplines.length ? "ideally " + joinAnd(h.disciplines.map(function (d) { return FIELD_WORD[d]; })) : "", h.otherLodgers ? "other sharers: " + h.otherLodgers : ""].filter(Boolean).join(", ")],
      ["Hours and nights", [h.hours ? rangeText(h.hours, "hours") + " a week" : "", h.paidHours ? "plus " + h.paidHours + " paid hours" : "", h.nights ? rangeText(h.nights) + " nights home" : ""].filter(Boolean).join(", ")],
      ["Help wanted", h.help.map(function (x) { return x.label; }).join(", ") + (h.needsDriver ? " (a driver is essential)" : "")],
      ["Best times", list(sup.bestTimes).join(", ")],
      ["Time together", h.social ? h.social + " of 5" + (life.socialNote ? ": " + life.socialNote : "") : ""],
      ["Routine", [life.bedtime ? "bed " + clockText(life.bedtime) : "", life.quietAfter ? "quiet after " + clockText(life.quietAfter) : "", life.guests ? "guests: " + lowerFirst(life.guests) : ""].filter(Boolean).join(", ")],
      ["Home rules", [h.smoker ? "smokes" : h.smokeFree ? "smoke-free" : "", h.pets.length ? "pets: " + h.pets.join(", ") : "no pets", h.diet].concat(h.dealbreakers.map(lowerFirst)).filter(Boolean).join("; ")],
      ["Interests", list(raw && raw.interests && raw.interests.hobbies).join(", ")],
      ["Can teach or share", h.canOfferText.join(", ")],
      ["Wants to learn", h.wantsToLearn.map(function (x) { return x.label; }).join(", ")],
      ["Languages welcome", h.languagesWelcome.join(", ")],
      ["Family nominee", [nom.name ? nom.name + (nom.relationship ? " (" + nom.relationship + ")" : "") : "", nom.location, nom.isPayer === true ? "pays" : nom.isPayer === false ? "doesn’t pay" : ""].filter(Boolean).join(", ")],
      ["Needs to note", Object.keys(h.risks).map(function (r) { return RISK_WORDS[r] || r.replace(/_/g, " "); }).join(", ")],
      ["Checks pending", h.pending.join(", ")],
      ["Watch-point", h.watchPoint]
    ].filter(function (f) { return !blank(f[1]); });
  }

  return {
    version: VERSION, HOST_COLUMNS: HOST_COLUMNS, HOST_STATUS: HOST_STATUS, CAMPUSES: CAMPUSES, FIELDS: FIELDS, PROGRAM_FIELDS: PROGRAM_FIELDS, VOCAB: VOCAB,
    HOST_WEIGHTS: HOST_WEIGHTS, STUDENT_WEIGHTS: STUDENT_WEIGHTS, PART_LABELS: PART_LABELS, EXAMPLE_HOST: EXAMPLE_HOST, TAG_QUALITY: TAG_QUALITY,
    score: score, matchAll: matchAll, bestMatch: bestMatch, assign: assign, hostStatus: hostStatus,
    parseHosts: parseHosts, hostsToCsv: hostsToCsv, hostCsvTemplate: hostCsvTemplate, blankHost: blankHost, hostFacts: hostFacts,
    hostName: hostName, hostFirst: hostFirst, hostFullName: hostFullName, hostId: hostId, pronouns: pronouns,
    campusKey: campusKey, campusLabel: campusLabel, concept: concept, fieldOf: fieldOf
  };
});
