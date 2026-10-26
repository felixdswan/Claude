# Pepaws Porch

A homeshare screening game for an intergenerational housing placement service.

Applicants spend fourteen days living with Margaret "Marg" Hollis, 78, in her weatherboard
cottage. There are no right or wrong answers. Four hidden meters (Connection, Respect,
Reliability, Awareness) record what the applicant values, and five short pages of questions at
the end fill in the rest of a **GenStay matching profile**. Staff review the profiles one after
another on a built-in review desk.

| Day | Landmark | Content note |
|----|-----------|-------|
| 6  | Loss: Marg's closest friend dies | Bereavement |
| 9  | Boundaries: a biased remark over dinner | A biased remark |
| 11 | Safety: a fall on the broken brick step | A fall and an injury |
| 14 | The emergency: Marg collapses (first choice timed, 15s) | A medical emergency |

The other days branch on earlier choices. Day 13 brings back the applicant's lowest moment in a
new form.

A **quick demo** (`game/pepaws-porch.demo.html`) plays the same story in three to four minutes.
See [Quick demo](#quick-demo) below.

## What's here

    game/pepaws-porch.html               the game and the staff review desk, one file, no build step
    game/pepaws-porch.demo.html          the quick demo, with its own staff desk, one file
    game/genstay-profile-template.html   the GenStay profile template the desk shows each profile in
    genstay/genstay-profile-fields.md    the profile data contract, and how the game fills and stores it
    genstay/genstay-profile.sample.json  a complete example profile
    scripts/test-playthrough.js          automated runs of the full game in a real browser
    scripts/test-demo.js                 automated runs of the quick demo
    scripts/browser-harness.js           shared test setup: a local server and a stand-in for the artifact runtime
    design/pepaws-porch.html             the original design bible (from the earlier Bruce version, kept for reference)

The game and the template are published together as one artifact, and the demo and the template
as another. Each finds the template by the relative address `genstay-profile-template.html`, so
keep them side by side.

## For applicants

Open the artifact link. Enter a name, a university email and an area of study, play the
fortnight, answer the final questions, and submit. The profile goes straight to the placement
record. Nothing personal stays in the browser once it arrives.

Starting the game asks once for permission to save to the placement record, so the save at the
end doesn't meet a prompt the applicant might miss. If the save still fails, the results screen
says why and what to do: switch saving back on (**Permissions**), open the link at claude.ai in a
browser, or send the profile another way with **Copy profile**, **Show profile text** or (where
the view allows downloads) **Download profile file**. A brief glitch is retried automatically.

## For staff

Put `#staff` on the end of the artifact link and open it in a new tab:

    https://claude.ai/code/artifact/<id>#staff

The desk lists every applicant, newest first. Select one, or use **Prev** and **Next** to work
through the queue. Each profile opens in the GenStay template, with a **Staff / Family** switch
that hides staff-only rows. Beside it, set the pairing status, suggested homeowner, checks and a
watch-point, and click **Save review**. Those fields are kept separately from the applicant's
answers and shown in the profile.

- Profiles with threatening language, drug references, a possible welfare concern or very low
  safety awareness are marked **Needs attention**, with the words quoted in the watch-point.
  Threats and drug references also keep the applicant out of automatic matching. The checks are
  plain word lists, so they catch the obvious and miss the subtle: still read the answers.
- **Search** and the status filter (including **Needs attention**) narrow the queue.
- **Add profile files** imports `.json` profiles that applicants emailed in. **Paste a profile**
  takes the profile text itself, when an applicant pasted it into an email.
- **Download PDF** saves the open profile as a PDF that looks exactly like the template, in
  whichever view (Staff or Family) is showing. **Download all (PDF)** puts every profile in the
  queue, as filtered, into one PDF, each starting on a new page. Pages break between rows.
- **Download JSON** and **Download all (JSON)** save the same data for the matching algorithm.
- Offline, the PDF tools (html2canvas and jsPDF, loaded from cdnjs on first use) can't load, so
  **Download PDF** opens the print dialog instead: choose **Save as PDF**. The template opened on
  its own has the same **Download PDF** and **Print** buttons.
- If an applicant played more than once, a run picker appears. The latest run opens first.

## Quick demo

`game/pepaws-porch.demo.html` is a separate, shorter version for demonstrations and quick trials.
The full game is unchanged.

- **Eight days, four big moments.** Arrival, house routines, the bank text and the noisy night
  are the everyday days; loss, the biased remark, the fall and the emergency are the big moments.
- **Multiple choice only, 25 seconds a question.** Each day opens with an untimed scene, then one
  timed question (two on Day 1), then Marg's reaction. Pausing pauses the timer. The longest
  question is about 35 words, roughly 14 seconds' reading at a slow pace. A timed-out question
  counts as no answer: it nudges the meters down a little and is reported to staff.
- **Two pages of matching questions** cover the hard filters and main scoring points: age,
  gender, campus, move-in date, length of stay, rent, homeowner gender, smoking, pets, other
  students, hours a week, help offered and not offered, and hobbies.
- **About 3 to 4 minutes in all.** The eight days take about 2½ to 3½ minutes depending on
  reading speed, and the questions about a minute.
- **The same GenStay profile.** It fills fewer fields (no written answers, no contact details).
  Profile ids start with `DEMO-`, the flags include `quick_demo` (and `missed_timer` if a timer
  ran out), and the watch-point says it was the quick demo. Days keep their numbers from the full
  fortnight (1, 2, 4, 6, 8, 9, 11 and 14) so the template's landmark rows line up.
- **Its own artifact, desk and record store.** Publish the demo with the same capabilities and the
  template beside it. Its `#staff` desk shows only demo profiles, so they never mix with real
  applicants. PDF and JSON downloads work the same way.

## Access and storage

Profiles are stored in the artifact's record store under access rules, not in the page:

- Applicants need **Contributor** access. Each can write only their own profile.
- Staff need **Editor** access. Only Editors and the owner can read profiles or reviews.
- Anyone else who opens `#staff` sees an empty desk with a staff-only message.

Publish with these capabilities (the rules are what keep profiles private):

```json
{
  "db": { "rules": [
    { "path": "",                "read": "admin",    "write": "admin" },
    { "path": "profiles",        "read": "admin",    "write": "admin" },
    { "path": "profiles/{self}", "read": "interact", "write": "interact" },
    { "path": "reviews",         "read": "admin",    "write": "admin" }
  ] },
  "user": {},
  "downloads": true
}
```

The full path layout is in `genstay/genstay-profile-fields.md`.

An artifact record store is organisation-internal: applicants must be signed in to the workspace.
That suits a pilot with a known cohort. Public applicants need a hosted deployment with its own
sign-in. Only `writeProfile()` and the desk's `loadQueue()` would change.

## Running it locally

Serve `game/` over HTTP (the desk embeds the template in a frame, which `file://` won't allow):

    npx http-server game -p 8080      # then open http://localhost:8080/pepaws-porch.html

Without the artifact runtime there is no record store. The game still plays end to end and
offers the download fallback, and the desk shows profile files you add without saving them.

    node scripts/test-playthrough.js /tmp/pepaws-out

plays a best run, a worst run, a hostile run and a timed-out run against a stand-in record store,
checks each stored profile against the template's contract, exercises the staff desk and the PDF
downloads, and saves screenshots of every scene.

    node scripts/test-demo.js /tmp/pepaws-demo-out

does the same for the quick demo: best, worst and timed-out runs, the two pages of questions, the
staff desk's PDF and JSON downloads, the applicant's own profile download, and a reading-time
estimate.

The PDF checks load html2canvas 1.4.1 and jsPDF 2.5.1 from cdnjs. Where cdnjs is blocked, put
`html2canvas.min.js` and `jspdf.umd.min.js` (from the npm packages' `dist/` folders) in a folder
and set `PDF_LIBS=/that/folder`.

## Before this goes to real applicants

- **Review.** The profile type is a reflection, not a decision. A person reads the written
  answers and the closing words. Budget about ten minutes per applicant.
- **First aid accuracy.** Have Days 11 and 14 checked by a first-aid trainer or nurse against
  current Australian guidance.
- **Validation.** Run the scenarios past placement coordinators and current homeshare residents.
