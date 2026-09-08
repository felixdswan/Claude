# Pepaws Porch

A homeshare readiness assessment, in the shape of a game.

Applicants for intergenerational housing placements spend fourteen days living with
Bruce Whitlam, 82, at 14 Ellerslie Street. Nine of those days are ordinary — tea, bins,
washing, a phone call from his daughter. Five put something in front of them that a real
placement will:

| Day | Challenge | Input | Clock |
|----|-----------|-------|-------|
| 3  | A minor technology problem | Free text | none |
| 6  | Low mood | Choice ladder → free text | none |
| 8  | A discriminatory remark (**mandatory**, slur censored) | Timed choice → free text | 45s |
| 11 | A mobility incident | Two timed choices → free text | 20s each |
| 14 | A medical emergency | Three timed choices → free text | 15s each |

Difficulty ramps by shrinking the room to think, not by adding taps.

## What's here

    game/pepaws-porch.html       the game — one self-contained file, no build step
    design/pepaws-porch.html     the design bible / spec of record
    data/pepaws-porch-responses.xlsx   the backend workbook responses land in
    data/rubric.json             rubric + day map, generated from the game
    scripts/xlsx-mini.js         dependency-free .xlsx writer (also inlined in the game)
    scripts/sync_responses.py    merges exported submissions into the workbook
    scripts/export-rubric.js     regenerates data/rubric.json from the game
    scripts/test-playthrough.js  automated playthroughs in a real browser

## Where the answers go

1. **The run.** Progress is kept in `localStorage`, so a refresh on Day 11 doesn't cost
   eleven days. Every choice, timer expiry and typed answer is recorded with its timing.
2. **The record.** On finishing, the game writes one JSON document per participant to the
   artifact's record store at `submissions/<participant id>`. If the store is unreachable
   the results screen says so and hands the applicant their own workbook instead.
3. **The workbook.** Export the documents, then:

       python3 scripts/sync_responses.py <json_dir>

   Rows are keyed on participant id, so re-running the same export is safe. Four sheets:

   - **Submissions** — one row per applicant, plus four columns the assessor fills in
     by hand. A re-sync never overwrites those.
   - **Free text** — one row per written answer: full text, rubric signals hit and
     missed, characters, seconds.
   - **Choices** — every decision and the meter movement it caused.
   - **Rubric** — the signal set, generated from the game so it can't drift.

4. **The decision.** A person reads the writing and fills in `assessor`,
   `assessor_outcome`, `assessor_notes`, `reviewed_at`.

An assessor can also open the game at `#assessor` to list every submission and export them
all as one workbook. Applicants can download their own run from the results screen. Both
build the file in the browser — no third-party library, so the export works whether or not
a CDN is reachable.

## Scoring

Three meters, starting at 60: **Rapport** (does he want you there), **Autonomy** (is it
still his house), **Safety** (did anyone get hurt). They're in deliberate tension — the
fastest way to raise rapport on Day 8 is to laugh along, and that costs you elsewhere.

Choices score deterministically. Written answers are matched against the rubric by a
keyword pass with a negation guard, so *"I would **not** lift him"* reads as the good
answer it is rather than the flag a naive match would raise. That pass produces a
**provisional band only** — `Certified`, `Certified with notes`, `Not yet`, or
`Assessor review`. Nothing auto-rejects anyone; a person writes the outcome.

Two things always route to a human rather than to a fail: not calling an ambulance in the
first window on Day 14, and answering that you would not continue the placement.

## Running it

Open `game/pepaws-porch.html` in a browser. It works offline; the record store and the
download prompt only light up when it's published as an artifact.

    node scripts/test-playthrough.js /tmp/out    # best, worst, timeout and no-store runs
    node scripts/export-rubric.js                # refresh data/rubric.json after content edits

Regenerate the rubric whenever the scenarios or signals change, so the workbook stays in
step with the game.

## Before this goes to real applicants

- **Access.** An artifact with a record store is organisation-internal: every participant
  must be signed in to the workspace. Fine for a pilot with a known cohort; public
  applicants need a hosted deployment with its own sign-in. Only the storage call changes.
- **Assessment.** The rubric produces a provisional band and nothing more. The instrument
  only means something if a named person reads all five written answers — budget about ten
  minutes per applicant.
- **Validation.** Run the scenarios past placement coordinators and current homeshare
  residents before launch. If they don't ring true to the people living it, they don't ship.
