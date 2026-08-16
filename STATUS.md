# GROWLINE STATUS — last updated: 2026-08-14 · updated from: PC · branch: `feature/new-modules`

> Single source of truth between mobile and PC. Produced by a read-only audit that read
> code paths end to end — not commit messages, not filenames, not docs.

## Standing rules

1. **Every session — mobile or PC — reads this file first, and updates it before ending.**
   Mark items done, add new ones, refresh the date/device/branch line above.
2. **No session starts new work while ⚠️ CONFLICTS is non-empty**, unless the owner says so
   explicitly.
3. **New ideas that are discussed but not specced go under 🧊 PARKED** — listed, not built.
4. Anything that deviates from spec still goes in `DECISIONS.md` with its reasoning (RULES E6).

## How the audit classified things

Traced UI → API route → query function → Firestore collection → Security Rule. If any link
was missing, stubbed, unreachable, or behind a flag nobody sets, it is **not** DONE. Every
"DONE" claim was then handed to a separate pass whose only job was to refute it; three were
overturned and are recorded as PARTIAL below.

**Counts: 27 areas → 10 DONE · 15 PARTIAL · 2 NOT STARTED · 5 of the PARTIALs also CONFLICTING.**
(2026-08-14: Feature A and Portfolio Basic moved NOT STARTED → DONE. Bugs #2, #6, #7 fixed; #16, #18, #19, #20 found and
fixed; **#17 found and NOT fixed — it is the launch blocker, see below.**)

---

## 🧭 Branch situation

| Branch | State |
|---|---|
| `feature/new-modules` | **The working branch.** Everything below is built here. |
| `master` | Fast-forwarded to `78f2a99` on 2026-08-13, then `feature/new-modules` moved ahead again with workspaces and the Goal Sheet foundation. |
| `claude/mobile-pc-workflow-test-alhnwl` | Fully contained in both. Nothing lives only there. |

**No merge conflict has ever existed between these** — every merge so far has been a clean
fast-forward. Merging `master` forward settled ⚠️ A in practice (the Phase-2 work is on
`master` now); it still wants a line in `DECISIONS.md` so the next session does not re-open it.

---

## ✅ DONE (verified end-to-end, and survived a refutation pass)

- [x] **Phone-OTP auth + profiles + referral codes** — Firebase Phone auth; the old custom OTP
      is genuinely gone from `src/`, not dead code still shipping. Referral-code uniqueness is
      claimed inside `createUser`'s transaction via a reservation doc (`src/lib/users.ts:135-201`,
      D41). Logout revokes server-side; e2e replays a dead cookie to prove it.
- [x] **Team tree (3 levels, activity per node)** — real BFS over `users` capped at depth 3;
      per-node activity is genuine `dailyLogs`/`targets` data, not placeholders
      (`src/lib/team.ts:68-146`). Drill-down re-checks the requested root is inside the caller's
      own line (`src/app/api/team/route.ts:5-18`).
- [x] **Prospect capture — manual + public QR + offline queue** — consent enforced server-side
      with strict booleans; IndexedDB queue drains from the authenticated layout; idempotency is
      structural (composite doc id + `create()`), not lookup-then-insert. QR path is
      unauthenticated, rate-limited, `noindex`. Covered by real-emulator e2e.
- [x] **Wellness report engine + public report page + WhatsApp send**
- [x] **Daily log + streaks + upline roll-ups** — including the Streak Shield (one grace day
      per month), now wired through to the UI.
- [x] **Targets + proof validation**
- [x] **Privacy toggle UI in Settings** — and it is genuinely reachable: `PATCH /api/me` accepts
      `shareProspects` as a strict boolean.
- [x] **Phase 7 Threads** — compose, direct-vs-entire-line scope, acknowledge receipts with live
      counters, re-broadcast with attribution.
- [x] **Organisation workspaces (Feature C)** — the multi-tenant foundation.
      `users.workspaceId` is the single authority, written in the SAME transaction as the
      user so a coach cannot exist without one. Referral signup joins the sponsor's
      workspace; an unsponsored signup starts and owns its own — there is no shared default
      for strangers to land in together. Owner-only settings at `/workspace`: name, an
      accent restricted to the palette, and level names that start empty and are never
      suggested (RULES L1/L8). Verified: **16 isolation checks**
      (`npm run test:rules:workspaces`) which pair every denial with the permission it
      mirrors, so the suite cannot pass against a deny-all; and **12 placement checks**
      (`npm run verify:workspaces`). Server-side owner enforcement confirmed by hand — a
      member's PATCH gets 404, not just a hidden form.

- [x] **Portfolio Basic (F9)** — the last unbuilt piece of the v1 MVP. Root-level
      `growline.in/<slug>`: photo, name, city, headline, story, "Message me on WhatsApp"
      and "Join my club", with the free-tier watermark. The slug is claimed
      transactionally through a reservation document whose id IS the slug (D41's shape),
      and releasing the old name happens in the same transaction as claiming the new one.
      Publishing is its own switch, driven by the server response rather than
      optimistically. The WhatsApp button is a redirect route rather than a `wa.me` href,
      because this is the one page in the app that asks to be indexed and a personal
      mobile number does not belong in crawlable HTML. Reachable from More. Verified:
      **24 unit tests + 2 e2e** in which a real signed-out browser reads a published page
      and gets a 404 on an unpublished one — the test that caught the auth gate eating
      the entire feature (🐛 #19).
- [x] **Feature A — Goal Sheet ("My Why") + the target conversation** — the whole feature,
      not the foundation. The three-step sheet with a skip on every step and a completion
      meter counting STEPS not fields (`GoalSheetForm.tsx`); the personal-reason panel in
      the calm register with sharing OFF by default; the upline gate that puts the sheet in
      front of the number rather than beside it, with the old inline input removed from
      `LineTargets.tsx` so there is no way around it (`TargetGate.tsx`); the reverse-math
      running volume-in/activity-out with every assumption editable and a warning when the
      arithmetic asks for more hours than the coach said they have; blockers-become-actions,
      one line per ticked blocker and the free-text note as context rather than a seventh
      input row; "I accept this target" and "Ask to talk" on the home screen, disappearing
      the moment there is nothing to do (`TargetToAccept.tsx`); the month-end review; and the
      nudge that fires after the first prospect and **never at signup** — asked before a
      coach has used the app once, the sheet fills with a throwaway answer nobody revises,
      which is worse than empty. Verified: **19 privacy checks**
      (`npm run test:rules:goals`, up from 13 — the six new ones prove the grandparent
      cannot read a renegotiation and that nobody can accept from a browser) and **47 unit
      tests**. **Only the dream photo is outstanding**, blocked on Storage being deny-all
      (D49).

**Not messy, worth stating:** three independent audit passes read `firestore.rules` for
different reasons and described it identically — `users` deny-all, the `prospects`
`shareProspects` gate, `dailyLogs`/`targets` deny-all. The privacy core is consistent.

---

## 🟡 IN PROGRESS / PARTIAL

- [ ] **Firebase migration** — done: Auth, Firestore, Security Rules, Cloud Functions.
      **missing:** Storage is deny-all and unused (photos and proof media are still base64 data
      URLs, D49); **FCM was never built — push still runs Web Push/VAPID.** · branch: both
- [ ] **Design System 2.0** — done: dark-default token layer, gold/jewel palette, serif+sans,
      screens reskinned. **missing:** the 8-item Jewel Asset Pack (`assets/jewels/`) does not
      exist; tier plaques/medals have nowhere to render until Tiers ships. · branch: both
- [ ] **Mode A consent** — done: the tick, strict server enforcement, survives the offline
      queue. **missing:** the itemized privacy-notice link the same spec item requires (D61).
- [ ] **Bundled fonts (Kannada/Devanagari + bold)** — done: real TTFs committed, no Google fetch
      at render time, prospect names no longer leak to Google. **missing:** satori does no
      complex-script shaping, so Indic names still render *incorrectly* (D66). The tests check
      glyph coverage, not shaping, so they cannot catch this.
- [ ] **Retention purge (180 days)** — done: the Cloud Function exists and is scheduled.
      **missing:** it purges by **record age, not inactivity**, contradicting the spec — see 🐛 #3.
- [ ] **Automated tests + CI** — done: CI runs unit (497), **all seven rules suites (178
      assertions, every one now blocking)**, `functions/` typecheck, re-parent verification,
      and e2e (43). **missing:** no tests inside `functions/` itself — typechecking is not
      the same as knowing the retention purge selects the right rows (🐛 #3, #6). And the
      whole suite runs against emulators only, which is 🐛 #17: the emulator invents missing
      composite indexes, so no test here can fail the way production will.
- [ ] **F13 Leaderboards** — built with rules and tests, but inert (see 🐛 #1) and disputed (⚠️ A).
      · branch: `feature/new-modules` only
- [ ] **F14 Event qualification** — same. · branch: `feature/new-modules` only
- [ ] **F20 Duplication score** — same, and its page permanently reads "nothing counted yet".
      · branch: `feature/new-modules` only
- [ ] **Quick wins (voice-note log, who-to-call, silence alerts)** — built, but unreachable from
      the nav and their Cloud Functions never deploy. · branch: `feature/new-modules` only
- [ ] **Branch/repo hygiene** — a stray git worktree, an uncommitted lint fix, two parallel
      decision logs. See ⚠️ C and 🐛 #10.

---

## ⚠️ CONFLICTS / DUPLICATES — resolve before building anything new

**A. Phase-2 work shipped early, against RULES S7.**
`F13 Leaderboards` is not an approximate match to CLAUDE.md §8's Phase-2 list — it is the line
item, *"Team leaderboards (weekly, monthly) with opt-out."* F20 plausibly maps to §8's
"advanced team analytics". §8's bar is **200 paying users**; there are zero, and payments are
NOT STARTED. None of F13/F14/F20 or the quick-wins appear in `CLAUDE.md`, `BUILD_PROMPT_V2.md`
or `RULES.md` at all.
→ **Recommendation:** owner decision, not an engineering one. Either formally authorise them
(and write that into `DECISIONS.md`), or hold `feature/new-modules` unmerged until Portfolio
and Tiers land. Do not merge silently — that converts a rule breach into precedent.

**B. FCM vs Web Push — the spec override was never reconciled.**
`BUILD_PROMPT_V2` §3 says *"FCM replaces Web Push/VAPID entirely"*, and v2 wins on conflict.
`DECISIONS.md` D22 still records VAPID as the decision, and the code still runs it.
→ **Recommendation:** keep VAPID for now (it works for web), but record the deferral in
`DECISIONS.md` explicitly. It becomes blocking at Phase 10 — Capacitor Android has no other
delivery path.

**C. Two parallel decision logs, both claiming to be canonical.**
`DECISIONS.md` (D1–D67) and `src/modules/DECISIONS-new-modules.md` (1,229 lines, N-series, on
`feature/new-modules`). The second file's own header admits it: *"kept separate because every
line added to it is a merge conflict."*
→ **Recommendation:** fold the N-series into `DECISIONS.md` as part of resolving A. RULES E6
assumes one record; two that don't talk to each other is how a rule gets lost.

**D. `CRON_SECRET` / `timingSafeEqual` implemented three times.**
`src/app/api/notifications/daily/route.ts:130`, `src/app/api/leaderboards/rebuild/route.ts:17`,
and `src/modules/shared-new/cron.ts:17-38` — the last self-documents that it only covers "the
new" routes, not the two pre-existing ones.
→ **Recommendation:** one shared checker, all six cron routes through it. This is a security
check; three copies means three chances to get it wrong once.

**E. E7 ("push after every change") is being violated right now.**
`eslint.config.mjs` sits uncommitted with a complete, reasoned fix.
→ **Recommendation:** commit it or reject it. See 🐛 #10.

---

## ❌ NOT STARTED (dependency-ordered)

1. [ ] **Translated privacy notice** — depends on: the owner supplying legal entity name,
       grievance-officer contact and postal address, then native-speaker review (D61, D59).
       Independent of the chain below.
2. [ ] **Phase 8 Portfolio — BASIC IS DONE 2026-08-14, PRO is not.** Basic (F9) needed no
       Storage and is built: root-level `growline.in/<slug>`, transactional slug claim,
       headline/story, publish switch, WhatsApp + join buttons, free-tier watermark, and
       it is reachable from More. 24 unit tests + 2 e2e (a real signed-out stranger reads
       a published page and gets a 404 on an unpublished one). **Pro still depends on
       Firebase Storage** + a thumbnail function — the transformation gallery is the part
       that needs it, and building it on data-URLs would repeat the D3/D49 pattern v2 was
       meant to close.
3. [ ] **Phase 9 Tiers (Starter/Leader/Elite) + 2nd-downline trial trigger + Razorpay** —
       depends on: Portfolio, because the Leader tier's stated unlock *includes* Pro portfolio.
       This is also the gate the whole business model depends on, and it does not exist.
4. [ ] **Phase 10 — onboarding tour, Capacitor Android, Play Store prep** — depends on: Tiers,
       and on **FCM** (Web Push cannot reach a native app).
5. ~~[ ] **Feature A — Goal Sheet ("My Why")**~~ → **COMPLETE 2026-08-14**, moved to ✅ DONE.
6. [ ] **Feature B — Recognition Wall** — depends on: workspaces (done) for its scope, and on
       `src/app/(app)/page.tsx` to sit below Today's Mission. Its card types read from F13
       leaderboards and F14 qualifications, so it also inherits ⚠️ A. Any card-generating
       Cloud Function must be exported in `functions/src/index.ts` or it is dead code.

---

## 🐛 BUGS FOUND (recorded, not fixed)

1. ~~**CRITICAL — six Cloud Functions are written but never exported from
   `functions/src/index.ts`, so none of them deploy.**~~ **FIXED 2026-08-12 on
   `feature/new-modules`.** All six now exported: `rebuildLeaderboards`,
   `evaluateQualifications`, `qualificationReminders`, `rebuildDuplicationScores`,
   `silenceCheck`, `purgeVoiceNotes`. Verified by compiling — `functions/lib/index.js` exposes
   all nine functions (the three originals plus these six). `functions/` typechecks clean.
   **Still blocked on one thing:** `CRON_SECRET` is blank in `.env.example`, so every one of
   them fails closed until it is provisioned in the real deployment. Exporting was necessary,
   not sufficient. See also ⚠️ A — four of the six belong to features whose authorisation is
   still an open question; exporting fixed the code, it did not settle whether it should ship.
16. **HIGH — `npm run e2e` failed all 43 tests on a machine with no web server, and it
    looked like the app was broken.** Happened twice in one session on 2026-08-14; the
    second time it was briefly read as a real regression before the log showed 43×
    `ECONNREFUSED 127.0.0.1:3000`. `playwright.config.ts` had no `webServer` block, so the
    suite assumed somebody had run `next start` in another terminal — true in CI, where
    `ci-integration.sh` starts one, and false on every developer machine.
    → **FIXED 2026-08-14**: `webServer` with `command: "npx next start"` and
    `reuseExistingServer: true`. Reuse is unconditional rather than the usual
    `!process.env.CI`, because CI starts its own server inside the emulator lifetime and
    Playwright must attach to it rather than race a second process for port 3000.

19. ~~**BLOCKER — the public portfolio was not public.**~~ **FIXED 2026-08-14, same day
    it was written.** `proxy.ts` redirects anything without a session to `/login`, and a
    coach's page lives at the ROOT — so every prospect following a printed link would
    have landed on a login screen for an app they will never install. The feature was
    entirely decorative and `next build`, `tsc` and 528 unit tests all passed anyway.
    Found only by writing the e2e test that opens the page as a real signed-out stranger.
    → The gate now treats a lowercase single segment as a portfolio **unless it is in
    `RESERVED_SLUGS`** — the same list that stops a coach claiming a name a route would
    shadow, so the two can never disagree, and the filesystem-driven test keeps it true
    as routes are added.
    **The lesson worth keeping: a public page needs a test that visits it with no
    session.** Nothing else in the stack can tell you the auth gate is eating it.

20. ~~**MEDIUM — the publish switch reported success before the server agreed.**~~
    **FIXED 2026-08-14.** It flipped local state and saved afterwards, so "Your page is
    live" rendered while the request was still in flight — and a failed save left the
    switch flipped over a page nobody could see. State now comes from the response.

18. **MEDIUM — `npm run e2e:reset` did not re-seed, so fixture dates aged into failures
    that read as app bugs.** The name and the docs both present it as the thing you run
    before e2e, but it only reset the emulator and re-migrated — from a `dev.db` that might
    have been seeded days ago. On 2026-08-14 that produced `e2e/session4.spec.ts:105`
    expecting "1 day late" and getting "2 days late", which is bug #12 returning by a
    different route: #12 fixed the fixture to be relative to when it is WRITTEN, and this is
    the case where it is never rewritten. Both failures in that run
    (`session4` and the `realtime` flake) passed immediately after a manual `db:seed`.
    → **FIXED 2026-08-14**: `e2e:reset` now runs `db:seed` first, and CI's separate
    `db:seed` line is removed rather than duplicated.

17. **BLOCKER (unresolved) — nothing has ever run against real Firebase, and the emulator
    is more permissive than production in a way no test can see.** A query needing a
    composite index that does not exist throws `FAILED_PRECONDITION` the first time a real
    coach opens the screen; the emulator creates missing indexes silently on demand, so
    every suite here passes against an instance that cannot reproduce the failure. CI is
    structurally incapable of catching this and it is the most likely launch-day outage.
    → **Partly addressed 2026-08-14**: `npm run verify:indexes` runs all twenty compound
    query shapes and reports the ones Firestore refuses, surfacing the console URL that
    creates each missing index. It uses ids that cannot exist, so it is safe against
    production data. **This is not closed until somebody runs it against the real project
    with the emulator host variables unset.** Against the emulator it passes trivially, and
    the script says so rather than reporting a pass.

2. ~~**HIGH — four of five Security Rules suites (88 assertions) never run in CI.**~~
   **FIXED 2026-08-14.** All six previously-unwired suites — boards, quals, duplication,
   session4, workspaces, goals — now run inside the same emulator lifetime as the mandatory
   prospects suite in `.github/scripts/ci-integration.sh`, and every one blocks the merge.
   **178 rules assertions across 7 suites** are enforced now rather than optional.
3. **HIGH — `purgeStaleHealthData` purges by record age, not inactivity**
   (`functions/src/index.ts:117-128`), contradicting BUILD_PROMPT_V2 §5.3 / RULES P5's literal
   *"180 days of prospect inactivity — no stage change, no report view."* No `lastActivityAt`
   field exists to measure it. A prospect worked yesterday but captured 200 days ago has their
   health data nulled anyway. **Unlike every other deliberate simplification here, this one has
   no `DECISIONS.md` entry.**
4. **MEDIUM — push still on Web Push/VAPID, not FCM.** Works for web; means Phase 10's Android
   delivery starts from scratch. See ⚠️ B.
5. **MEDIUM — `/voice-log` and `/who-to-call` are unreachable from any navigation.** Only via
   `/more` or a typed URL (`AppNav.tsx:29-33`). Documented as deliberate, but as shipped a coach
   following the UI never finds them.
6. ~~**MEDIUM — the `functions/` package is not built, typechecked or tested in CI**~~
   **PARTLY FIXED 2026-08-14.** `.github/workflows/ci.yml` now runs `npm ci` and
   `npm run typecheck` in `functions/`, so a compile error in the retention purge — the one
   job that irreversibly deletes user data — can no longer reach deploy. Still no TESTS in
   that package: typechecking is not the same as knowing the purge selects the right rows,
   and bug #3 is exactly the kind of thing a typecheck cannot see.
7. ~~**LOW — stale home-screen copy.**~~ **FIXED 2026-08-14.** The "Coming next on Growline"
   card is removed rather than trimmed: both features it promised — targets with your
   upline, messages from your line — now exist, and a card promising what the user already
   has reads as a dead app. It returns when there is a real next thing to promise.
8. **LOW — proof photos are still base64 in Firestore; video proofs unsupported** despite the
   spec saying Firebase unblocks them. Documented (D49).
9. **LOW — one `todo` test in `tests/wellness.test.ts`** records that the healthy-weight upper
   bound doesn't round-trip to the "In the general range" label at every height.
10. ~~**LOW — `eslint.config.mjs` uncommitted.**~~ **FIXED 2026-08-12.** Now ignores `.claude/**`
    (a stray agent worktree otherwise makes lint report 687 errors / 13,525 warnings from a
    clean tree) and `functions/lib/**` (the Cloud Functions build output is CommonJS, so it
    trips `no-require-imports` 15 times the moment anybody builds before deploying). Git
    already ignored both; these are the lint half of the same fact. The stray worktree at
    `.claude/worktrees/continue-previous-3413cb` still exists and is still nobody's.
11. ~~**HIGH — `feature/new-modules` does not pass lint, so CI fails on it.**~~ **FIXED
    2026-08-12.** `src/modules/voice-log/Recorder.tsx` mirrored a browser capability into
    state with `useEffect(() => setPhase(canRecord() ? … ), [])` — a synchronous setState on
    every mount, so the component rendered "checking", threw it away and rendered again. Now
    read through `useSyncExternalStore`, the same fix `ThemeToggle` needed for the same
    reason. A lazy `useState` initialiser would NOT have worked: `canRecord()` touches
    `MediaRecorder` and `navigator.mediaDevices`, neither of which exists during the server
    render, so it would have traded a lint error for a hydration mismatch. All five real
    phase transitions are untouched. Verified in a browser: the server ships the skeleton,
    the client hydrates to "Hold to record", and the console shows no hydration mismatch.
    Lint is now **0 errors** on this branch; 4 unused-variable warnings remain in
    `e2e/session4.spec.ts` and `src/modules/voice-log/queries.ts` (warnings do not block).

12. ~~**MEDIUM — `e2e/session4.spec.ts:71` fails, and gets worse every day.**~~ **FIXED
    2026-08-13.** The app was right ("2 days late"); the fixture was stale. Both
    `scripts/seed-sqlite.ts` and `scripts/verify-migration.ts` had hardcoded absolute dates,
    so a fixture meaning "yesterday" was only true for 24 hours. Everything is now derived
    from the real clock through `day.ts` (RULES E1 — "yesterday" between midnight and 05:30
    IST is a different day in UTC).

    Three things this surfaced that were not obvious, all now written into the code:
    - `memberships: key === "2026-08-09"` compared against the *old* fixed date, so going
      relative would have silently seeded **zero** memberships everywhere.
    - `verify-migration.ts` asserts Meera's follow-up is in the **future**, while
      `session4.spec.ts` needs her **late**. Both are right: the verifier now passes an
      explicit `as of three days ago` to `followupCounts`, which is exactly what that
      parameter exists for.
    - Logs must **not** be dated today. A qualification counts `daysActive` and
      `newMembers` inside a window that opens when it is created, so a log dated today
      lands inside every fresh qualification and `qualifications.spec.ts` — which asserts a
      coach starting from zero — breaks. The old seed got this right *by accident*, because
      it had gone stale. It is now deliberate, with the trade recorded: seeded coaches have
      no live streak, which is the lesser problem.

13. **HIGH — Playwright loads every `e2e/*.test.ts` and one of them can end the run early
    while still exiting 0.** `playwright.config.ts` sets `testDir: "./e2e"` and **no
    `testMatch`**, so the default pattern matches `*.test.ts` as well as `*.spec.ts`. The
    six Security-Rules suites live there as plain `tsx` scripts that run `main()` at module
    scope and finish with `process.exit()`. Playwright executes them while discovering
    tests, and whichever `process.exit(0)` lands first truncates the run — **no summary, a
    fraction of the tests executed, exit code 0.** Caught because adding a sixth suite
    shifted the timing enough to make it happen every time; it has been latent, and a green
    e2e on this branch has been partly luck. It was also masking a real failure: with the
    truncation gone the suite immediately reported one.
    → ~~Fix is one line~~ **FIXED 2026-08-13**: `testMatch: "**/*.spec.ts"` in `playwright.config.ts`. Was NOT
    applied — that file is outside the five approved for this session. Worked around for
    now by keeping the new suite at `scripts/verify-workspace-rules.ts` instead, which is
    structurally immune; the five older suites are still in `e2e/` and still hazardous.
14. **MEDIUM — `/workspace` is not reachable from any navigation.** URL-only, same position
    as `/voice-log` and `/who-to-call` (🐛 #5). The bottom bar is full at five tabs and a
    sixth is the owner's call.
15. **MEDIUM — the backfill must run after any migration or reset, before signups.**
    `seed-sqlite.ts` and `migrate-to-firestore.ts` write no `workspaceId` (both are outside
    the approved file set), so a fresh database has every coach unassigned until
    `npm run backfill:workspaces` runs. `createUser` fails visibly rather than silently in
    that window — an upline with no workspace does not hand down an empty one, the new coach
    starts their own — but that leaves a tree straddling two workspaces, which is the one
    thing the referral rule exists to prevent. `npm run backfill:workspaces -- --check`
    exits non-zero while anyone is unassigned, which is what makes this enforceable.

**Flaky, not broken:** `e2e/realtime.spec.ts` failed once in a full run and passed alone
and on the very next full run (43/43). Shared emulator state and ordering, same family as
D44. Watch it; do not "fix" it by weakening the assertion.

**Previously-failing test, now passing:** `e2e/offline-capture.spec.ts` failed once on
`claude/mobile-pc-workflow-test-alhnwl` right after the font commit (queued capture never
synced). It passes on `feature/new-modules` — **43 of 43 e2e green**. Did not reproduce;
cause never confirmed. Worth watching rather than closing.

---

## 🚫 BLOCKED / NEEDS A HUMAN DECISION

**Authorisation**
- F13 / F14 / F20 / quick-wins map onto CLAUDE.md §8's Phase-2 list, which RULES S7 says to park
  until 200 paying users (there are none). **Authorise and fold in, or hold unmerged?**
- Who may add the six missing exports to `functions/src/index.ts` — the file every new-module
  session declares itself "not permitted to edit"?
- Is `CRON_SECRET` provisioned in the real deployment, for the six new jobs *and* the two
  existing ones (`morningReminder`, `purgeStaleHealthData`)?

**Architecture**
- Storage: deferred until something forces it, or does v2.1b stay incomplete until Storage +
  the resize function land — and does Portfolio block on it?
- FCM: required now per §3's literal language, or acceptable to defer to the Capacitor build?
- Who produces the 8-item Jewel Asset Pack? Not derivable from code.

**Compliance**
- Owner must supply: **legal entity name, grievance-officer contact, postal address** — the
  privacy notice cannot be written without them.
- **Native-speaker review** of the four UI translations before any of that text ships.
- `purgeStaleHealthData`: fix to key off true last activity, or accept age-based purge as an
  intentional simplification? Either way it needs a `DECISIONS.md` entry.

**Process**
- Wire the four unwired rules suites into CI?
- A 6th nav tab for voice-log / who-to-call, or a link from Home?
- Commit or reject the pending `eslint.config.mjs` fix; remove the stray worktree?

---

## 🧊 PARKED — awaiting spec

- ~~Goal-sheet conversations~~ — **now specced.** Feature A: the sheet ("My Why"), direct-upline-only
  visibility with personal-needs private by default, goal-first target setting, a
  reverse-math suggestion the humans can override, "I accept this target", and blockers
  that become trackable actions. **Not built** — see ❌ below.
- ~~Social recognition wall~~ — **now specced.** Feature B: six auto-earned card types, nothing
  manually posted, own-workspace scope only, one 👏 reaction, 14-day expiry, per-user
  opt-out, shareable to WhatsApp Status. **Not built** — see ❌ below.
- ~~Org workspaces~~ — **BUILT.** See ✅ above.
- Pro Portfolio upsell mechanics (v1 §7) — beyond the basic feature flag
- Phase 2 (CLAUDE.md §8): social feed, event manager, poster library, club-owner module,
  advanced analytics + PDF export
