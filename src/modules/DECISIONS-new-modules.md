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

**A board is not published below `MIN_PARTICIPANTS` participants.** Not a performance
threshold. Below the floor the screen teaches instead.

### N2a — The floor was 5 and that was not enough (audit correction)

The floor was originally a hand-picked 5, reasoned from the podium alone: on a field
of three the podium is the whole field, so third place is last place in public, and
five looked like clear air. It was not. The podium and the window are two sets, and
below a certain size they **meet**.

A coach at rank R is shown ranks `1..PODIUM_SIZE`, plus the `WINDOW_ABOVE` coaches
immediately ahead, plus themselves. When `R <= PODIUM_SIZE + WINDOW_ABOVE + 1` those
sets join up and the coach is handed an unbroken `1..R` ending on their own name.
With 3 and 4 that is every board of 5, 6, 7 or 8 participants — measured against the
emulator, a real five-person line board rendered **5 of 5 entries** to the coach in
last place.

"The window never contains anybody behind you" was true the whole time and is not
sufficient. Nothing shown was behind the reader; the reveal is that there was nothing
*between* them either, on a group whose membership a coach already knows from the team
tree. And 5–8 is not an edge case at pilot scale — it is most boards.

So the floor is now **derived**: `PODIUM_SIZE + WINDOW_ABOVE + 2`, the smallest field
that always hides at least one rank between the podium and the window. With the
current 3 and 4 that is **9**.

The cost is honest and belongs to the owner: fewer boards publish at pilot scale, and
more cards show the teaching state. The dial is `WINDOW_ABOVE`, not the floor —
showing fewer coaches ahead lowers the floor one for one (2 gives 7, 1 gives 6).
Lowering the floor on its own is not available; it re-opens the leak.

The unit suite could not see any of this because every window case ran against a
twelve-coach board, and the floor assertion was `MIN_PARTICIPANTS > PODIUM_SIZE + 1`
— true of 5, and silent about the window. It now sweeps every publishable field size
and demands a visible break in the ranks shown to the last-placed coach.

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

### N6a — Falling below the floor must UNPUBLISH, not just skip (audit correction)

The job originally `continue`d past a board that had dropped below
`MIN_PARTICIPANTS`. Skipping a write leaves the previous run's documents in place,
still readable by everyone in the scope — and the thing that most often pushes a board
under the floor is precisely a coach opting out of it.

Reproduced against the emulator: a five-person line board, one coach opts out, full
rebuild runs, and the board is still there with that coach's name and numbers on it.
Opting out changed nothing for the rest of the period. An opt-out that silently fails
in exactly the case it caused is worse than no opt-out, because the screen says it
worked.

The skip branch now **deletes** both documents. Deleting what is not there is a no-op,
so no read is needed to find out. It costs two writes per skipped board per run and
that is now the dominant term in this job's write budget, since most scope-metric pairs
sit below the floor at pilot scale. If that ever needs cutting, cut it by reading which
boards exist — never by going back to a silent skip.

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

---

# Session 2 — F14, event qualifications

## N12 — A qualification's conditions are a LIST of typed pairs, not five columns

The brief says the data model is the real work and names what it has to make cheap:
a sixth criterion type, later. So a qualification stores
`criteria: [{ type, target }, …]` against a registry (`criteria.ts`), and every
consumer — the tracker, the nudge, the qualifier list, the drop-off table, the
reminder copy — is written as a loop over that array with a lookup in the registry.

The alternative was five nullable fields on the document (`volumeTarget`,
`membersTarget`, …). Priced against the same change:

| | five fields | a list of pairs |
|---|---|---|
| sixth criterion | schema change, migration, a branch in the evaluator, a branch in every renderer, a key in the summary map | one entry in `CRITERION_SPECS`, one `if (want(…))` block in the collector |
| what else edits | every file that names a criterion | nothing |

Two unit tests hold the property rather than a comment: one proves a type cannot be
listed with a half-written spec, the other runs every type through scoring, nudging
and drop-off generically, so a `switch` appearing downstream fails for the sixth
type instead of shipping.

## N13 — Two ways to measure, declared in the registry

`measure: "windowed" | "cumulative"`.

Four criteria are countable inside the window because their rows carry a time:
prospects captured, members logged, coaches recruited, days logged. Volume is not —
it is one cumulative monthly figure per coach with no per-day history, which N4
already recorded on the boards.

Counting the whole month's figure would credit a coach for points earned before the
qualification was announced. So a cumulative criterion is measured against a
**baseline** captured when the coach enters, and progress is the difference. The
create route evaluates synchronously, so for the audience that exists at
announcement the baseline is taken at that instant; a coach who joins the line later
is baselined on the run that first sees them, which errs towards under-counting
rather than crediting work done under a different upline.

A validated total can go DOWN (an upline asking for fresh proof), so the difference
is clamped at zero. "-40 points" is not a number anybody can act on.

### N13a — `measure` was documentation, not machinery (audit correction)

N12 claims that adding a sixth criterion costs one entry in `CRITERION_SPECS` and one
collector. N13 claims the evaluator reads `measure` to decide what needs a baseline.
The first was true. The second was not: the evaluator chose baselines with
`c.type === "volume"`, and `measure` was read by nothing but a test asserting it was
one of two strings.

Indistinguishable from correct today, because volume is the only cumulative criterion.
Wrong the moment there are two: a sixth cumulative criterion would get no baseline
entry, `base` would fall back to 0, and `done = raw - 0` would credit the coach's
entire lifetime total to a qualification announced last week. That is precisely the
padding the baseline exists to prevent, arriving silently, on the screen a whole line
is reading.

Fixed: `needsBaseline()` and `baselineTypes()` in `criteria.ts`, driven by `measure`,
and the evaluator asks them. Behaviourally identical today by construction.

The interesting part is why nothing caught it. Every scoring test runs against
`progress.ts`, which is pure and takes the baseline as an ARGUMENT — so the tests
proved the arithmetic and never touched the choice. The choice lived one file further
in, in `evaluate.ts`, which imports firebase-admin and therefore cannot be imported by
a unit test at all. So there are now two guards: the contract on the pure function,
and a source assertion that nothing in `evaluate.ts` compares a criterion's type to a
literal. The second one is the one that would actually have failed.

## N14 — Volume counts only CHECKED points, and the unchecked figure is carried

Same rule as N4, and here it matters more. `progressPoints` is typed in by the coach
it belongs to (F7), so a qualification gated on the raw figure is one a coach awards
themselves by typing a bigger number. Only points on a target whose most recent proof
is approved count; any newer proof — pending, submitted or rejected — puts the whole
target back in the unchecked column.

The known approximation is N4's: validation is per TARGET, not per point, because
nothing records how many points stood when the upline approved. The proper fix is
`progressPointsAtReview` on the proof, which means editing `src/lib/targets-queries.ts`
— an existing file this branch may not touch. **Still reported, still not done.**

The unchecked amount is carried alongside and rendered dimmed, because it changes the
instruction. A coach sitting on 400 unapproved points is not behind on the work, they
are behind on the checking, and "go and meet more people" would be the wrong nudge
(G6). That is the one hint in this feature that names a job somebody else has to do.

### N14a — The window bounds volume's MONTHS, not its timing (audit correction)

`LATE_CHECK_DAYS` carried the claim that "only the CHECKING is allowed to arrive late;
the work itself still has to fall inside the window, which the day-key bounds enforce."
For the four windowed criteria that is exactly true — every underlying row carries a
time. For volume it is false, and the comment has been corrected.

`progressPoints` is one self-typed running total per month with no per-point history
(N4, N14). The day-key bounds therefore select which MONTHS are read; they say nothing
about when a point inside one was entered. Two consequences:

- **Late entry.** Points typed into a window month after the deadline count, for the
  seven days late-checking runs. Usually this is a coach catching up on paperwork,
  which is the behaviour we want — and an upline still has to approve it.
- **Back-fill.** The baseline records what a coach had TYPED when they entered, not
  what they had EARNED. A coach who logs the whole month's points in one go afterwards
  has the whole month credited to a qualification announced mid-month.

Neither is fixable from this branch, and both are the same root cause as N14's known
approximation: `progressPointsAtReview` on the proof, in `src/lib/targets-queries.ts`,
an existing file this branch may not touch. **Reported, still not done — and the count
of things blocked on that one field is now three (N4, N14, N14a).**

## N15 — The audience is "direct" or "whole line", not the four board scopes

The brief says "which part of their line it applies to", and a line has two honest
answers: the coaches you brought in yourself, or everyone beneath you at any depth.
Both are the words F8 already put in front of these coaches for the same choice.

The leaderboards' four scopes are deliberately NOT reused. A city board crosses
organisations on purpose (N5), and "everyone in Bengaluru qualifies for my event" is
not something an upline can offer. A level group is free text somebody typed; gating a
prize on it would make the text a claim.

Membership is resolved LIVE on every evaluation and in the Security Rule (D64). No
participant list is stored. A coach who joins the line mid-qualification is in it from
that moment; a coach who moves out has their row DELETED, for N6a's reason — leaving
it behind keeps their name and numbers on a qualifier list belonging to a line they
have left.

### N15a — One predicate, not two copies of one rule (audit correction)

That membership rule decides two different things: whose progress row the evaluator
WRITES, and who may OPEN the screen. It was written out twice — `audienceOf` in
`evaluate.ts` and `isParticipant` in `queries.ts` — and both files import
firebase-admin, so no unit test could reach either. A drift between them would produce
a coach with a tracker who cannot open it, or a page served to somebody the evaluator
never counted.

It is now one pure function, `inAudience()` in `model.ts`, and both call it. Being pure
also means it is finally testable: `tests/qualifications.test.ts` now pins the app-side
half of what `e2e/qualifications-rules.test.ts` pins at the database — a coach outside
the creator's line is in NEITHER audience, a grandchild is not in "direct", and a
creator is never a participant in their own qualification.

The Security Rule states the rule a third time, in its own language. That copy is not
duplication to remove: the app's copy decides what we render, the rules' copy is what
stops a hand-written query, and neither substitutes for the other (the argument
`threads-queries.ts` already makes).

## N16 — Qualified by name, one-step-away by count

The brief asks for a live qualifier list — "who is already in, who is one step away" —
and that second half is where the leaderboard leak N2 reappears in different clothes.

- **Qualified: names, to everyone in the qualification.** Being in is good news, and an
  event list is public by nature; a qualification whose qualifiers were secret could
  not be run at all.
- **One condition away: a COUNT to participants, NAMES to the creator only.** A peer
  does not need to know whose shortfall is whose. The creator does — they are the
  person who makes the phone call, every one of those people is already on their team
  tree, and activity counts flow up the line anyway (P1).

Neither audience ever sees a prospect: names met are counted, never named, and the
evaluator reads nothing off a prospect document but its owning coach's id.

### N16a — What the qualifier list newly discloses (audit note)

Recorded because it was not, and it is a real widening rather than a restatement.

On a WHOLE-LINE qualification, the qualifier list shows every qualified coach's name to
every participant — including coaches in a SIBLING branch, whom the reader cannot see
anywhere else in the app. The team tree only ever looks downward, so before this feature
a level-1 coach had no way to learn the name of somebody under a different level-1 coach.
Now they can, if that person qualifies.

Accepted, and it is the point: a qualification is an announcement to a group and its
qualifier list is the announcement's result — a list that could not be published could
not be run at all, which is N16's first bullet. What is deliberately NOT widened is the
other direction: the one-condition-away group stays a COUNT to participants, so nobody
learns a name attached to a shortfall. A coach's own numbers reach nobody at all (N19).

If this is ever judged too wide, the dial is the qualifier list's scope, not the count:
show names only within the reader's own branch. That is a product decision and it
belongs to the owner, so it is written here rather than taken.

## N17 — "One step away" is exactly one unmet condition, and the label never travels alone

`stepsAway` is the count of unmet criteria. One means one. Not "close on all of them",
not a tuned percentage.

That definition has an honest hole: a coach with four conditions met and zero of two
thousand points IS one step away and is nowhere near. The fix is not a threshold —
picking 60% or 80% would be inventing a business rule to make a label feel right.
The fix is that **the number always travels with the phrase**. Every place this module
says one step away, it prints the gap in that criterion's own units: on the tracker,
in the nudge, in the reminder, and beside every name in the creator's list. A
MANDATORY unit test asserts it.

The "closest" condition is chosen by FRACTION, not by the raw gap. 600 points and 2
members are not comparable numbers, and picking the smaller would send a coach who is
95% of the way to a volume target off to start the thing they have not touched.

## N18 — Qualifying latches

Once a coach has been told they are in, they stay in for that qualification, and
`qualifiedAt` records when. The only way a met condition can un-meet itself is an
upline requesting fresh proof on an already-approved target — somebody else's action,
after the fact — and taking a badge back off a person who has already shared it is not
something this app is going to do.

The per-criterion rows keep telling the truth, so a tracker can show "You are in"
beside a condition that has since slipped. Rare, honest, and better than a bouncing
badge.

## N19 — Two collections; the numbers are readable by nobody

`qualifications` holds the DEFINITION and is readable by its creator and the line it
addresses — a condition nobody can read is not a condition, and the document contains
no numbers about any person.

`qualificationProgress` holds every participant's row and the roll-up (two `kind`s in
one collection, N7's arrangement, because this branch may create one collection for
this feature). It is denied to **every** client — including the coach a row is about
and the creator. Between them the rows carry the audience size, everybody's shortfall
and who is nowhere near; N16's asymmetry is only a guarantee if they cannot be
fetched. Denied to the creator too, because a grant with an exception is a grant
somebody widens, and their dashboard is server-rendered anyway (D48's discipline).

The definition's rule is split into the same two branches F8 uses, for the same
reason: a list request is evaluated once against the query, so each branch must be
decidable from fields the query pins. A grandchild is refused a direct-line
qualification — "my direct line only" means exactly that.

## N20 — A deterministic id, no edit and no delete

The qualification id is a hash of (creator, normalised title, deadline). A
double-tapped Create button therefore lands on the same document instead of putting
identical twins on a whole line's screen with no way to tell which is real.

The route REFUSES an id that already exists rather than overwriting it, and there is
no edit screen and no delete route. A qualification people are already being measured
against must not have its conditions moved — a moving target is not a target — and the
Security Rule says the same thing to a client that tries.

The cost, written down: a genuine mistake cannot be withdrawn, only left to close. If
that becomes a support burden, the answer is a CANCELLED state that stops evaluation
and says so on the card — never a silent delete, which would remove a qualifier list
people were told they were on.

## N21 — Evaluate on create, refresh on open after fifteen minutes

A qualification's numbers are an aggregation across a whole line, so they are stored
rather than computed per screen open — leaderboards' reasoning exactly.

Three things write them:

1. **Creation**, synchronously. A coach tapping through from their upline's message
   sees their own numbers, not an empty frame promising a job will run later. It also
   fixes the cumulative baseline at the moment of announcement (N13).
2. **The scheduled evaluator**, every three hours — which is NOT deployed (N23).
3. **The page itself**, if the stored summary is older than `STALE_AFTER_MS` (15
   minutes) and the qualification has not settled.

(3) exists because of (2)'s deployment problem: without it a tracker would show
whatever creation wrote and nothing after. It is bounded the other way too — however
many coaches open the screen, one qualification is evaluated at most four times an
hour. Racing refreshes are harmless: every write is an upsert on a deterministic id
with the same computed values.

A **settled** qualification is never recomputed. Settling is the deadline plus
`LATE_CHECK_DAYS` (7), and that grace exists for proof approval: a coach whose last
piece of work lands on the deadline needs an upline to approve it, and that happens
when the upline next opens the app. Only the checking is meant to arrive late; for
volume that intent is approximate — see N14a.

### N21a — The LIST does not refresh, so it says how old it is (audit correction)

(3) above is the DETAIL page only. `listForCoach` reads the stored row and renders the
standing straight onto the card — and with the scheduled evaluator undeployed (N23),
that row can be the one creation wrote and nothing since. So a coach who only ever
looks at the list could be shown "0 of 3 conditions met · 3 conditions left" while
they have in fact qualified, until somebody opens the card.

Refreshing per card is not the fix. `ensureFresh` reads a whole slice of the
organisation; doing that once per row would make opening a list cost N of them, which
is the exact expense the stored rows exist to avoid — and a list is the cheapest,
most-opened screen in the feature.

So the card states its age instead. `updatedAt` is already on the row the card reads,
so it costs nothing: silent inside `STALE_AFTER_MS`, and outside it "Counted 2 h ago —
open to refresh", or "Not counted yet" if no row exists. The threshold is imported
from `evaluate.ts` rather than retyped, so the number that decides whether the detail
page recomputes is the same number that decides whether the card admits it has not.

This is the same standard N17 sets for "one step away": the app does not present a
figure as more certain than it is, and the honest fix is to print the qualifier rather
than to hide the number.

## N22 — Deadlines are days in the coach's zone, and the zone travels with them

E1. A deadline of "31 August" evaluated in UTC closes at 05:30 on the 31st for the
person holding the phone: it takes the last evening away from everybody who works in
the evening, which is when this audience works.

So a qualification stores `fromKey`, `deadlineKey` and `timeZone`, the deadline is
INCLUSIVE, and the exclusive instant a Firestore range query needs is derived rather
than stored so the two cannot disagree. The zone is `APP_TIMEZONE` today and is taken
from the server, never from the request body — a client-supplied zone would let a
coach push their own closing date forward by picking one.

`daysLeft` counts today, so the last day is 1 and never 0: zero reads as "it is over"
while a coach can still act.

## N23 — Two scheduled functions, and neither is deployed

`functions/src/qualifications.ts` holds `evaluateQualifications` (every three hours)
and `qualificationReminders` (09:00 Asia/Kolkata daily), both thin callers of app
routes — `morningReminder`'s shape, and N10's for the same reason.

A Cloud Function is only deployed if it is exported from `functions/src/index.ts`,
which this branch may not edit. **One line turns both on:**

```ts
export { evaluateQualifications, qualificationReminders } from "./qualifications";
```

Until then the trackers still work (N21), but nothing is PUSHED. The escalating
reminders are the piece that genuinely does not happen without a scheduler, because
they are the only part that has to reach a coach who is not looking at the app.

## N24 — Escalation shortens the gaps; it does not raise the voice

Bands at 14, 7, 3 and 1 days left. A band fires the first time `daysLeft` drops to or
below it, so the gaps close — seven days, then four, then two. Because days only
decrease, a passed band can never become due again and no bookkeeping is needed beyond
"have we sent this one", which lives on the coach's own progress row (N6's reasoning
about where a flag can live on this branch).

**The band is a schedule, never a label.** The three-day band covers everything at or
under three, so a message worded from the band would say "3 days left" on a day when
two remain. The lead line comes from the real day count and is therefore always true.

There is no countdown timer and no "running out of time" copy. G2 bans fake scarcity
and this is the easiest screen in the app on which to manufacture some; the urgency is
carried by two true things, the day count and the gap. Nobody who has already
qualified is reminded — a notification that arrives after the good news reads as the
app not knowing.

The band is marked as sent even when the coach turned out to have no working device.
Otherwise a coach who never enabled notifications is due on every run for the rest of
the qualification, and the job spends its budget rediscovering that.

## N25 — One route for two seats, and the celebration is local

`/qualifications/[id]` renders the tracker or the creator's dashboard depending on who
is asking. A creator is never in their own audience — a qualification runs DOWN a line
— so the two seats never overlap and a second route would only be a second thing to
remember. Anybody else gets `notFound()`, the same answer as a qualification that does
not exist, so the route cannot be used to discover what an upline in another line is
running (targets-queries.ts's discipline).

The qualified celebration fires once per device, tracked in `localStorage` rather than
a stored field: it is a display preference for one browser, it needs no write path, and
a coach who opens the app on a second phone getting the moment once more is a better
failure than a server round trip to suppress it. Pink diamond, under 1.2s, skippable by
tap, and skipped entirely under `prefers-reduced-motion` (G5).

---

# Session 3 — F20, the duplication score

## N26 — The formula, its inputs, and what it deliberately does not measure

One number answering one question: **is the work happening only at the top, or
genuinely three levels deep?**

For each depth `d` below a coach (`d` = 1, 2, 3), over a rolling window:

```
n_d = people at that depth who have been in the line long enough to count
k_d = how many of those are ACTIVE
m   = (Σ k_d) / (Σ n_d)                        the line's own pooled rate
â_d = (k_d + α·m) / (n_d + α)                  α = 2, the shrinkage pseudo-count

score = 100 · (Σ d·â_d) / (Σ d)                over every d where n_d > 0
```

**Inputs, and only these:**

| Input | Where it comes from | Constant |
|---|---|---|
| Who is in the line, at what depth | `users.uplinePath`, first 3 entries (D36) | `MEASURED_DEPTH = 3` |
| Days a person logged | `dailyLogs.dayKey` inside the window | — |
| The window | 28 local days ending today (E1) | `WINDOW_DAYS = 28` |
| The active bar | days logged, pro-rated by presence | `ACTIVE_DAYS = 4` |
| Who is old enough to count | `users.createdAt` | `MIN_TENURE_DAYS = 7` |
| How much a small level is trusted | — | `SHRINKAGE = 2` |

**What it does NOT measure, on purpose:**

- **How hard anybody works.** Four logged days and twenty-eight count identically.
  Intensity is what the boards rank (N1); this counts how many people are moving at
  all. A line cannot lift this number by having one person at the top do more.
- **The coach's own activity.** Not a parameter of `scoreLine`, and a depth of 0
  passed in by mistake is discarded. If a coach's own diligence could lift their own
  duplication score, the one question the number answers would stop being answerable
  and the hardest-working coach in a dead line would read as the healthiest. Their own
  days are shown beside the number, labelled as not part of it — which is the
  misreading everybody has first, so the screen answers it rather than waiting.
- **Money, in any form.** No rupee figure, no conversion, no rate of change, no "at
  this rate" (L4). A duplication score beside a trajectory is an income projection
  with the arithmetic left to the reader, and the unit tests fail on the vocabulary.

28 days rather than 30 because 28 holds exactly four of every weekday. Clubs run on a
weekly rhythm, and a 30-day window holds five Mondays and four Tuesdays, so the score
would rise and fall with which day the job happened to run.

## N27 — The weight is the depth itself, and a one-level line can score 100

Activity at level 1 can be explained by a coach personally ringing every one of their
direct downlines. Activity at level 3 cannot — those are people the coach has very
likely never met. So the deeper the level, the more it counts, in the simplest ratio
that says so: **`w_d = d`**, level 3 worth three times level 1.

That asymmetry is the feature. Two lines with identical overall activity, one
top-heavy and one bottom-heavy, score 39 and 61 — and a number that scored them the
same would answer no question worth asking.

**A line one level deep is scored on the level it has.** Four direct downlines, all
logging, scores 100. The alternative — capping the score by depth reached, so one
level can never exceed 33 — was considered and rejected outright: it tells a coach in
their first month that they have failed at something they have not had the chance to
start, which is the one reading this number must never produce. The depth a line
actually reaches is reported **separately and prominently**, and framed as what
happens next ("Level 2 appears when somebody at level 1 brings in their own first
person"), never as a level they are missing.

## N28 — What makes 70 mean the same for a line of 6 and a line of 600 — and the limit

Four things, in order of how much work they do:

1. **Every input is a rate, never a count.** A line of 600 has more active loggers
   than a line of 6 by construction, so a count-based score is a size ranking wearing
   another name.
2. **The divisor is the depths that exist, not the people.** `Σd` is 1, 3 or 6. Line
   size never enters the arithmetic, so one enormous level 1 cannot drown out a small
   level 3.
3. **Shrinkage stops one thin level swinging the score — between depths, and only
   between depths.** Each depth is pulled toward the line's **own** pooled rate — not
   toward an imagined healthy average — so a quiet line is never flattered.
   ~~Without it a level of one person scores exactly 0 or exactly 100, so a small
   line's score is assembled from extremes and "70" is a number only a big line could
   ever land on.~~ **That sentence was wrong; see N37.** The prior is estimated from
   the same data, so on a line with only ONE populated depth the shrinkage cancels
   exactly and the score is the raw rate.
4. **The exact invariant.** If every depth has the same rate `r`, then `m = r` and
   every `â_d = r` identically, so **the score is exactly `100r`, at any line size and
   any number of depths.** A uniformly half-active line scores 50 whether it holds 6
   people or 600. That is the guarantee, and it is tested at both sizes.

**The limit, stated rather than hidden.** When depths *differ*, two lines with the
same per-depth rates do **not** score identically at different sizes — they converge
as the line grows. Rates of (100%, 0%) score 39 over four people per level and 33 over
four hundred, approaching the unshrunk 33.3. That is deliberate: promising exact
equality would mean trusting one person out of one as much as four hundred out of four
hundred. The small line's number sits closer to its own overall activity because that
is what the evidence supports.

What that does **not** buy — the two are easy to confuse, and N26–N28 originally
conflated them: it damps a thin level against the *other levels of the same line*. It
does nothing at all to the overall level of a line that has only one depth, so a
single coach who logged once still hands their upline a 100. See N37.

Consequence worth knowing: **one quiet person on a thin deep level cannot crater a
score.** A line at 10/10, 4/4 and 0/1 scores 80, where the unshrunk formula gives 50.

## N29 — Three levels, not the whole ancestry

`uplinePath` carries every ancestor, so measuring ten levels down would cost nothing
extra. We read **the first three entries only**, and the slice is where that decision
physically lives (`line.ts`).

- v1 §11 caps the team tree at three levels, so level 4 is people the coach cannot
  look up on any screen in this app. A number that moves because of people a coach
  cannot see is a number they cannot act on.
- The question is literally "is it three levels deep".
- Nobody is discarded: a person at level 4 is counted at levels 1, 2 and 3 of the
  coaches above them. **Every line is measured once, by the coach who owns it.**

## N30 — A week in the line before you are counted, and a bar pro-rated to your time here

**Nobody is counted until they have been in the line 7 days.** Judging somebody on
their third day measures our onboarding, not their duplication. The larger reason is
structural: without this rule every new joiner arrives as an inactive body in a
denominator and lowers their upline's score, so **growth would depress the number that
exists to reward it** and the screen would be actively harmful to open after a good
week. Waiting people are reported in the breakdown ("2 more people here joined in the
last week — not counted yet"), never silently dropped, or the level would look smaller
than the team actually is.

**The active bar is pro-rated by presence**, floored at one day: 4 days in a full
28-day window, 1 day for somebody who joined eight days ago. A flat bar asks the
newest people in a line for twice the rate it asks of the oldest.

Fairness runs both ways — a brand-new coach who is *already* logging is still not
counted early. The rule is about how much evidence exists, not about generosity.

## N31 — Null is not zero, and the three empty states are three different sentences

`score` is `number | null`, and null is **never** rendered as 0. A zero is a verdict on
a line ("nobody below you logged"), which is a real and useful thing to say — and
saying it to somebody who has no line, or whose line all joined on Tuesday, is a lie
that reads as failure.

Three states, worded as the three different things they are:

| State | What the coach is told |
|---|---|
| No line at all (`noLine`) | Their line has not started; share the invite link, the first level appears when somebody joins and logs. |
| Everyone joined this week (`allTooNew`) | Nobody is judged in their first 7 days; this fills in on its own. The levels still render, showing who is waiting. |
| No reading computed yet | Worked out on a schedule, not on open, because counting a whole line per page load would make the app slow on the phones it has to run on. |

The unit tests assert none of the copy contains failure vocabulary.

## N32 — One document per coach, written on a schedule, and no trend

`duplicationScores/dup_<uid>`. Deterministic (D35, N7): a rerun must overwrite the
reading it wrote this morning, not leave a second copy beside it — two readings for one
coach shows up only as a number flickering between two values. The uid is used raw
because Auth already guarantees a safe id, unlike the free-text scope keys N7 had to
hash.

A coach with **no** line has their reading **deleted**, not skipped — N6a's correction
in a second place, for the same reason. The usual cause of an emptied line is a
downline being reparented, and skipping would leave the coach they left reading a
breakdown of a team that is no longer theirs for as long as nobody looked. One write
per lineless coach per run is the accepted cost; if it ever needs cutting, cut it by
reading which readings exist, never by returning to a silent skip.

**No trend is stored, deliberately.** A 28-day window rolls one day at a time, so a
day-on-day delta is mostly noise; a meaningful "up 12 since last month" needs a stored
series and a sampling interval chosen on purpose, and inventing one to put an arrow on
the card is decoration without behaviour (G6). It is the obvious next thing to build —
a second `kind` of document in this collection holding monthly samples.

Nothing written by this job identifies a person. Levels are counts, and a count is the
shape P1 lets flow up a line at all.

## N33 — Readable by its subject, and the upline grant that was deliberately withheld

Security Rules: `allow read: if signedIn() && resource.data.userId == uid()`, and
`allow write: if false`.

An **upline cannot** read a downline's reading. That is a narrowing, not an oversight,
and it is worth the paragraph. Activity counts genuinely do flow upward under P1, and
a coaching screen showing an upline how their downlines' lines are duplicating would
be legitimate. But it does not exist, and a grant written for a screen nobody has
designed is a grant nobody has thought about. Two things follow the moment it is
written: the ancestry test has to resolve **live** against the subject's current user
document (**D64** — every reading here carries counts frozen at whenever the job last
ran, and a reader moved to another line must lose access on their next read), and it
costs a `get()` on somebody else's user document per request. When that screen is
built it is server-rendered like the team tree, with the Admin SDK reading, and this
rule stays as it is (D48's discipline).

The rules test plants `uplinePath` and `sharedWith` arrays naming the reader **on a
reading document** and confirms the reader is still refused. That makes D64 a property
of the database here: no field a future session adds to these documents can quietly
become the thing that grants access to them.

The collection is not enumerable — an unfiltered list is denied, a list filtered to
your own uid is allowed.

Writes are shut to everybody, including the coach a reading is about. It is the one
figure in these modules that a person has both an obvious motive and, without that
line, the means to fabricate; and a reading somebody dislikes must not be deletable by
them either.

## N34 — No ring, no celebration, one accent

The obvious move was to reuse `TargetRing`, and it would have been wrong. That ring
lights the **remaining** arc on purpose (v2 §4, Zeigarnik) because a target is a thing
a coach is chasing to 100. A duplication score is a **reading**, not a goal: a coach
whose single level is fully active is honestly at 100, while a coach at 60 across three
levels may have the better team. A permanent unfilled arc would tell everybody, every
month, that they are short of something.

So the number is a number, the gold goes on the level bars where the action is, and the
screen keeps to one accent (G3). No green gem on a fully-active level either — `.gem`
is for money, gains and completed conditions, and a level at 100% this fortnight is a
reading that will differ next fortnight, not something anybody completed.

No celebration: crossing a band would need a stored previous reading, and none is
stored (N32). A celebration fired on every page load is decoration without behaviour
(G6). The only motion is a count-up under 400ms that collapses to an instant number
under `prefers-reduced-motion` (G5). Nothing on the screen is operable, which is how it
passes the 30-second rule (S1) — there is nothing to operate.

## N35 — The scheduled function exists but is NOT deployed

`functions/src/duplication.ts` holds `rebuildDuplicationScores`, a thin caller of
`/api/duplication/rebuild` — `morningReminder`'s shape, and N10's and N23's for the
same reason: the aggregation keeps one home in the app, runnable by hand against the
emulator, and `functions/` is a separate build that cannot import from `src/`.

A Cloud Function is deployed only if it is exported from `functions/src/index.ts`,
which this branch may not edit. **One line turns it on:**

```ts
export { rebuildDuplicationScores } from "./duplication";
```

Until then a reading is produced only when something POSTs the route with
`CRON_SECRET`, and the screen says plainly that nothing has been counted yet rather
than showing a zero.

**Daily at 04:00 Asia/Kolkata**, not every three hours like the boards. A 28-day window
rolling one day at a time cannot move enough between breakfast and lunch to justify
eight whole-organisation reads a day, and 04:00 is after the last evening logs are in
and before anybody opens the app.

## N36 — No composite index, and two collection reads per run

The job runs one range query on a single field (`dailyLogs.dayKey`) and one unfiltered
`users` read, so `firestore.indexes.json` needed no entry — the same outcome as N9. The
whole organisation is shaped into every coach's line in **one pass** over the users,
because `uplinePath` is ordered nearest-ancestor-first: no tree walk, no query per
node, and the cost does not grow with how deep the tree is.

## N37 — Shrinkage toward a self-estimated prior is a no-op on a one-level line (audit)

Found auditing N26–N28, which claimed the opposite twice.

Because the prior `m` is estimated from the same data as the observation, a line with
only **one** populated depth cancels exactly, for every `α`, `n` and `k`:

```
m  = k₁/n₁
â₁ = (k₁ + α·k₁/n₁)/(n₁ + α) = k₁(n₁ + α) / (n₁(n₁ + α)) = k₁/n₁
```

The score of a one-level line is therefore its **raw** rate. Consequences:

- A coach with a single downline can only ever score **0 or 100** — there is no middle
  of the scale for them, which is precisely what N28 point 3 claimed shrinkage bought.
- A downline in the line the minimum seven days who logged **one single day** clears
  the pro-rated bar and hands their upline **100**, with the reading "The work is
  happening right through your line." N28's own warning names this as the failure it
  was avoiding. It does not avoid it.
- Most coaches in a pilot club are one level deep, so this is the common case.

**Left as it is, deliberately.** Shrinking toward a fixed constant or toward the whole
organisation's rate would fix it and would destroy the exact size-invariance of N28
point 4, which the entire scale rests on, and would judge a small line against other
people's numbers. Between depths the shrinkage does real work and is worth keeping
(10/10, 4/4, 0/1 → 80 rather than 50).

Fixed in the **words**, not the formula: the false claims in `score.ts` and in N28 are
corrected, the identity is pinned by an exhaustive unit test over seven line sizes so a
future change to `α` or to the prior fails loudly, and the card already states how many
people a reading covers — a 100 over one person is visibly a 100 over one person.

**Still open for the owner:** whether `readingOf`'s top band should say "The work is
happening right through your line" about a line of one. That is a product call, not an
audit one, so it is reported rather than changed.

## N38 — The "nobody logged" headline is a fact about the levels, not a rounded zero (audit)

`readingOf` chose its `none` band on `score <= 0`. The score is rounded to a whole
number, so it reaches 0 whenever the shrunk depth-weighted mean lands under 0.5 — which
a large, nearly-dormant line does **with people still logging**. One active person in a
line of 300 scores 0, and the screen printed:

> **Nobody in your line logged their work in this window.**
> Level 1 — your direct line ······ 1 of 300 people logged.
> Where to look: Level 1 is the thinnest — 299 people there have not logged.

Three sentences, on one card, disagreeing with each other, the loudest of them simply
untrue about somebody's team. Reachable at any overall active share below 0.5%.

`readingOf(score, anyActive)` now takes the fact. `anyoneActive(levels)` reads it off
the same `levels` array the bars are rendered from, so the headline and the breakdown
underneath it answer from one source and cannot contradict each other — deliberately
**not** off `deepestActiveLevel`, because a reading written by an older run may not
carry that field and a missing field must not be able to call a working line dead. A
rounded-down 0 with somebody still working now reads `topHeavy` — "A few people in your
line are working. Most are not." — which is exactly what 1-of-300 is.

The second argument defaults to `score > 0`, which is safe: nobody active always scores
exactly 0 (every shrunk rate is `(0 + α·0)/(n+α)`), so the default can only ever agree
with the fact. Tested both ways.

## N39 — The bars cannot be reconciled with the number, so the card says why (audit)

`LevelBars` renders `rate` (the plain share); the score is built from `weighted` (the
shrunk share). Both come from one `scoreLine` call in one document, so they can never
disagree about *data* — but they disagree *numerically*, and the card invited the
arithmetic by saying "Deeper levels count for more":

| line | bars | that arithmetic gives | the card shows |
|---|---|---|---|
| L1 1/1, L2 2/10 | 100% & 20% | 47 | **31** |
| the same shape ×100 | 100% & 20% | 47 | **46** |

Sixteen points apart on the small line, with nothing on the screen accounting for it.
An unexplained gap between the number and the picture directly beneath it is how a
coach decides the screen is wrong and stops opening it. `WHY_THE_BARS_DIFFER` now sits
under the bars and says it in the terms a coach already has, and is covered by the L4
copy test like every other sentence in the module.

Also noted, not changed: `deepestActiveLevel` is computed, stored and typed all the way
through to `DuplicationView`, and no screen renders it.
