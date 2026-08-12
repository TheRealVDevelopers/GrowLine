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
when the upline next opens the app. Only the CHECKING is allowed to arrive late — the
work itself still has to fall inside the window, which the day-key bounds enforce.

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
