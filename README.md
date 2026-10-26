# Pepaws Porch

A homeshare screening game for an intergenerational housing placement service.

Applicants spend fourteen days living with Margaret "Marg" Hollis, 78, in her weatherboard
cottage. There are no right or wrong answers. Four hidden meters (Connection, Respect,
Reliability, Awareness) record what the applicant values, and five short pages of questions at
the end fill in the rest of a **GenStay matching profile**. Staff review the profiles one after
another on a built-in review desk, add the homeowners' profiles, and get suggested pairings.

| Day | Landmark | Content note |
|----|-----------|-------|
| 6  | Loss: Marg's closest friend dies | Bereavement |
| 9  | Boundaries: a biased remark over dinner | A biased remark |
| 11 | Safety: a fall on the broken brick step | A fall and an injury |
| 14 | The emergency: Marg collapses (first choice timed, 15s) | A medical emergency |

The other days branch on earlier choices. Day 13 brings back the applicant's lowest moment in a
new form.

A **quick demo** (`game/pepaws-porch.demo.html`) plays the same story in four to five minutes,
then pairs each player with a fictional homeowner. It's built for a live market-day stall: see
[Quick demo](#quick-demo) and [Market day](#market-day) below.

## What's here

    game/pepaws-porch.html               the game and the staff review desk, one file, no build step
    game/pepaws-porch.demo.html          the quick demo, with its own staff desk, one file
    game/genstay-profile-template.html   the GenStay profile template the desk shows each profile in
    game/genstay-matching.js             the matching: reads host profiles, filters and scores pairings from both sides, allocates the best
    game/genstay-hosts.sample.json       fifteen fictional hosts: the demo's market-day homeowners, and examples of the host format
    genstay/genstay-profile-fields.md    the profile data contract, and how the game fills and stores it
    genstay/genstay-profile.sample.json  a complete example profile
    genstay/genstay-host-fields.md       the host profile format, the host spreadsheet, and how matching works
    scripts/test-playthrough.js          automated runs of the full game in a real browser
    scripts/test-demo.js                 automated runs of the quick demo, the Hosts and matches tab, and the live board
    scripts/test-matching.js             checks for the matching (no browser needed)
    scripts/browser-harness.js           shared test setup: a local server and a stand-in for the artifact runtime
    design/pepaws-porch.html             the original design bible (from the earlier Bruce version, kept for reference)

The game, the template and the matching script are published together as one artifact, and the
demo with the same two files and `genstay-hosts.sample.json` as another. Each page finds them by
their relative addresses, so keep them side by side.

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
  (The demo's desk lists every run as its own applicant instead: see [Market day](#market-day).)
- The queue follows the record store live: new profiles appear as applicants finish, without
  pressing **Refresh**.

### Hosts and matches

The desk's second tab holds the homeowners' profiles and suggests pairings.
`genstay/genstay-host-fields.md` describes every field and exactly how pairings are judged.

- **Adding hosts.** **Add host files** takes a JSON hosts file (like `game/genstay-hosts.sample.json`)
  or a CSV. **Host template (CSV)** downloads a spreadsheet with every column and an example row:
  fill in one row per homeowner and add the saved CSV, or copy the rows (heading row first) and use
  **Paste hosts**. Adding a host again with the same Host ID updates them. **Download hosts (CSV)**
  saves them all for editing. Hosts added on another staff screen appear straight away.
- **Every pairing is judged from both sides.** First the hard filters, both ways: gender and age
  preferences, student type, smoking, pets, two sharers wanted, hours, nights at home, a driver,
  safety with a falls risk, deal-breakers, stairs; and the student's homeowner preference, budget,
  length of stay, commute and dates. Then two scores out of 100: **fit for the host** (help wanted,
  care needs, time together, teaching, study area, routine, languages) and **fit for the student**
  (commute, interests, career, time together, cost, dates, motivation). The pairing's score is the
  geometric mean of the two, so it is only high when it suits both people.
- **The game's evidence counts.** A host's risk flags decide which of the applicant's choices
  matter: with a falls risk, how they handled Marg's fall and the emergency; after a bereavement,
  how they met her grief; with mild memory loss, how calmly they handled the biased remark.
- **Suggested pairings** are the best allocation overall (an optimal assignment, the Hungarian
  method): one applicant per room, making the most suitable pairings in total, so someone may be
  suggested for their second-best host when their best suits another applicant much better. The
  card says so. Pairings staff have made are kept first. Applicants screened as The Transactional
  Guest, or with threatening language or drug references, are never suggested; hosts on hold or
  with a sharer get no new suggestions.
- **Each card** shows the score and both sides' fit, what's good (✓), what to check (!), anything
  that rules it out (✕), and a score breakdown.
- **Select a host** to see their details, every applicant ranked for them, and who was ruled out
  and why. Change their status (available, in screening, shortlisted, on hold, has a sharer) or
  remove them there.
- **Suggest this pairing** shortlists the applicant for that homeowner in their review, which shows
  in their profile. Nobody is contacted. On the Applicants tab, each review also lists the
  applicant's **best homeowners**, and **Use** fills in the suggested homeowner.

### Live board

The third tab shows everyone who has finished, newest first, with the homeowner they were matched
with, the score and the top two reasons. New arrivals appear by themselves and are highlighted.
**Full screen** fills the screen for a stall display. In the demo, each card shows exactly the
match the participant saw; in the full game, the applicant's best host among the stored hosts
(someone screening keeps out of matching is shown as held back). It shows first names only.

## Quick demo

`game/pepaws-porch.demo.html` is a separate, shorter version for demonstrations and quick trials.
The full game is unchanged.

- **Nine days, four big moments.** Arrival, house routines, shared ground, the bank text and the
  noisy night are the everyday days; loss, the biased remark, the fall and the emergency are the
  big moments. Anything a later day mentions (the loose step, the dinner invitation, the community
  garden, the medical folder) is set up on an earlier day that every applicant sees.
- **Multiple choice only, 25 seconds a question.** Each day opens with an untimed scene, then one
  timed question (two on Day 1), then Marg's reaction. Pausing pauses the timer. The longest
  question is about 35 words, roughly 14 seconds' reading at a slow pace. A timed-out question
  counts as no answer: it nudges the meters down a little and is reported to staff.
- **Day 3 feeds the profile.** Marg talks about her career (the applicant's own field) and asks
  what they'd like to do together: hear about her work, help at the community garden, bake, or
  keep the week for study. The answer pre-fills the matching questions below.
- **A first name and an optional email** to start. Typing an email in public slows a stall down.
- **Two pages of matching questions.** The first covers the hard filters: age, gender, campus (one
  of the five the hosts give commute times for), move-in month (the next few months), length of
  stay, rent, homeowner gender, other students, smoking and pets (one tap each). The second covers the scoring points: the career they're heading for (options for their
  area of study), whether they'd like a homeowner from their field, how much time they'd like to
  spend together, languages, hobbies, something they'd like to learn, hours a week, and help
  offered and not offered.
- **A fictional pairing.** The results screen shows the participant's best homeowner from
  `genstay-hosts.sample.json`: name, age, suburb, former career, the score, up to four reasons in
  plain words ("Bob was a paediatric surgeon, and you're heading for medicine", "8 minutes to UNSW
  Kensington by light rail and bus") and anything to talk through. It uses the same matching as the
  staff desk, and says the homeowner is made up. Everyone gets their own best match (rooms aren't
  used up at a stall). If no host passes every filter, it shows the closest and what stands in
  the way. If the hosts file can't load within six seconds, the results show without a match.
- **About 4 to 5 minutes in all.** The nine days take about 3 to 4 minutes depending on reading
  speed, and the questions about a minute.
- **The same GenStay profile.** It fills fewer fields (no written answers, no contact details).
  Profile ids start with `DEMO-`, the flags include `quick_demo` (and `missed_timer` if a timer
  ran out), and the watch-point says it was the quick demo. Days keep their numbers from the full
  fortnight (1, 2, 3, 4, 6, 8, 9, 11 and 14) so the template's landmark rows line up.
- **Its own artifact, desk and record store.** Publish the demo with the same capabilities, and the
  template, matching script and sample hosts beside it. Its `#staff` desk shows only demo profiles and its own
  hosts, so they never mix with real applicants. PDF and JSON downloads and the Hosts and matches
  tab work the same way.

## Market day

Participants play the demo on the stall's tablets, their profile reaches the staff desk as they
finish, and the big screen shows who was matched with whom.

1. **Publish** the demo with `genstay-profile-template.html`, `genstay-matching.js` and
   `genstay-hosts.sample.json` beside it. To change the homeowners, edit that file (same format)
   and republish. Its room dates are set against its `generated` date; on a later market day the
   demo moves them forward by the months since, so the rooms are still coming free.
2. **Sign the tablets in.** Saving needs an account in your organisation with Contributor access:
   visitors from outside the organisation can only view, so their profile can't reach the desk
   (they still see their match). Sign each tablet in to a stall account. Several tablets can share
   one account: the demo's desk lists every run as its own participant.
3. **The staff screen.** Open the demo's link with `#staff` on a laptop signed in as an Editor,
   choose **Live board**, then **Full screen**. Optionally add `genstay-hosts.sample.json` on the
   Hosts and matches tab too, to show the optimal allocation across everyone who played.
4. **Between players**, the results screen can stay up; the next player reloads the page or opens
   the link again. Nothing personal stays in the browser once the profile is saved.

## Access and storage

Profiles are stored in the artifact's record store under access rules, not in the page:

- Applicants need **Contributor** access. Each can write only their own profile.
- Staff need **Editor** access. Only Editors and the owner can read profiles, reviews or host
  profiles.
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

Host profiles are kept at `hosts/<host id>`. No rule opens that path, so the first rule keeps it to
Editors and the owner. The full path layout is in `genstay/genstay-profile-fields.md`.

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

does the same for the quick demo: best, worst and timed-out runs, checks that no screen mentions
something the story hasn't set up, the two pages of questions, the match card and the match saved
with the run, the staff desk's PDF and JSON downloads, the Hosts and matches tab (the sample hosts
file, pasted spreadsheet rows, the CSV template, the suggested pairings and their reasons,
suggesting one, status and removal), the applicant's own profile download, a reading-time
estimate, and a market-day run: two players on one tablet account arriving on the Live board, in a
second tab, without anyone pressing Refresh.

    node scripts/test-matching.js

checks the matching on its own: the fifteen sample hosts, fourteen market-day participants against the
hosts written for them, every host's test purpose as a filter, both sides of the score and the
game's evidence, the allocation against brute force, the demo's closest match, reading and writing
host spreadsheets, and that both staff desks carry the same Hosts and matches code.

The PDF checks load html2canvas 1.4.1 and jsPDF 2.5.1 from cdnjs. Where cdnjs is blocked, put
`html2canvas.min.js` and `jspdf.umd.min.js` (from the npm packages' `dist/` folders) in a folder
and set `PDF_LIBS=/that/folder`.

## Before this goes to real applicants

- **Review.** The profile type is a reflection, not a decision. A person reads the written
  answers and the closing words. Budget about ten minutes per applicant.
- **First aid accuracy.** Have Days 11 and 14 checked by a first-aid trainer or nurse against
  current Australian guidance.
- **Validation.** Run the scenarios past placement coordinators and current homeshare residents.
- **Matching.** The filters and weights are a starting point. Check the suggestions against
  pairings coordinators know worked, and against ones that didn't, and adjust `HOST_WEIGHTS`,
  `STUDENT_WEIGHTS` and the filters in `game/genstay-matching.js`.
