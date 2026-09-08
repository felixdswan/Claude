/* Pull the rubric and the day map out of the game itself, so the backend
   workbook can never drift from what the game actually scores.
   Usage: node scripts/export-rubric.js  ->  data/rubric.json */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.resolve(__dirname, "../game/pepaws-porch.html"), "utf8");
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const contentBlock = blocks.find((b) => /var RUBRIC\s*=/.test(b) && /var DAYS\s*=/.test(b));
if (!contentBlock) { console.error("could not find the content block"); process.exit(1); }

const { RUBRIC, DAYS } = new Function(contentBlock + "; return {RUBRIC: RUBRIC, DAYS: DAYS};")();

const rubric = {};
Object.keys(RUBRIC).forEach((k) => {
  rubric[k] = {
    competency: RUBRIC[k].competency,
    signals: RUBRIC[k].signals.map((s) => ({ id: s.id, label: s.label, pattern: s.re.source })),
    watch: (RUBRIC[k].watch || []).map((s) => ({ id: s.id, label: s.label, pattern: s.re.source }))
  };
});

const days = DAYS.map((d) => ({
  day: d.n, title: d.title, time: d.time, zone: d.zone, kind: d.kind,
  level: d.level || null,
  freeText: d.steps.filter((s) => s.t === "text").map((s) => ({ id: s.id, prompt: s.prompt, min: s.min })),
  timers: d.steps.filter((s) => s.timer).map((s) => s.timer)
}));

const out = {
  generatedFrom: "game/pepaws-porch.html",
  bands: [
    { band: "Certified", meaning: "Clean run; emergency called, hazards handled, autonomy preserved" },
    { band: "Certified with notes", meaning: "Placeable, with named coaching items for the coordinator" },
    { band: "Not yet", meaning: "A gap: a named module, then a re-sit" },
    { band: "Assessor review", meaning: "A person writes the outcome. Never auto-issued in either direction" }
  ],
  meters: [
    { meter: "rapport", meaning: "Does he want you there", start: 60 },
    { meter: "autonomy", meaning: "Is it still his house", start: 60 },
    { meter: "safety", meaning: "Did anyone get hurt", start: 60 }
  ],
  days: days,
  rubric: rubric
};

const dest = path.resolve(__dirname, "../data/rubric.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
const nSig = Object.values(rubric).reduce((n, r) => n + r.signals.length + r.watch.length, 0);
console.log(`wrote ${path.relative(process.cwd(), dest)} — ${days.length} days, ${Object.keys(rubric).length} levels, ${nSig} rubric rows`);
