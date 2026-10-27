# GenStay Screener

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

A **demo** (`game/genstay-screener.demo.html`) plays four short scenarios and a final memory
question, asks two short pages of questions, then pairs each player with a fictional homeowner,
in about two minutes. It's built for a live market-day stall: see
[Quick demo](#quick-demo) and [Market day](#market-day) below.

## What's here

    game/genstay-screener.html               the game and the staff review desk, one file, no build step
    game/genstay-screener.demo.html          the quick demo, with its own staff desk, one file
    game/genstay-profile-template.html   the GenStay profile template the desk shows each profile in
    game/genstay-matching.js             the matching: reads host profiles, filters and scores pairings from both sides, allocates the best
    game/genstay-hosts.sample.json       eighteen fictional hosts: the demo's market-day homeowners, and examples of the host format
    genstay/genstay-profile-fields.md    the profile data contract, and how the game fills and stores it
    genstay/genstay-profile.sample.json  a complete example profile
    genstay/genstay-host-fields.md       the host profile format, the host spreadsheet, and how matching works
    scripts/test-playthrough.js          automated runs of the full game in a real browser
    scripts/test-demo.js                 automated runs of the quick demo, the Hosts and matches tab, and the live board
    scripts/test-matching.js             checks for the matching (no browser needed)
    scripts/browser-harness.js           shared test setup: a local server and a stand-in for the artifact runtime
    design/pepaws-porch.html             the original design bible (from the earlier Bruce version, when the game was Pepaws Porch)

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
- **Delete applicant** removes the open applicant for good: their profile, every run and the
  staff review. **Delete shown** does the same for everyone in the list as searched and filtered
  (to clear test runs after a market day, for example). Both ask for a second click, and other
  staff screens update straight away.
  (The demo's desk lists every run as its own applicant instead: see [Market day](#market-day).)
- The queue follows the record store live: new profiles appear as applicants finish, without
  pressing **Refresh**.

### Hosts and matches

The desk's second tab holds the homeowners' profiles and suggests pairings.
`genstay/genstay-host-fields.md` describes every field and exactly how pairings are judged.

- **Adding hosts.** **Load sample hosts** adds the fictional hosts published beside the page
  (`genstay-hosts.sample.json`, in the demo), asking first if it would replace hosts already
  there; the button only appears where that file is published. **Add host files** takes a JSON
  hosts file (like `game/genstay-hosts.sample.json`)
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
- **Answers are graded, and poor ones screen people out.** Every answer in both games has been
  reviewed (`ANSWER_GRADES` in `genstay-matching.js`):
  - **Fail (4):** rules out automatic matching on its own, because it would put a homeowner at
    real risk: lifting Marg straight up after her fall, walking away and leaving her on the
    ground, shaking her and ringing her son before 000 when she collapses, and giving her water
    and sitting her up.
  - **Part fail (17):** a concern, such as taking over Marg's phone or leaving her alone with a
    scam text, answering a complaint with "I pay rent", hanging up on her son, running next door
    before calling 000, or (in the full game) telling her a friend who just died is "in a better
    place" or keeping her fall secret. **Three part fails** rule out automatic matching too; one
    or two show staff a caution on each pairing.
  - **Fine (69):** everything else. A warmer or a more independent style never counts against
    anyone, and keyword-matched written answers are left to staff.

  Every choice on every day counts, and a later recovery doesn't undo the first instinct. Staff
  see each answer and its day; the participant sees the reasons in plain words, with what to do
  instead.
- **Suggested pairings** are the best allocation overall (an optimal assignment, the Hungarian
  method): one applicant per room, making the most suitable pairings in total, so someone may be
  suggested for their second-best host when their best suits another applicant much better. The
  card says so. Only pairings scoring **65 or more** (a Good match) are suggested: an applicant
  whose best is lower is listed as shortlisted, waiting for a suitable host. Pairings staff have
  made are kept first. Applicants screened out (The Transactional Guest, threatening language,
  drug references or an unsafe answer) are never suggested; hosts on hold or with a sharer get no
  new suggestions.
- **Each card** shows the score and both sides' fit, what's good (✓), what to check (!), anything
  that rules it out (✕), and a score breakdown.
- **Select a host** to see their details, every applicant ranked for them, and who was ruled out
  and why. Change their status (available, in screening, shortlisted, on hold, has a sharer) or
  **Delete host** there. **Delete all hosts** clears the list. Both ask for a second click.
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

`game/genstay-screener.demo.html` is a separate, shorter version for demonstrations and quick trials.
The full game is unchanged.

Built for a market-day stand with three minutes a player: about two minutes for the scenarios
and the questions, leaving room for slower readers.

- **Four scenarios.** Each tests one thing staff care about:
  1. **The conversation.** Over tea, Marg mentions her career (the applicant's own field) and one
     detail from it: a nurse's fob watch, a teacher's brass school bell, the lemon slice a carer
     baked for her clients every Friday. Do they ask about it, swap stories, or keep to themselves?
  2. **Agency.** A scam text. Do they walk her through the warning signs, or take her phone and
     deal with it themselves?
  3. **A dispute, in two stages.** Everyone answers the first: the morning after a loud late night.
     The second follows from that answer: after agreeing to give notice, a friend wants to stay
     (do they keep the agreement?); after waiting, Marg leaves a note asking to talk; after "I pay
     rent", her son rings. All three lead on to the last scenario.
  4. **The emergency.** Marg falls and hits her head. Do they keep her still and call 000?
- **A final question: were they listening?** A week later, Marg is home from hospital, and the
  player is asked to recall the detail from the first evening (four options, which follow the area
  of study). A wrong answer counts as a part fail, and staff see what was answered.
- **A slide to set each scene, then the question.** Each scenario opens on an untimed slide, then
  the question with a one-line reminder of the situation and 25 seconds to answer, then Marg's
  reaction. Six questions in all. Pausing pauses the timer. A timed-out question counts as no
  answer; at the dispute, it counts as waiting, so the follow-up is Marg's note.
- **The answers count.** Every option is graded (see Hosts and matches): moving Marg, or giving her
  water, screens a player out on its own; taking over her phone, "I pay rent", hanging up on her son,
  forgetting what Marg shared and the like add up, three to a screen-out.
- **A first name and an area of study** to start. No email.
- **Two short pages of matching questions, all answered by the player.** Nothing is filled in for
  them. Only questions the matching uses are asked, most of them one tap. First the filters: age,
  gender, campus, move-in month, length of stay, rent, homeowner gender, smoking and pets. Then the
  scores: time together, hours a week, the help they'd offer, hobbies, whether they'd like a
  homeowner from their field, things to learn and languages (the last three optional).
- **A curated outcome, one of three.** The results screen uses the same matching as the staff
  desk, against the fictional hosts in `genstay-hosts.sample.json`:
  - **Matched:** their best homeowner, scoring 65 or more: name, age, suburb, former career, the
    score, up to four reasons in plain words ("Bob was a paediatric surgeon, and you're heading
    for medicine") and anything to talk through. It says the homeowner is made up. Everyone gets
    their own best match (rooms aren't used up at a stall).
  - **Shortlisted, waiting for a suitable host:** no homeowner scores 65 yet (or none passes every
    check). The screen gives the closest score and what held it back, without naming anyone.
  - **No placement this time:** an unsafe answer, or a screening result that keeps people out of
    matching. The screen says which choices, and what to do instead (keep her still, call 000
    first), and that a coordinator would talk it through in a real application.

  The Live board shows the same outcome, with first names only and no reasons for anyone not
  placed. If the hosts file can't load within six seconds, the results show without an outcome.
- **About two minutes in all, of the three allowed.** Four scene slides, six questions and six
  reactions (432 words), then the two pages of questions (about 17 taps). Two timed runs of the
  earlier version took about 1 min 10 s; on the same scale, a run now takes about 2 min 5 s.
- **The same GenStay profile.** It fills fewer fields (no written answers, no contact details).
  Profile ids start with `DEMO-`, the flags include `quick_demo` (and `missed_timer` if a timer
  ran out), and the watch-point says it was the quick demo. Each scenario keeps a day number from
  the full fortnight (1, 4, 8, 10 and 14, and 15 for the final question) and is saved as a titled
  landmark, so staff see every answer in the template.
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
   choose **Live board**, then **Full screen**. The Hosts and matches tab holds the same fictional
   hosts (**Load sample hosts** if it's empty), to show the optimal allocation across everyone
   who played. After a practice round, **Delete shown** on the Applicants tab clears the board.
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

    npx http-server game -p 8080      # then open http://localhost:8080/genstay-screener.html

Without the artifact runtime there is no record store. The game still plays end to end and
offers the download fallback, and the desk shows profile files you add without saving them.

    node scripts/test-playthrough.js /tmp/genstay-screener-out

plays a best run, a worst run, a hostile run and a timed-out run against a stand-in record store,
checks each stored profile against the template's contract, exercises the staff desk and the PDF
downloads, and saves screenshots of every scene.

    node scripts/test-demo.js /tmp/genstay-screener-demo-out

does the same for the quick demo: best, worst and timed-out runs, checks that no screen mentions
something the story hasn't set up, every branch of the dispute, Marg's detail and the final question for every area of study, both questions pages (nothing filled in, every answer checked), the match card and the match saved
with the run, the staff desk's PDF and JSON downloads, the Hosts and matches tab (the sample hosts
file, pasted spreadsheet rows, the CSV template, the suggested pairings and their reasons,
suggesting one, status and removal), the applicant's own profile download, an estimate of a whole
run's length against the three minutes allowed (calibrated on two timed runs of the earlier
version), and a market-day run: two players on one tablet account arriving on the Live board, in a
second tab, without anyone pressing Refresh.

    node scripts/test-matching.js

checks the matching on its own: the eighteen sample hosts, fourteen market-day participants against the
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
