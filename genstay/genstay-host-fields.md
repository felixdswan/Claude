# GenStay host profiles and matching (v1.0)

A host profile describes one homeowner offering a room: the older person a student would live with. The staff desk's **Hosts and matches** tab reads host profiles, stores them, and compares every host with every applicant using `game/genstay-matching.js`. `genstay-host.sample.json` is a complete example (Marg Hollis, the homeowner in the game).

Every field is optional. A missing field never rules a pairing out: that part of the score is counted as half, and the reasons say what to check.

## Adding hosts

There are three ways in, all on the Hosts and matches tab:

- **Host template (CSV)** downloads a spreadsheet with every column heading and one example row. Fill in one row per homeowner in Excel or Google Sheets, delete the example, save as CSV, and add it with **Add host files**.
- **Paste hosts** takes rows copied straight from that spreadsheet, heading row first. Copied cells arrive tab-separated, which the desk reads.
- **Add host files** also takes JSON: one host, a list of hosts, or `{"hosts": [...]}`.

Adding a host with the same Host ID as one already stored replaces it, so an updated spreadsheet can be added again. Without a Host ID, the desk makes one from the name and suburb (`H-joan-price-ashfield`), which stays the same on every import. **Download hosts (CSV)** saves everything stored, ready to edit and add back.

Spreadsheet conventions:

- Headings can be in any order, and columns that aren't listed below are ignored (the desk names them). A single **Name** column is split into first and last name.
- Lists take items separated by semicolons, or commas when there are no semicolons: `Gardening; Cooking shared meals`.
- A nearby campus can carry its travel time: `UTS City campus (25 min); University of Sydney, Camperdown (20 min)`.
- Dates can be `2027-02-01` or `1/2/2027` (day first). Yes/no columns take Yes, No, Y, N, True or False. Rent can include a dollar sign.

## Fields

| Spreadsheet heading | JSON path | Type | Used for |
|---|---|---|---|
| Host ID | `meta.hostId` | text | Identity (made from the name and suburb if blank) |
| Status | `meta.status` | `active` `paused` `matched` | Only `active` hosts get new suggestions |
| First name, Last name, Preferred name | `host.firstName`, `host.lastName`, `host.preferredName` | text | Display |
| Age | `host.age` | number | Display |
| Gender | `host.gender` | text (`female`, `male`, or another identity) | **Filter**: the student's homeowner preference |
| Suburb, Region | `host.suburb`, `host.region` | text | **Score**: the student's preferred areas |
| Languages | `host.languages` | list | Display |
| Former career | `host.formerCareer` | text | **Score**: career link |
| Career field | `host.careerField` | `health` `carework` `allied_health` `social_work` `psychology` `education` `other` | **Score**: career link (worked out from the former career if blank) |
| Phone, Email | `host.phone`, `host.email` | text | Staff only |
| Room free from | `home.availableFrom` | date | **Score**, and **Filter** beyond 12 weeks either way |
| Shortest stay (months) | `home.minStayMonths` | number | **Filter** |
| Longest stay (months) | `home.maxStayMonths` | number | **Score** |
| Rent per week | `home.rentWeekly` | number (AUD) | **Filter**: over the student's budget |
| Student rooms | `home.rooms` | number (default 1) | How many students one host can be paired with |
| Students already living there | `home.otherStudents` | number | **Filter**: students who want to be the only one |
| Nearby campuses | `home.nearCampuses` | list of campuses, each with optional minutes | **Score**, and **Filter** past the student's stretch commute |
| Smoke-free home | `home.smokeFree` | yes / no | **Filter**: students who smoke or vape |
| Homeowner smokes | `home.hostSmokes` | yes / no | **Filter**: students who need a smoke-free home |
| Pets | `home.pets` | list (`Cat`, `Dog`…; blank or `None` for no pets) | **Filter**: pet allergies, and students who'd rather not live with pets |
| Accessibility | `home.accessibility` | text | Display |
| Student gender wanted | `wants.studentGender` | `female` `male` `any` | **Filter** |
| Hours a week from / to | `wants.hoursPerWeek.min` / `.max` | number | **Filter** when the student offers fewer; **Score** |
| Help wanted | `wants.helpWanted` | list | **Score**: what the student will help with |
| Help that is essential | `wants.mustHave` | list | **Filter** when the student said they won't do it; a caution when they didn't tick it |
| Best times | `wants.bestTimes` | list | **Score** |
| Time together (1-5) | `wants.socialLevel` | 1 (independent) to 5 (lots of company) | **Score**: the student's own 1–5 answer and their Connection meter |
| Preferred study areas | `wants.disciplines` | list of the career fields above | **Score** |
| Language the student must speak | `wants.language` | text | **Filter** |
| Interests | `about.interests` | list | **Score**: shared hobbies |
| Can teach or share | `about.canTeach` | list | **Score**: what the student wants to learn |
| Routine, Quiet after, Diet, Guests | `about.routine`, `about.quietAfter`, `about.diet`, `about.guests` | text | Display |
| Falls risk | `care.fallsRisk` | yes / no | **Filter** for students with low safety awareness; **Score** |
| Care notes | `care.notes` | text | Staff only |
| Emergency contact | `care.emergencyContact` | text | Staff only |
| Notes | `meta.notes` | text | Staff only |
| Updated | `meta.updatedAt` | date | Display (set on import if blank) |

**Use the game's wording in the lists where you can.** Help: Company and conversation, Cooking shared meals, Tech and phone help, Gardening, Bins and light chores, Shopping and errands, Lifts in the homeowner's car, Pet care. Interests: Gardening, Cooking and baking, Reading, Music, Sport and fitness, Walking, Crafts, Board games and puzzles, Films and TV, Art. Can teach or share: Gardening, Family recipes, Local history, Life advice, Crafts, Card games. Other words still match on their meaning ("Choir" matches Music, "Crossword" matches Board games and puzzles, "Recipes" matches Cooking), or on the exact words.

## How a pairing is judged

`genstay-matching.js` compares each host with each applicant's GenStay profile, with the staff review laid over it.

**1. Filters.** Any of these rules the pairing out, and the desk says which:

- The applicant is matched elsewhere, on hold or marked not suitable; or the host is paused or already has a student.
- Screening: no game result, The Transactional Guest, or threatening language or drug references. Unfinished matching questions.
- Gender, both ways: the homeowner the student will live with, and the student the homeowner asked for.
- Smoking, pets, other students already in the home, rent over budget, a stay shorter than the host's minimum, fewer hours than the host hopes for, essential help the student said they won't give, a language the student doesn't speak.
- A falls risk with low safety awareness in screening (Awareness 3 or less).
- A commute past the student's stretch limit, or move-in dates more than 12 weeks apart (beyond the student's flexibility).

**2. A score out of 100,** in eight parts:

| Part | Points | What counts |
|---|---|---|
| Help | 20 | How much of the host's wanted help the student offers; essential help they didn't tick lowers it; overlap in best times |
| Time together | 15 | How close the two 1–5 answers are, and the student's Connection meter against the host's hopes; coming for company adds a little for a sociable host |
| Screening | 15 | The screening profile (an Independent Tenant suits a quieter home), Respect and Reliability; strong Awareness helps with a falls risk |
| Interests | 15 | Shared hobbies, things the student wants to learn that the host can teach (worth more), and skills the student can share |
| Career | 10 | The host's former field against the student's area of study and career goal, weighted by whether the student wants a homeowner from their field; the host's preferred study areas |
| Location | 10 | The student's campus on the host's list of nearby campuses (travel time against the student's preferred commute), or the host in a preferred area |
| Dates | 10 | How far apart the move-in dates are, and the length of stay against the host's longest |
| Hours | 5 | The student offers at least the hours the host hopes for |

Strong is 80 and over, Good 65 to 79, Possible 50 to 64, Weak under 50. Each pairing lists what's good about it (✓), what to check (!), and anything that rules it out (✕). Unknowns score half.

**3. Suggested pairings.** One student per room, best scores first. Pairings staff have already made (an applicant shortlisted, intro booked or matched for a homeowner) are kept and come first. If staff have shortlisted more applicants for a host than it has rooms, the best takes the room and the rest are listed under **Also paired by staff**, with anything that would rule them out. Hosts with nobody suitable are listed with the most common reasons.

**Suggest this pairing** writes the applicant's review: their status becomes Shortlisted (unless it's already further along) and the host becomes their suggested homeowner, which shows in their profile. Typing a host's name into an applicant's **Suggested homeowner** box links them the same way. Nobody is contacted.

The weights and filters are a starting point, not a finished policy. Check them with placement coordinators against pairings that worked and pairings that didn't, and change `WEIGHTS` and the filters in `genstay-matching.js` to suit.

## Storage

Host profiles live in the artifact's record store at `hosts/<host id>`. Nothing in the access rules opens that path, so it falls under the root rule: only Editors and the owner can read or write it. Applicants can't see host profiles.

## For developers

```js
GenStayMatch.score(student, host)       // {eligible, score, band, blockers, strengths, cautions, parts}
GenStayMatch.matchAll(students, hosts)  // {hosts, students, pairings, alsoPaired, unmatchedHosts, unmatchedStudents}
GenStayMatch.parseHosts(text)           // {hosts, problems} from JSON, CSV or tab-separated text
GenStayMatch.hostsToCsv(hosts)          // the spreadsheet
GenStayMatch.hostCsvTemplate()          // headings and one example row
GenStayMatch.blankHost()                // the empty shape
```

A student is `{id, name, profile, suggestedHostId}`. In node: `const M = require("./game/genstay-matching.js")`. `node scripts/test-matching.js` checks every filter, the scoring, the pairing and the spreadsheet reading.
