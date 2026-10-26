# GenStay Matchmaking Profile: data contract (v1.2)

The receiving template (`genstay-profile-template.html`) is blank until it gets one JSON object in the shape below. Every field is optional. Missing fields show as "—", and the toolbar counts how many of the 82 tracked fields have arrived. `genstay-profile.sample.json` is a complete worked example. Run `GenStayProfile.blank()` in the console to get the empty shape.

Unknown keys are ignored and logged to the console (`[GenStay] Unknown field "studnet"…`), so typos show up while you're wiring it in.

v1.2 adds `screening.choices`. v1.1 added `interests.fieldMentor`, `screening.landmarks[].tags` and the five campus keys. Host profiles (the homeowners) and the matching on the staff desk are described in `genstay-host-fields.md`.

## Sending data in

Use `load` for a full profile (it replaces everything) and `update` for one stage at a time (it merges). That way the pre-game quiz, the game and the post-game quiz can each send their own part. Inside an `update`, arrays are replaced whole, not appended to.

| Route | Use when | How |
|---|---|---|
| JS API | Template and game run on the same page | `GenStayProfile.update({ student: {...} })` |
| Inline global | Server renders the page | `<script>window.GENSTAY_PROFILE = {...}</script>` placed before the template's script |
| postMessage | Template sits in an iframe or a window the game opened | `win.postMessage({ type: 'genstay:profile', mode: 'update', data }, origin)` |
| Link | Hand off by URL | `template.html#data=<base64url JSON>`, built with `GenStayProfile.link(data)` |
| JSON file / endpoint | Profiles are stored server-side | `template.html?src=/profiles/GS-2027-0142.json` |
| Browser storage | Game and template are on the same site in different tabs | `localStorage.setItem('genstay:profile', JSON.stringify(data))` updates open tabs live |

**postMessage handshake.** Once the template can receive, it posts `{ type: 'genstay:ready' }` to its parent or opener. Wait for that before you send anything. After each message it replies `{ type: 'genstay:ack', status: { filled, total, … } }`. It also accepts `genstay:clear` and `genstay:ping`.

```js
const win = window.open('genstay-profile-template.html');            // or iframe.contentWindow
addEventListener('message', e => {
  if (e.data?.type === 'genstay:ready') win.postMessage({ type: 'genstay:profile', mode: 'load', data: profile }, '*');
  if (e.data?.type === 'genstay:ack') console.log('profile filled', e.data.status.filled, '/', e.data.status.total);
});
```

**Building a link from the game without the template loaded:**

```js
const b = new TextEncoder().encode(JSON.stringify(profile)); let s = '';
for (const x of b) s += String.fromCharCode(x);
const url = 'genstay-profile-template.html#data=' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
```

**Settings.** Set these before the template script runs: `window.GENSTAY_CONFIG = { allowedOrigins: ['self', 'https://your-game.example'], persist: false }`.

- postMessage only accepts the template's own origin until you add the game's origin.
- `persist` is off by default because the profile holds contact details.

**URL options.**

| Option | Effect |
|---|---|
| `?view=family` | Hides staff-only rows |
| `?keys` | Prints the data path under every label |
| `?demo` | Loads the sample |
| `?embed` | Hides Print and Export JSON (used inside the game's staff desk, where a sandboxed frame can't print or download) |

**Outputs.**

| Output | What it does |
|---|---|
| `GenStayProfile.get()` | Returns the current data |
| `onChange(fn)` | Calls `fn` after every render |
| `genstay:profile:rendered` | Window event fired after each render |
| Download PDF / Print / Export JSON | Toolbar buttons. Download PDF makes an A4 file that looks like the page, breaking between rows; it loads html2canvas and jsPDF from cdnjs, so offline use Print and choose Save as PDF |
| `GenStayProfile.pdf({profiles?, view?})` | Resolves with the PDF bytes. Pass several profiles to get one PDF with each starting on a new page |
| `{type:'genstay:pdf', id, profiles?, view?}` | The same over postMessage; replies `genstay:pdf:progress` and `genstay:pdf:done` with `{ok, data}` |

**Safety.**

- Text is always inserted as text, never as HTML, so free-text answers can't inject markup.
- `photoUrl` only accepts `https://`, relative paths, or `data:image/…`.

## Fields

The Source column is a suggestion for which stage captures each field. Pre = questionnaire before the game, Post = questionnaire after it, Game = the 14-day simulation, Staff = entered by the team. Use says how matching treats the field: **Filter** = hard filter (a clash removes the match), **Score** = weighted in pairing, **Review** = for staff judgement, **Display** = profile only.

### meta

| Path | Type / values | Source | Use |
|---|---|---|---|
| `meta.profileId` | string | Staff | Display |
| `meta.updatedAt` | ISO date `2027-05-06` | Staff | Display |
| `meta.suggestedFor` | string (homeowner name) | Staff | Display |
| `meta.pairingStatus` | `new` `screening` `shortlisted` `intro_booked` `matched` `on_hold` `not_suitable` | Staff | Display |
| `meta.stages.preGame` / `.game` / `.postGame` | boolean (`game` is inferred from `screening.profile` if left out) | Each stage | Display |

### student

| Path | Type / values | Source | Use |
|---|---|---|---|
| `firstName`, `lastName`, `preferredName` | string | Pre | Display |
| `pronouns`, `gender` | string | Pre | Filter (vs homeowner's preference) |
| `age` | number | Pre | Display |
| `email`, `phone` | string (staff only) | Pre | Display |
| `photoUrl` | URL | Pre | Display |
| `countryOfOrigin`, `hometown` | string | Pre | Score |
| `languages` | string[] | Pre | Score |
| `studentType` | `domestic` `international` | Pre | Review (visa work-hour limits) |
| `university`, `course`, `yearOfStudy` | string / number | Pre | Display |
| `discipline` | `health` `carework` `allied_health` `social_work` `psychology` `education` `other` (the program takes students from these fields only) | Pre | Score (selects the homeowner's career template) |
| `work.role`, `work.hoursPerWeek`, `work.schedule` | string / number | Pre | Score (time available) |
| `emergencyContact.name` / `.relationship` / `.phone` | string (staff only) | Pre | Display |

### placement

| Path | Type / values | Source | Use |
|---|---|---|---|
| `campus` | `UTS City Campus` `USyd Camperdown` `UNSW Kensington` `Macquarie Uni` `WSU Parramatta` `Another campus` (the keys of the hosts' `placement.campusCommuteMins`; older free text is recognised) | Pre | Filter + Score (commute) |
| `campusDays` | `["Mon","Tue",…]` (consecutive days collapse to `Mon–Thu`) | Pre | Score |
| `preferredAreas` | string[] | Pre | Score |
| `maxCommuteMins` / `maxCommuteFlexMins` | number (preferred / stretch) | Pre | Filter on stretch, Score on preferred |
| `transport` | string | Pre | Score |
| `moveInDate` | ISO date | Pre | Filter |
| `moveInFlexWeeks` | number | Pre | Filter window |
| `stayMonths`, `openToExtend` | number, boolean | Pre | Score |

### interests

| Path | Type / values | Source | Use |
|---|---|---|---|
| `hobbies` | string[] | Post | Score (overlap with the homeowner's interests) |
| `lifeGoals` | string[] | Post | Score |
| `careerGoal` | string | Post | Score (career link) |
| `homeownerBackground` | string (preferred homeowner career) | Post | Display |
| `fieldMentor` | `keen` `open` `no` (would they like a homeowner who worked in their field) | Post | Score (how much the career link counts) |
| `canOffer`, `wantsToLearn` | string[] | Post | Score (against what the homeowner enjoys and can teach) |

### household (hard filters)

| Path | Type / values | Source | Use |
|---|---|---|---|
| `homeownerGender` | `female` `male` `any` | Pre | Filter |
| `otherLodgers` | `none` `open` `prefer` | Pre | Filter |
| `smoker`, `needsSmokeFree` | boolean | Pre | Filter |
| `okWithPets`, `petAllergy` | boolean | Pre | Filter |
| `diet` | string | Pre | Score |
| `accessibilityNeeds` | string | Pre | Filter |
| `dealbreakers` | string[] | Pre | Filter |

### support

| Path | Type / values | Source | Use |
|---|---|---|---|
| `hoursPerWeek` | `{min,max}` or number | Pre | Filter (vs homeowner's need) |
| `bestTimes` | string[] | Post | Score |
| `nightsHomePerWeek` | `{min,max}` or number | Post | Score |
| `rentBudgetWeekly` | number (AUD, cash rent) | Pre | Filter |
| `driversLicence` | string or boolean | Post | Score |
| `hasCar` | boolean | Post | Score |
| `helpTypes` | string[] | Pre | Score (vs homeowner's needs) |
| `notOffered` | string[] | Pre | Filter |

### lifestyle

| Path | Type / values | Source | Use |
|---|---|---|---|
| `bedtime`, `wakeTime`, `quietAfter` | `"22:30"` (24-hour, shown as 10:30 pm) | Post | Score |
| `weekdays`, `weekends` | string | Post | Score |
| `socialLevel` | 1–5 (shown as dots) | Post | Score (against the homeowner's hopes for time together) |
| `socialNote` | string | Post | Review |
| `guests`, `tidiness`, `communication` | string | Post | Score |

### checks

| Path | Type / values | Source | Use |
|---|---|---|---|
| `identity`, `policeCheck`, `references`, `firstAid` | `cleared` `pending` `booked` `not_started` `not_required` | Staff | Review (gate before move-in) |

### screening (staff only, never shown to the student or homeowner)

| Path | Type / values | Source | Use |
|---|---|---|---|
| `profile` | `connector` `considerate_companion` `independent_tenant` `transactional_guest` | Game | Filter (`transactional_guest` excluded) + Review |
| `meters.connection` / `.respect` / `.reliability` / `.awareness` | 0–10 (band: 0–3 Low, 4–6 Moderate, 7–10 High) | Game | Review |
| `motivation` | `quiet_space` `saving_money` `company` `learning` (Day 1 Q2) | Game | Review |
| `finalPath` | `warm` `steady` `distant` | Game | Review |
| `pathByDay` | 14 strings in day order, or `[{day, path}]` | Game | Review |
| `recovered` | boolean | Game | Review |
| `lowestMoment` | `{day, note}` or string | Game | Review |
| `redemption` | string (Day 13) | Game | Review |
| `flags` | string[] (`noticed_step`, `learned_meds_folder`, …) | Game | Review |
| `landmarks` | `[{day, response, tags}]` for days 6, 9, 11 and 14, or `{ "6": "…" }`. `tags` say how the moment was handled (`grief_invited`, `fall_checked`, `fall_lifted`, `emergency_called`…), which the matching weighs against a host's risk flags; four unsafe tags (`fall_lifted`, `fall_dismissed`, `emergency_shaken`, `emergency_water`) keep the applicant out of matching on their own | Game | Review + Score + Filter |
| `choices` | `[{day, tag}]`: every multiple-choice answer, in order. The matching grades each one (`ANSWER_GRADES`): one fail, or three part fails, keep the applicant out of matching | Game | Filter |
| `answers` | `[{day, question, answer}]` (verbatim) | Game | Review |
| `finalWords` | string (Day 13 closing answer, verbatim) | Game | Review |
| `watchPoint` | string | Staff | Review |

Coded values outside these lists still display, just humanised (`intro_booked` → "Intro booked").

## How Pepaws Porch fills this

The screening game (`game/pepaws-porch.html`) builds the profile itself. There is no export step and no spreadsheet.

| Stage | Where it happens | What it fills |
|---|---|---|
| Pre | Start screen | `student.firstName`, `lastName`, `email`, `discipline`; `meta.profileId` (the run reference) |
| Game | Days 1–14 | everything under `screening` except `watchPoint`; `meta.stages.game` |
| Post | Five short pages after Day 14 | every other Pre and Post field above; `meta.stages.postGame` |
| Staff | Staff desk (`#staff`) | `meta.pairingStatus`, `meta.suggestedFor`, `checks.*`, `screening.watchPoint` |

### Quick demo

`game/pepaws-porch.demo.html` builds the same profile from nine days of timed multiple choice and two pages of key matching questions, so it fills fewer fields. Differences:

- `meta.profileId` starts with `DEMO-`.
- `screening.pathByDay` is `[{day, path}]` for the nine days played. Days keep their full-fortnight numbers (1, 2, 3, 4, 6, 8, 9, 11, 14), so `screening.landmarks` uses 6, 9, 11 and 14 like the full game.
- `screening.flags` includes `quick_demo`, plus `missed_timer` when a 25-second timer ran out.
- `screening.watchPoint` always opens with a quick-demo note and lists any timed-out questions.
- No `screening.answers`, `finalWords` or `redemption` (there are no written answers and no Day 13), and no contact details beyond the email.
- The start screen asks for a first name and an optional email (typing an email at a market stand slows everyone down).
- The questions fill: `student.age`, `gender`, `languages`; `placement.campus` (one of the five campuses, from a list), `moveInDate` (the first of one of the next few months, from a list), `stayMonths`; `support.rentBudgetWeekly`, `hoursPerWeek`, `helpTypes`, `notOffered`; `household.homeownerGender`, `otherLodgers`, `smoker`, `needsSmokeFree`, `okWithPets`, `petAllergy` (smoking and pets are one tap each, so they can't contradict); `interests.careerGoal` (from options for the applicant's area of study), `fieldMentor`, `hobbies`, `wantsToLearn`; `lifestyle.socialLevel`.
- Day 3 asks what the applicant would like to do with Marg this week. The answer pre-fills the questions: hearing about her career sets `fieldMentor` to `keen`, the community garden adds Gardening to `helpTypes` and `hobbies`, and baking adds Cooking and baking to `hobbies` and Family recipes to `wantsToLearn`. `student.languages` starts with English. All of these stay editable.
- `interests.homeownerBackground` comes from the area of study, as in the full game's pre-fill, unless the applicant says a homeowner from their field doesn't matter.
- **The demo match.** When the questions are submitted, the demo matches the profile against the fictional hosts in `genstay-hosts.sample.json` (published beside it) with `GenStayMatch.bestMatch()`, and shows the participant their outcome: matched with a homeowner (scoring 65 or more), shortlisted and waiting for a suitable host, or no placement (an unsafe answer or a screening result rules it out). The run saves it as `demoMatch`: `{status, minScore, at}`, plus `{hostId, hostName, first, age, partnerAge, suburb, career, score, hostFit, studentFit, band, highlights, talkAbout, closest, standsInWay, shortfall, setAside}` when matched or waiting (the closest host, for staff), or `{reasons}` when screened out. The staff desk's Live board shows exactly that. It is not part of the profile and never reaches the template.
- **Each run is its own applicant.** A market stand's tablets share one signed-in account, so the demo's desk lists every run separately (below).

### Automatic checks

Everything the applicant writes, in the game and in the final questions, is checked against plain word lists. Each hit is quoted for staff, and the profile is marked **Needs attention** on the staff desk.

| Flag in `screening.flags` | Effect |
|---|---|
| `threatening_language` | Lowers Connection, Respect and Reliability, and sets `screening.profile` to `transactional_guest`, which keeps the applicant out of automatic matching |
| `drug_references` | As above |
| `welfare_concern` | Staff follow-up only. The applicant is shown Lifeline and Beyond Blue numbers |
| `demeaning_language` | Lowers Connection and Respect |
| `low_safety_awareness` | Awareness of 3 or less; quotes the unsafe choices |
| `answers_to_check` | Contradictory or impossible answers, such as smoking but needing a smoke-free home |

A negation just before a match ("I would never hurt her") doesn't count, and "granny flat" isn't flagged. The game writes a summary of every hit into `screening.watchPoint`; staff can rewrite it on the desk. Applicants under 18 can't submit the final questions.

A few Post answers start pre-filled from the game and stay editable: `support.helpTypes` (from offering company, cooking or phone help) and `interests.homeownerBackground` (from the homeowner career the applicant's discipline selected).

The game saves the profile twice: once when Day 14 ends, so staff see the result even if the questions are left unfinished, and again when the questions are submitted.

### Storage

Profiles live in the published artifact's record store, under access rules declared at publish:

| Path | Holds | Who can read | Who can write |
|---|---|---|---|
| `profiles/<applicant id>` | Latest profile, plus a list of the applicant's runs (the demo keeps no list, only `latestRun`) | The applicant (their own only), Editors, the owner | The applicant (their own only), Editors, the owner |
| `profiles/<applicant id>/runs/<run id>` | Every run, so replays can be compared (`{pid, savedAt, complete, profile}`, and in the demo `demoMatch`) | The applicant (their own only), Editors, the owner | The applicant (their own only) |
| `reviews/<applicant id>` | Staff fields above, plus `suggestedHostId` (the host profile behind `suggestedFor`) | Editors and the owner | Editors and the owner |
| `hosts/<host id>` | Host profiles (`genstay-host-fields.md`) | Editors and the owner | Editors and the owner |

The demo's account document keeps no list of runs: one shared stand account would grow it without limit, and tablets saving at once would overwrite each other's lists. Its desk reads the runs themselves, and treats each as an applicant of its own. Both desks follow the store live, so new profiles appear without pressing Refresh.

Everything else in the store is locked to Editors and the owner. An applicant can technically read back their own profile, screening meters included, because writing implies reading; nothing in the game shows it to them. The applicant id is the platform's opaque viewer id, so no name or email is used as a key.

Applicants need Contributor access to save. A viewer who can't save (signed out, outside the organisation, or Viewer access) is told why, and gets **Copy profile**, **Show profile text** and, where the view allows downloads, **Download profile file**. Staff add what they email in with **Add profile files** or **Paste a profile** on the desk.
