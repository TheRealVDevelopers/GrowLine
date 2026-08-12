# Decisions — new modules (leaderboards, qualifications, duplication)

Same purpose and format as the repo's `DECISIONS.md`, kept separate because that
file belongs to the other branch and every line added to it is a merge conflict.
Fold these in when the branches meet.

Numbering is `N1…` so nothing collides with `D1…D67`.

---

## N1 — Four boards, no metric switcher (F13, session 1)

The brief asks for four separate boards and says why in one clause: a single volume
board means the same five people win forever and everybody else stops opening the
app. That is the whole feature, so it is designed around rather than tidied away.

**All four render on one screen, stacked, with no switcher.** A metric switcher
would technically satisfy "four boards" while making three of them something a coach
must already know about before they can find it — the second-class outcome the brief
names. Volume, people met, follow-ups done and logging streak are each winnable by a
different person on a different strength, which only works if a coach sees all four
without asking.

Scope and week/month ARE controls, because they change which people and which days
are in view rather than which board matters.

## N2 — The ranking window looks upward only, and the roster is server-only

The hard requirement: someone in last place must never be able to see that they are
in last place, and nor must anyone else.

A coach is shown the top 3, the few coaches directly AHEAD of them, and the exact gap
to the next one. **Never anybody behind them.** That single asymmetry is what makes
last place unobservable — a coach who is never shown anyone below them cannot tell
whether anyone is there, and the person at the bottom sees the same shape of screen
as the person in the middle.

Two consequences, both load-bearing:

- **The participant count never reaches a client.** "You are #14" plus "41 coaches"
  is a bottom-of-the-board reveal with extra steps.
- **The full ordering never reaches a client.** It lives in a `roster` document that
  Security Rules deny to everybody, including the coach ranked first on it. The page
  is server-rendered and slices each reader's window out of it with the Admin SDK.
  Enforcing this in the component alone would be exactly the "the UI hiding it proves
  nothing" failure RULES P2 exists to prevent.

The podium is the deliberate exception: three names whatever the size of the field,
so it carries no information about where the field ends.

**A board is not published below five participants** (`MIN_PARTICIPANTS`). Not a
performance threshold — on a field of three the podium is the whole field and third
place is last place, in public. Below the floor the screen teaches instead.

## N3 — Weekly and monthly, and the streak board measures a run inside the window

Both windows exist so one slow month never ends anyone's chance. For that to be true
the streak board cannot rank the coach's LIVE streak: a 200-day run would win every
weekly board for the rest of that coach's life, and the weekly reset would be a lie.
It ranks the longest run of consecutive logged days **inside the window**, so Monday
starts everybody at nothing. Days logged in the window is the silent tiebreak.

The **Streak Shield (D67) does not apply on a board.** A shield is personal
forgiveness for the flame on your own screen; spending it to claim a day you did not
log, in a ranking against other people, is a different thing. A missed day breaks the
run on the board and the flame still survives.

## N4 — Volume ranks on the checked number, and volume is monthly only

Ranking is on **proof-validated** points. Claims no upline has checked are carried
alongside, rendered dimmed as "+N not checked yet", and they order coaches who have
nothing checked among themselves — they can never lift anyone above a checked figure.

**A target counts as validated when its most recent proof is approved.** Per target,
not per point, and that is a known approximation: nothing records how many points
stood at the moment of approval, so a coach who raises progress after approval carries
the increase as validated until somebody asks for proof again (any newer pending,
submitted or rejected proof puts the whole target back in the unchecked column).

The proper fix is to stamp `progressPointsAtReview` on the proof when it is approved,
which means editing `src/lib/targets-queries.ts` — an existing file this branch may
not touch. **Reported, not done.**

**Volume runs monthly only.** It is recorded once a month as a cumulative figure
(F7, D30) and there is no per-day history to slice a week out of. Inventing a weekly
volume number would mean inventing a points formula, which is a business rule this
module has no business making up. The weekly view of that card says so and points at
the monthly one.

## N5 — The four scopes, and what "club" honestly is

| scope | key | membership |
|---|---|---|
| org | the root of the coach's tree (`uplinePath` last, or self) | same root |
| line | the coach's direct upline (or self, for a root) | that id, or that id in `uplinePath` |
| level | `trim().lower()` of the level name the coach typed | same normalised level name |
| club | `trim().lower()` of the coach's city | same normalised city |

- **org is not "every user of Growline".** Two unrelated clubs on one install are not
  one organisation, and a board mixing them is meaningless to both.
- **line is the coach's own team, not every ancestor's.** A coach belongs to as many
  lines as they have ancestors; offering eight of them in a filter is the opposite of
  the 30-second rule. An upline is refused their downline's line board — they lose
  nothing, since their own team board is a strict superset of it, and granting it
  would cost a second document lookup in the rule to prove a containment nobody asked
  for.
- **level groups exist only because a coach typed a name.** No defaults, no
  placeholders, no suggestion list, no canonicalising their spelling into a list we
  chose (RULES L1/L8, D29). A coach with no level name has no level group, and the
  screen teaches instead of showing an empty dropdown.
- **club is city, and the UI says "city".** There is no club entity in the data model
  (F12 lists clubs/cohorts as unbuilt admin work) and this branch may not create one.
  City is the only signal we hold for "who is near me". When a club entity lands, only
  `scopeKeyFor` and one rule branch change. A city board deliberately crosses
  organisations — that is what being near somebody means.

**Normalisation is `trim().lower()` and nothing cleverer**, because Security Rules
have exactly those two string operations. A membership test the rules cannot restate
is a membership test nobody enforces.

## N6 — The opt-out flag lives in `leaderboardSnapshots`, and the trade-off

It belongs on the user document and cannot go there: this branch may not write to an
existing collection. So it is a document in the boards collection, `opt_<uid>`, keyed
by uid, written only by the coach themselves through `/api/leaderboards/opt-out`.

Accepted costs, written down so the next session can price the migration:

- the compute job reads every opt-out document each run (one `kind` query) instead of
  getting the flag free with the user it has already loaded;
- a deleted user leaves an orphan — which fails safe, since an orphan means "not
  listed";
- nothing else in the app can see the flag, so the Settings screen cannot show it and
  the switch has to live on the boards screen;
- opt-outs cannot be listed by anyone (the rule allows a coach only their own), so
  "how many people opted out" is a server-side count, not a query a client can make.
  That is deliberate: who opted out is a list of people who wanted less visibility.

**Absence of the document means listed.** The default for a coach who has never
touched this is to be on the boards, which is what a board is for, and opting out is a
create rather than an update to a field that might not exist.

**Opted-out coaches still see every board.** They are removed from the rows before
ranking, not hidden at render — filtering later would leave holes in the ranks, and a
hole is an observation about the person missing from it.

## N7 — Three document kinds in one collection

`podium` (top 3, readable by members of the scope), `roster` (full ordering plus the
participant count, denied to everyone) and `optOut` (readable by its owner). One
collection because this branch is allowed one for boards; a `kind` field separates
them and the Security Rule keys off it.

Ids are deterministic (`pod_`/`ros_` + metric, window, period, scope type and a hash
of the scope key), for D35's reason: a rerun must overwrite the board it wrote last
time rather than accumulate copies. The scope key is free text — a level name, a city
— so it is hashed into the id and stored in full in the document.

**Past periods are never recomputed.** A finished week is finished; rebuilding it
would let a late edit rewrite history.

## N8 — Membership is resolved live; the ranking is the only snapshot

D64's rule, applied here: the Security Rule decides who may open a board by reading
the CURRENT user document, never a `uplinePath` stored on the snapshot. The ranking is
a snapshot — that is what a board is — but the permission is not. A coach moved to a
different line loses the old line's boards on their next read.

## N9 — No composite indexes were needed, and no money is anywhere

Every query the job makes is single-field (`createdAt` range, `dayKey` range,
`month ==`, `targetId in`, `kind ==`) or a document-id read, all of which Firestore
indexes automatically. `firestore.indexes.json` is therefore unchanged.

RULES L4 is a test, not a review note: `tests/leaderboards.test.ts` asserts that no
board's copy contains a rupee sign, an earnings word or "at this rate". A leaderboard
is the easiest screen in this app on which to break that rule.

## N10 — The scheduled function exists but is NOT deployed

`functions/src/leaderboards.ts` holds the every-three-hours rebuild, shaped like
`morningReminder`: a thin caller that POSTs `/api/leaderboards/rebuild` with
`CRON_SECRET`, so the aggregation keeps one home in the app and is runnable by hand
against the emulator.

A Cloud Function is only deployed if it is exported from `functions/src/index.ts`,
which this branch may not edit. **One line turns it on:**

```ts
export { rebuildLeaderboards } from "./leaderboards";
```

Until somebody adds it, boards refresh only when something POSTs the route. The screen
always shows when a board was last built, so a stale board says so rather than
presenting last week's ranking as today's.

## N11 — Reachable by URL and from `/more`, not from the bottom bar

`src/components/AppNav.tsx` hardcodes a five-column grid; a sixth tab is a layout
change and the owner's decision. `src/app/(app)/more/page.tsx` is the hub for
everything not on the bar, and sessions 2 and 3 add their entries to its one list.
