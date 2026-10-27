# GenStay host profiles and matching (v2.0)

A host profile describes one older person (or couple) offering a room: the homeowner a student would live with. The staff desk's **Hosts and matches** tab reads host profiles, stores them, and compares every host with every applicant using `game/genstay-matching.js`. The quick demo uses the same matching to give each market-day participant a fictional homeowner.

`game/genstay-hosts.sample.json` holds eighteen fictional hosts in this format, covering every study area the games offer and all five campuses, with seven within a quarter of an hour of UTS (where most market-day players study). Each has a `meta.testPurpose` saying what it exercises (a falls risk, a female-only preference, a couple who need a driver, a host on hold…). The demo loads that file from beside the page, so replacing it changes the demo's homeowners.

Every field is optional. A missing field never rules a pairing out: that part of the score counts as half, and the reasons say what to check.

## Adding hosts

All on the Hosts and matches tab:

- **Add host files** takes JSON (one host, a list of hosts, or `{"hosts": [...]}` as in the sample file) or a CSV saved from the host spreadsheet.
- **Host template (CSV)** downloads the spreadsheet: every column heading, and one example row (Marg Hollis). Fill in one row per homeowner in Excel or Google Sheets, delete the example, save as CSV and add it.
- **Paste hosts** takes rows copied straight from that spreadsheet, heading row first. Copied cells arrive tab-separated, which the desk reads.

Adding a host with the same Host ID as one already stored replaces it, so an updated file can be added again. Without a Host ID, the desk makes one from the name and suburb (`H-joan-price-ashfield`), the same on every import. **Download hosts (CSV)** saves everything stored, ready to edit and add back. Another staff screen adding or changing a host shows up straight away.

Spreadsheet conventions:

- Headings can be in any order. Columns that aren't listed below are ignored, and the desk names them. A single **Name** column is split into first and last name.
- Lists take items separated by semicolons, or commas when there are no semicolons: `companionship; shared_meals`.
- Ranges read `18-40` (or one number).
- **Commute minutes** reads `UTS City Campus: 15; USyd Camperdown: 10`. The campus names must be the five the games offer: `UTS City Campus`, `USyd Camperdown`, `UNSW Kensington`, `Macquarie Uni`, `WSU Parramatta`.
- Dates can be `2027-02-01` or `1/2/2027` (day first). Yes/no columns take Yes, No, Y, N, True or False. Money can include a dollar sign.

## Fields

**F** = a hard filter (can rule a pairing out), **S** = scored, **D** = display and staff notes only.

| Spreadsheet heading | JSON path | Type | Use |
|---|---|---|---|
| Host ID | `meta.hostId` | text | Identity |
| Status | `meta.pairingStatus` | `active` `screening` `shortlisted` `on_hold` `matched` | F: hosts `on_hold` or `matched` get no new suggestions (and no demo participants) |
| Host fit, Updated | `meta.hostFit`, `meta.updatedAt` | text, date | D |
| First name, Last name, Preferred name, Pronouns | `host.*` | text | D (the preferred name is used in reasons: "Bob") |
| Age | `host.age` | number | D |
| Gender | `host.gender` | text | F: the student's homeowner preference |
| Household, Partner's name, age, gender | `host.householdType` (`single` `couple`), `host.partner.*` | text | D; a couple is "Nick and Eleni", and both genders count for the student's preference |
| Country of origin, Income support | `host.countryOfOrigin`, `host.incomeSupport` | text | D |
| Languages | `host.languages` | list | D |
| Former career | `host.formerCareer` | text | S: career link |
| Career field | `host.discipline` | `health` `carework` `allied_health` `social_work` `psychology` `education`, or a field outside the program (`law` `engineering` `business` `design` `science`) | S: career link (worked out from the former career if blank) |
| Nominee, relationship, location, pays | `familyNominee.*` | text, yes/no | D |
| Suburb, Postcode, Home type | `home.suburb`, `home.postcode`, `home.homeType` | text | D |
| Rooms offered | `home.roomsOffered` | number (default 1) | How many students one host can be paired with |
| Sharer bathroom | `home.sharerBathroom` | text (`private`, `shared with host`…) | F: a student's "own bathroom" deal-breaker; a talking point |
| Stairs, Accessibility features | `home.stairs`, `home.accessibilityFeatures` | yes/no, list | F: a student's mobility needs, unless there's a lift or step-free access |
| Home ready | `home.readiness` | `ready` or a note | D: a caution until ready |
| Commute minutes | `placement.campusCommuteMins` | campus: minutes | S (25 of the student's side), and F past the student's limit (an hour if they didn't give one) |
| Transport nearby | `placement.transportNearby` | list | D ("15 minutes by bus and light rail") |
| Available from, Flexible by (weeks) | `placement.availableFrom`, `placement.availableFlexWeeks` | date, number | S, and F more than 8 weeks apart beyond both sides' flexibility |
| Shortest stay (months), Open to extending | `placement.minStayMonths`, `placement.openToExtend` | number, yes/no | F: a shorter stay |
| Hobbies, Can offer, Wants to learn | `interests.*` | list | S: shared interests, what the host can teach, what the student can help the host learn |
| Sharer gender | `preferences.sharerGender` | `female` `male` `any` | F |
| Sharer age | `preferences.sharerAgeRange` | range | F |
| Preferred study areas | `preferences.preferredDisciplines` | list of the program's six fields | S (areas outside the program count as no preference, since no student can meet them) |
| Student types | `preferences.studentTypes` | `domestic` `international` | F |
| Other sharers | `preferences.otherLodgers` | `none` `open` `prefer` | F: a host with two rooms who prefers two sharers, and a student who wants to be the only one |
| Languages welcome | `preferences.languagesWelcome` | list | S |
| Smoker, Smoke-free home | `household.smoker`, `household.smokeFreeHome` | yes/no | F, both ways |
| Pets | `household.pets` | list (blank or `none` for no pets) | F: allergies, and students who'd rather not live with pets |
| Diet | `household.diet` | text | D: kosher, halal or vegetarian kitchens are a talking point |
| Deal-breakers | `household.dealbreakers` | list | F where the student's answers can test it (smoking, pets, guests, someone who keeps to their room); otherwise a talking point |
| Hours a week, Paid extra hours a week | `support.hoursPerWeek`, `support.paidAddOn.hoursPerWeek` | range, number | F: fewer hours than the host hopes for |
| Help wanted | `support.helpWanted` | list of codes (below) | S: 25 of the host's side |
| Best times | `support.bestTimes` | list | S |
| Nights at home a week | `support.nightsHomePerWeek` | range | F against the student's answer |
| Needs a driver, Car for the sharer | `support.needsDriver`, `support.carAvailableForSharer` | yes/no | F: a student with no licence, or who didn't offer lifts |
| Out of scope | `support.outOfScope` | list | D: what the sharer is never asked to do |
| Payment a week | `support.lodgerPaymentWeekly` | number (AUD) | F: over the student's budget; S |
| Bedtime, Wake time, Quiet after | `lifestyle.*` | `22:00` | S: routine |
| Weekdays, Weekends, Social note, Communication | `lifestyle.*` | text | D |
| Time together (1-5) | `lifestyle.socialLevel` | 1 (independent) to 5 (lots of company) | S: both sides |
| Guests, Tidiness | `lifestyle.guests`, `lifestyle.tidiness` | text | S: routine |
| Motivation | `screening.motivation` | list | D |
| Risk flags | `screening.riskFlags` | `fall_risk` `recent_bereavement` `mild_memory_loss` `remote_nominee` `shared_bathroom` … | S: weighs the student's game evidence (below); F for low safety awareness with a falls risk |
| Watch-point | `screening.watchPoint` | text | D |

The JSON can also carry `checks` (identity, references, home visit…: anything not `cleared` is listed as a check still to clear) and `familyNominee.contact`.

**Help wanted codes:** `companionship`, `shared_meals`, `tech_help`, `grocery_shopping`, `evening_presence`, `accompany_appointments`, `pet_care`, `light_housework`, `cooking`, `errands`, `gardening`, `driving`, `outings`. They match the students' answers by meaning ("Company and conversation", "Cooking shared meals", "Being home in the evenings", "Appointments and outings", "Lifts in the homeowner's car"…). Free text in the interest lists matches on meaning too ("Choir" matches Music, "Sydney history" matches Local history), or on the words.

## How a pairing is judged

`genstay-matching.js` compares each host with each applicant's GenStay profile, with the staff review laid over it. Every pairing is judged from both sides.

**1. Filters.** Any clash rules the pairing out, and the desk says which, in words for staff and (in the demo) for the participant:

- **Availability and screening:** the applicant is matched elsewhere, on hold or not suitable; the host is on hold or has a sharer. No game result, The Transactional Guest, threatening language or drug references, or unfinished matching questions.
- **The game's answers** (`ANSWER_GRADES` in the code). Every tagged answer in both games is graded, and `scripts/test-matching.js` fails if a new one isn't. Any of these counts on whichever day it was chosen (from `screening.choices`), even if a later choice recovers:

  | Grade | Answers | Effect |
  |---|---|---|
  | Fail | lifting Marg straight up after her fall (`fall_lifted`); walking away and leaving her on the ground (`fall_dismissed`); shaking her and ringing her son before 000 (`emergency_shaken`); giving her water and sitting her up (`emergency_water`) | Rules a placement out on its own |
  | Part fail | taking her phone and deleting the scam text (`phone_taken`); leaving her alone with it (`scam_ignored`); "at least she's in a better place" (`grief_dismissed`); "I pay rent" (`friction_defensive`); running next door before calling 000 (`emergency_delayed`); in the demo's dispute follow-up, telling Marg about a guest only on the night (`dispute_short_notice`), having one stay anyway (`dispute_my_room`), ignoring her note asking to talk (`dispute_avoided`), telling her son she overreacted (`dispute_blamed`) or hanging up on him (`dispute_hung_up`); and in the full game, lecturing her about the remark (`boundary_lecture`), keeping the fall secret (`fall_secret`), ringing David behind her back (`fall_told_behind_back`), ignoring the step (`step_ignored`) or fixing it unasked (`step_diy`), deflecting David (`david_deflected`), leaving her alone for the ambulance (`emergency_left`); and in the demo's final question, not remembering the detail Marg shared on the first evening (`recall_missed`) | `PART_FAIL_LIMIT` (3) of them rule a placement out; one or two are a caution on every pairing |
  | Fine | everything else, including the more independent choices (eating in your room, giving her space, letting a remark pass), freezing or running out of time, and keyword-matched written answers | Weighs in the score only, through the meters and the evidence above |
- **The host's requirements:** sharer gender, age range and student type; smoking; pets; two sharers wanted; hours; nights at home; a driver; a falls risk with low safety awareness (Awareness 3 or less); deal-breakers the student's answers clash with; stairs with a mobility need.
- **The student's requirements:** homeowner gender (a couple counts both partners); a smoke-free home; the payment over budget; a minimum stay longer than theirs; their own deal-breakers; a commute past their limit; dates too far apart.

**2. Fit for the host** (out of 100): does the student give what this host needs?

| Part | Weight | What counts |
|---|---|---|
| Help | 25 | How much of the help wanted the student offers, and overlap in best times |
| Care needs | 20 | The host's particular needs against how the student behaved in the game (below), with the screening profile, Respect and Reliability |
| Time together | 20 | How close the two 1–5 answers are; for a sociable host, the student's Connection meter |
| Teaching | 10 | Whether the student can help with what the host wants to learn (podcasts, video calls…) |
| Study area | 10 | The host's preferred study areas |
| Routine | 10 | Bedtimes against quiet hours, guests, tidiness |
| Languages | 5 | A language the host welcomes |

**The game's evidence.** Each landmark choice in the game carries a tag (`screening.landmarks[].tags`) saying how the student handled that moment, from 0 to 1. A host's risk flags decide which moments matter:

| Host's risk flag | Evidence weighed |
|---|---|
| `fall_risk` | Awareness, how they handled Marg's fall (Day 11) and the emergency (Day 14). Lifting her straight up counts against them; keeping her still and checking for injury counts for them |
| `recent_bereavement` | How they met Marg's grief when Dorothy died (Day 6), and Connection |
| `mild_memory_loss` | Respect, Reliability, and how they handled the biased remark calmly (Day 9) |
| `remote_nominee` | Reliability (nobody nearby to step in) |

**3. Fit for the student** (out of 100): does the home suit them?

| Part | Weight | What counts |
|---|---|---|
| Commute | 25 | Minutes to their campus: full marks up to 15, falling to nothing at 65 |
| Interests | 20 | Shared hobbies, and things they want to learn that the host can teach (worth more) |
| Career | 15 | The host's former field against their study area and career goal, weighted by whether they'd like a homeowner from their field; more if the host offers career advice |
| Time together | 15 | The same comparison as the host's side |
| Cost | 10 | The payment against their budget |
| Dates | 10 | Weeks apart beyond both sides' flexibility |
| Motivation | 5 | Why they came (company, a quiet space, saving money, learning) against the home |

**4. Overall** = the geometric mean of the two sides. A pairing scores well only when it suits both people: 90 for one side and 40 for the other gives 60, not 65. Strong is 80 and over, Good 65 to 79, Possible 50 to 64, Weak under 50. Each card shows both sides' numbers, what's good (✓), what to check (!), anything that rules it out (✕), and a score breakdown.

**5. Suggested pairings: the best allocation overall.** One student per room. The desk makes the set of pairings with the highest total score (an optimal assignment, the Hungarian method), not first come first served, so someone may be suggested for their second-best host when their best suits another applicant much better; the card says so ("Pat's 2nd choice"). Only pairings scoring at least `MIN_SCORE` (65, the start of a Good match) are suggested; an applicant whose best is lower is listed as **shortlisted, waiting for a suitable host**, with their best score so far. Pairings staff have already made (shortlisted, intro booked or matched for a homeowner) are kept first, whatever their score, and staff can still suggest a weaker pairing by hand (the card says it's under the bar). If staff have shortlisted more applicants for a host than it has rooms, the best takes the room and the rest are listed under **Also paired by staff**. Hosts and applicants left over are listed with the reasons.

**Suggest this pairing** writes the applicant's review: their status becomes Shortlisted (unless it's already further along) and the host becomes their suggested homeowner, shown in their profile. Typing a host's name into an applicant's **Suggested homeowner** box links them the same way. Nobody is contacted.

**The demo's outcome.** `bestMatch()` gives one participant one of three outcomes, without using rooms up (at a market stall everyone can be paired with the same homeowner):

- `matched`: their best host passes every filter and scores at least 65.
- `waiting`: shortlisted, waiting for a suitable host. Their best scores under 65 (`shortfall` names the two parts that held it back), or no host passes every filter (`standsInWay` says why, for the closest).
- `screened_out`: a screening result or an unsafe answer rules a placement out. No host is given; `screenedOut` carries the reasons, with what to do instead in words for the participant.

A host on hold is never offered.

The weights and filters are a starting point, not a finished policy. Check them with placement coordinators against pairings that worked and pairings that didn't, and change `HOST_WEIGHTS`, `STUDENT_WEIGHTS` and the filters in `genstay-matching.js` to suit.

## Storage

Host profiles live in the artifact's record store at `hosts/<host id>`. Nothing in the access rules opens that path, so it falls under the root rule: only Editors and the owner can read or write it. Applicants can't see host profiles. The demo's fictional hosts come from the published `genstay-hosts.sample.json`, not from the record store.

## For developers

```js
GenStayMatch.score(student, host)       // {eligible, score, band, hostFit, studentFit, blockers, strengths, cautions, forStudent, talkAbout, parts: {host, student}}
GenStayMatch.matchAll(students, hosts)  // {method, hosts, students, pairings, alsoPaired, unmatchedHosts, unmatchedStudents}
GenStayMatch.bestMatch(student, hosts)  // {host, result, closest, setAside, ranked, standsInWay}, or null with no available host
GenStayMatch.assign(cost)               // the Hungarian method: the column for each row, at the lowest total cost
GenStayMatch.parseHosts(text)           // {hosts, problems} from JSON, CSV or tab-separated text
GenStayMatch.hostsToCsv(hosts)          // the spreadsheet; hostCsvTemplate() for a blank one with an example row
GenStayMatch.hostStatus(host)           // {code, label, available}
```

A student is `{id, name, profile, suggestedHostId}`. In node: `const M = require("./game/genstay-matching.js")`. `node scripts/test-matching.js` checks the sample hosts, fourteen market-day participants against the hosts written for them, every filter, the scoring, the allocation against brute force, and the spreadsheet round trip.
