# HANDOFF — mobile ↔ PC round-trip test

This file is the baton. Whoever finishes a stretch of work writes the last
entry; whoever picks it up next reads the last entry first.

Branch under test: `claude/mobile-pc-workflow-test-alhnwl`

---

## The round-trip test

Three legs. Each leg is done from a different place. If all three land, the
flow works and we can trust it for real work.

- [x] **Leg 1 — phone → cloud.** Asked from the phone, ran in a Claude Code
      web session, wrote this file, pushed to the branch. (Done, see entry
      below.)
- [x] **Leg 2 — cloud → PC.** Done. Fetched, checked out, installed, and ran the
      whole verification chain on Windows. It did not pass as received — four
      things only a real PC could surface. See "What the PC leg found" below.
- [ ] **Leg 3 — PC → phone.** From the phone, ask this session (or a new one)
      to pull and read the file back. If it can read the line the PC wrote,
      the loop is closed.

---

## Handoff log

Append a row every time you hand the work over. Newest at the bottom.

| # | From | What was done | Where it stopped / what's next |
|---|------|---------------|-------------------------------|
| 1 | Phone → Claude Code web | Pulled the repo, created this file on the test branch, pushed. | Waiting on the PC leg. |
| 2 | Phone → Claude Code web | Landed `BUILD_PROMPT_V2.md`; pointed `CLAUDE.md` and `DECISIONS.md` at it so v2 wins on conflict. No code touched. | v2.1a not started. |
| 3 | Phone → Claude Code web | Wrote `PLAN_V2.1a.md` (read the real code first) and `RULES.md`. Found a sequencing conflict in v2 §11 — see plan §5. Still no code touched. | **Waiting on 3 approvals in `PLAN_V2.1a.md` §9.** Emulator work can start the moment they land. |
| 4 | Phone → Claude Code web | Built the v2.1a foundation: Firebase config, emulator setup, `collections.ts`, migration + seed + verify scripts. 16/16 verification checks pass; `next build` and `tsc --noEmit` clean. | Auth swap and the 18 `lib/db` call sites are next. App still runs on Prisma. |
| 5 | Phone → Claude Code web | Auth swapped onto Firebase: session cookies, phone auth in the browser, signup tokens retired. Deleted `otp.ts`, `referral.ts`, both OTP routes. Build + typecheck clean, 16/16 migration checks. | ~15 data call sites still on Prisma (prospects, logs, targets, team, push, reports). |
| 6 | Phone → Claude Code web | Ported to Firestore: team tree (no `groupBy`), prospects, reports, public routes. Found and fixed an erasure bug — Firestore does not cascade deletes. Build clean, 27/27 checks. | **13 files still on Prisma** — see below. |
| 7 | Phone → Claude Code web | Ported everything left: daily log, follow-ups, targets/proofs, push, remaining routes and pages. **Prisma removed from the app.** 40 assertions pass. | v2.1a code complete. Cutover needs a real Firebase project; login flow unproven in a browser. |
| 8 | Phone → Claude Code web | Playwright e2e in real Chromium: signup with referral, existing-coach login, public capture noindex, **and the offline queue with the signal cut mid-capture**. 4/4 pass. | 6 of 9 parity-gate items closed. Next: v2.1b. |
| 9 | Phone → Claude Code web | v2.1b: real Security Rules + **21 rules checks incl. both mandatory ones**, Cloud Functions (counter, morning reminder, 180-day purge), Storage rules, realtime QR listener. | FCM delivery + deploy need a real project. |
| 10 | Phone → Claude Code web | v2.2a started: Dark Achiever token layer, theme switching (5 tests), NeoPOP/gem/metal components. Recorded D39 — "dark by default" vs "respect the system" genuinely conflict on the web. | Screens not yet reskinned; v1 palette aliases still in place. |
| 11 | Phone → Claude Code web | Target ring (remaining arc) + streak flame wired into targets and log. 4 design-rule tests: arc direction, no-money copy, no backdrop-filter anywhere, theme switch persists. | 14 e2e, 21 rules, 29 data — all green. Home + Today's Mission next. |
| 12 | Phone → Claude Code web | Today's Mission card + home reskin. Recorded **D40** — v2 §4's own example copy carries a "₹-equivalent" that L4/D30 forbid; built with points only. | 15 e2e, 21 rules, 29 data. v2.2b (capture/pipeline/report/team/settings) next. |
| 13 | Phone → Claude Code web | v2.2b: full token sweep (v1 aliases removed), contrast tripwire in both themes, Weekly Recap card. Found and fixed 3 invisible-text bugs the sweep itself introduced. | 18 e2e, 21 rules, 29 data. v2.2 done bar the Jewel assets. |
| 14 | PC (Windows) | Verified the branch end to end on real hardware. Fixed 4 things that only fail off-container: root tsconfig compiled `functions/`, 3 setState-in-effect lint errors, a Linux-only Chromium path in `playwright.config.ts`, and an undocumented `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST`. Now green: 18/18 e2e, 21/21 rules, migrate:verify all-pass, build + typecheck + lint clean. Also ran a 6-lens audit — phases 1-6 parity survived intact, but it found a **critical missing-index problem the emulator structurally cannot catch**. | Leg 3 is open: read this from the phone. Before cutover, work the "Audit findings" list — the index gap and referral-code uniqueness are the two that bite in production. |

---

## What the PC leg found

The branch arrived claiming "build + typecheck clean, 18 e2e, 21 rules". On a Windows
PC, **none of the three suites could run as received.** Every cause was environmental
— which is exactly the class of bug a cloud container cannot see, and the reason
rule 4 puts verification here.

1. **Root `tsconfig.json` compiled `functions/`.** `include: ["**/*.ts"]` swept in the
   Cloud Functions source, whose deps live in `functions/node_modules` and were never
   installed. 4 errors. `functions/` has its own tsconfig and a `predeploy` build, so
   it is now in the root `exclude`.
2. **Three `setState`-in-effect lint errors** in `TargetRing.tsx` (×2) and
   `ThemeToggle.tsx`, from the late v2.2 commits. `ThemeToggle` now reads
   `data-theme` through `useSyncExternalStore` — the attribute is an external store,
   not component state. `TargetRing` defers both to `requestAnimationFrame`.
3. **`playwright.config.ts` hardcoded `/opt/pw-browsers/chromium`** — a Linux path.
   The e2e suite could not start on Windows at all. Now resolved per machine:
   `PW_CHROMIUM_PATH`, else the container binary, else the installed Chrome. Never a
   download.
4. **`NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` was undocumented.** `src/lib/firebase.ts:74`
   needs it for the browser Firestore client, but `.env.example` only had the
   server-side var. Without it the browser silently talks to a **real** project while
   the server talks to the emulator: nothing errors, the realtime row just never
   arrives. That was the `realtime.spec.ts` failure.

`offline-capture.spec.ts` also failed in-suite while passing alone. It was collateral:
the Weekly Recap test's `delete navigator.share` is a no-op (`share` is on
`Navigator.prototype`), so in a real Chrome the app correctly called Web Share and the
stubbed `window.open` never fired. Fixing the stub with `Object.defineProperty` fixed
both tests. **The app was right; the test was wrong.** Headless Chromium has no
`navigator.share`, which is why the container never saw it.

## Audit findings — work these before cutover

Six independent lenses over the port. **The good news first: parity held.** 12 of 13
phase 1-6 guarantees verified intact — wa.me country codes, the disclaimer on all six
surfaces, non-clinical BMI labels, body-fat ranges, plausibility guards, under-18
refusal, ~130-bit tokens with expiry on every surface, neutral OG image, capture
idempotency (moved from a unique constraint to the doc id), canvas re-encode, no
level-name suggestions, direct-only target authorization, the 6-field log.

What needs work, worst first:

- **CRITICAL — `firestore.indexes.json` is missing composite indexes for ~5 shipped
  queries.** They fail with `FAILED_PRECONDITION` against a real project. **The
  emulator auto-creates indexes on demand, so no suite here can ever catch this** —
  not e2e, not rules. One of the missing ones silently disables the 180-day health-data
  purge, which is a compliance control, not a nicety. This is the single largest
  cutover risk on the branch.
- **HIGH — `unique(referralCode)` was dropped.** D35 tables four Prisma constraints
  re-expressed as doc ids; the schema had six. `generateReferralCode()` kept its
  read-then-write loop but lost the constraint underneath it. A collision reroutes one
  coach's QR captures and downlines to another. `reports.token` lost its constraint the
  same way.
- **HIGH — logout never invalidates the session.** `revokeRefreshTokens` appears
  nowhere, so `checkRevoked: true` is inert and a stolen cookie outlives logout for 14
  days.
- **HIGH — the boot guard checks only the Firestore emulator var.** Setting
  `FIREBASE_AUTH_EMULATOR_HOST` in production would disable ID-token signature
  verification while `usingEmulators` still reads false. A one-variable mistake with no
  guard rail.
- **HIGH — Storage rules let any signed-in coach read any other coach's proof media.**
  Latent, not live: nothing uses Storage yet (no `storageBucket` in the client config,
  media is still base64 in Firestore). Must be fixed before Storage is switched on, and
  it has no tests.
- **MEDIUM — an upline reads the downline's whole user document,** phone number
  included. Firestore has no field-level reads, so the rule's comment ("the upline sees
  the summary fields") is not what the grant does.
- **MEDIUM — the shared-prospect listing does two `get()` per document.** Firestore
  caps document access at 20 per query, so it fails once a sharing downline has ~10
  prospects. Only ever tested against a one-document fixture.
- **MEDIUM — the F11 toggle's allow-branch is unreachable.** Nothing can set
  `shareProspects` to true: `createUser` hardcodes false and the PATCH handler does not
  accept it. The rule is right, the switch still does not exist.
- **MEDIUM — `dailyLogs` and `targets` authorize off a write-time `uplinePath` snapshot,**
  so access does not follow re-parenting. `prospects` resolves the coach live; these two
  do not.

Full detail, including the low-severity items and the non-atomic `saveLog` /
`setTarget` reads, is in the audit transcript for this session.

## Rules that keep this from breaking

1. **One branch at a time.** Both devices work on the same branch. Do not
   start a second branch for the same task — that is how the two copies drift.
2. **Pull before you touch anything.** Every session, both devices, no
   exceptions. `git pull` costs two seconds; a conflict costs an evening.
3. **Push before you put the device down.** Uncommitted work on a PC that is
   sitting at home is work the phone cannot see. The cloud session's container
   is wiped when it goes idle, so unpushed work there is simply gone.
4. **Phone decides, PC verifies.** Anything that needs a running app, a build,
   a device, or a real look at the screen belongs on the PC. Everything else —
   planning, reading, writing code, reviewing, small fixes — is fine from the
   phone.
5. **Write the handoff row before you stop.** Future-you on the other device
   has none of the context current-you has.
6. **Push after every change, however small.** Not once at the end of a session —
   after *each* discrete change, as it is finished. A file written, a bug fixed,
   a script proven to run: commit it and push it, then carry on. Never batch a
   session's work into one commit at the end.

   Two reasons, and the second is the one that bites. An hour of unpushed work
   is an hour a reclaimed container can delete. And a single fat commit is
   unreviewable from a phone — small commits are the only way the other device
   can actually see what changed.

   This also means pushing *before* asking a question: a question can wait in a
   chat window for hours, but unpushed work cannot. Never end a turn holding it.

---

## Running the migration locally

```bash
npm run emulators        # auth :9099, firestore :8080, UI :4000
npm run db:seed          # representative dev.db (3-level tree, month boundary)
npm run migrate:firestore
npm run migrate:verify   # 16 assertions — the real parity evidence
```

Both migration scripts are safe to re-run. The migration refuses to touch a real
project unless `MIGRATE_ALLOW_PRODUCTION=1` is set deliberately.

## Running the e2e suite

```bash
npm run emulators          # terminal 1 — if it says "port taken", kill the
                           # orphan first: pkill -f cloud-firestore-emulator
                           # The emulator holds state in MEMORY and dies easily.
                           # After any restart, re-run migrate:firestore or the
                           # e2e suite fails with "element not found" at login.
npm run db:seed && npm run migrate:firestore
npm run build && npx next start    # terminal 2
npm run e2e                # 5 tests, real Chromium
npm run test:rules         # 21 Security Rules checks
# e2e is now 10 tests: signup, offline, realtime, theme
```

The Auth emulator exposes the codes it "sends" over REST, so phone auth is
drivable with no SMS and no reCAPTCHA. Chromium is already on the machine —
`playwright.config.ts` points at it, so **do not run `playwright install`**.

## v2.1a code work: DONE

Nothing in `src/` imports a database layer any more. `db.ts` and `jose` are gone.
Prisma remains only as a devDependency, because the migration script reads the
SQLite source; it goes when cutover is done.

40 assertions pass (`npm run migrate:verify`), `next build` and `tsc --noEmit`
clean.

**Four Firestore traps found while porting — worth knowing before v2.1b:**

1. **No cascading deletes.** Erasure deleted the prospect and left the reports —
   live bearer tokens to the health data being erased. Returned `{ok: true}`.
2. **`null` sorts before every timestamp.** A plain `< today` range counted every
   prospect with no follow-up date as overdue.
3. **No relational filters.** `where: { target: { coachId } }` cannot reach
   through a reference; `coachId` is denormalised onto proofs instead.
4. **`settings()` may be called once per Firestore instance, ever.** Caching it
   only in dev — the shape D1 used for Prisma — breaks `next build`.

None of these announce themselves. Two would have passed every test that existed.

## Blocking cutover (not the build)

The Firebase migration cannot start from a cloud session alone. Someone with
console access has to do these first — none of them are code:

1. Create the Firebase project and **enable the Blaze plan** (Cloud Functions,
   Cloud Scheduler and App Hosting all require it; Spark cannot run any of them).
2. Enable **Phone** as an Auth provider, and confirm SMS pricing and delivery for
   Indian numbers.
3. Put the web app config + a service-account key into `.env` (and confirm
   whether App Hosting actually supports Next.js 16.3 — if not, v2 §3 pre-approves
   the Vercel-front fallback, with the reason written into `DECISIONS.md`).

Until those exist, a session can write migration code but cannot run or verify it,
and v2 §3's parity gate says nothing new gets built on an unverified migration.

## Where this repo sits, and what needs a PC

Current state: phases 1–6 complete. Build order is now **v2 §11**, one session at
a time — so the natural unit of a handoff here is one build session.

Keep these on the PC leg — they cannot be confirmed from a phone session:

- The Android/Capacitor build and anything Play Store related.
- Razorpay mandate testing and webhook delivery (needs a reachable local
  tunnel and a real UPI app).
- Looking at a screen: the 30-second rule in `CLAUDE.md` §4 is a stopwatch
  test on a real cheap Android, not something a cloud session can judge.
- Scanning a real QR code with a real phone camera for the Mode B capture
  flow.

Everything else — planning a phase, writing the code, schema work, reviews,
copy — runs fine in a cloud session started from the phone.

Per `CLAUDE.md` §5, nothing in this repo names a nutrition or direct-selling
company. That applies to this file too.
