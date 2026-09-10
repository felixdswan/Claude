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

## Getting the responses out

**The assessor page is a URL, not a button.** Take the game's URL and put `#assessor`
on the end:

    https://claude.ai/code/artifact/4d7de4dd-fd7c-412b-aee0-ea20877da4b0#assessor

Open it in a **new tab**. (Typing the hash into a tab that already has the game open now
works too, but a fresh tab is the reliable habit.) You get a table of every completed run,
newest first, and two buttons.

### Just want the spreadsheet?

Click **Export workbook (.xlsx)**, confirm the download prompt, done. That file has all
participants across four sheets. No Python, no JSON, no sync script.

### Want to accumulate runs into the tracked workbook?

Use this when you're marking work up over time and want your own assessor columns kept.

1. On the same page, click **Export raw JSON** and confirm the download.
2. Point the sync script at the file you just downloaded:

       python3 scripts/sync_responses.py ~/Downloads/pepaws-porch-submissions.json

That merges into `data/pepaws-porch-responses.xlsx`. Re-running with the same file is
safe — rows are keyed on participant id, so a participant is replaced rather than
duplicated, and `assessor`, `assessor_outcome`, `assessor_notes` and `reviewed_at` are
never overwritten by a sync.

Needs `pip install openpyxl` once.

### If something doesn't work

| What you see | What it means |
|---|---|
| The game, not a table | The hash didn't take. Open the `#assessor` URL in a new tab. |
| "The shared record is not available in this view" | You're opening the local file, or the record store isn't reachable. It only works on the published artifact. |
| "No submissions yet" | Nobody has finished a run. Only *completed* fourteen-day runs are written; abandoning halfway stores nothing. |
| "Download cancelled" | The confirmation prompt was dismissed. Click the button again. |
| `0 submission(s) merged` | Wrong file. It wants the **Export raw JSON** download, not the .xlsx. |

### The sheets

- **Submissions** — one row per applicant, plus four empty columns for the assessor.
- **Free text** — one row per written answer: full text, rubric signals hit and missed,
  characters, seconds.
- **Choices** — every decision and the meter movement it caused.
- **Rubric** — the signal set, generated from the game so it can't drift.

A person then fills in `assessor`, `assessor_outcome`, `assessor_notes`, `reviewed_at`.

### What the game stores, and when

Progress is kept in `localStorage` as you play, so a refresh on Day 11 doesn't cost eleven
days. On finishing, one JSON document per participant is written to the artifact's record
store at `submissions/<participant id>`. If that write fails, the results screen says so
and offers the applicant their own workbook to send on instead.

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
