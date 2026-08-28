# Handoff — what to build next

Written 2026-08-28, at the point the project changed hands. Everything here was
verified against the code on the day it was written, not recalled.

**If you read nothing else, read [§2 The critical path](#2-the-critical-path-to-a-real-pilot).**
It is the difference between "the app is live" and "a coach can use it."

---

## 1. Where things stand

Growline is **live in production** at
`https://growline--grow--line.asia-east1.hosted.app`, on Firebase App Hosting,
project `grow--line`. A coach can sign up with email, capture a prospect, generate
a wellness report, send it on WhatsApp, log their day, and see their team.

The build is substantial: **38 screens, 52 API routes, 16 feature modules**, and
**714 unit tests + 20 e2e specs + 8 Security Rules suites**, all green. Phases 1–9
of the original plan are built. Design System 3.2 ("Sunrise": warm cream ground,
burnt terracotta accent, glassmorphism, Nunito) is the current identity.

**What it cannot yet do:** send an SMS OTP, run any background job, show a legally
required privacy notice, take money, or notify anybody. None of those are missing
code — they are missing configuration and owner decisions. That is what §2 is.

---

## 2. THE CRITICAL PATH TO A REAL PILOT

Nothing below is optional if a coach who is not the owner is going to use this.
Ordered by what blocks what.

### Owner tasks — nobody else can do these

| # | Task | Why | Breaks if skipped |
|---|---|---|---|
| O1 | **Verify the Google Cloud billing account** | An unverified account is the suspected cause of the phone-OTP failure, and Google can suspend the project outright | SMS never works; project may be suspended |
| O2 | **Supply four legal facts**: legal entity name, named grievance officer, their email, postal address | DPDP Act 2023 + Rules 2025 require a reachable grievance officer *before* collecting a prospect's data | `/privacy` returns 404 by design; collecting prospect data is unlawful |
| O3 | **Decide the notification cap** (proposed: 2/day, morning + evening, never about money) | Needed before FCM copy is written | Nudges get built to a guess |
| O4 | **Commission the Jewel Asset Pack** (8 rendered 3D objects — flame, trophy, tier medals, growing tree, badge frame) | The only item in the whole plan that money buys and code cannot replace | Every hero moment stays an emoji |
| O5 | **Decide on Razorpay** — whether to charge at all yet | Five env vars + a dashboard setup | Everything stays free (which is a valid choice) |

### Developer tasks — in this order

**D1. Deploy the nine Cloud Functions. Nothing else on this list matters more.**
They have **never been deployed**. Eight are scheduled jobs; the ninth,
`onDailyLogWritten`, maintains `users.thisMonthActivity` — *the number the team
tree displays*. Until it ships, an upline watches their team and sees nothing
move: the accountability loop the entire product is built around (v1 §F6).

Prerequisites, both of which will fail the deploy if skipped:
- `CRON_SECRET` must exist in Secret Manager **first** — seven functions declare
  `secrets: ["CRON_SECRET"]`, and an unresolvable secret reference fails the
  *whole* deploy, not just that function.
- `functions/.env.grow--line` must carry `SITE_URL`. Seven functions call the
  app's own HTTP routes and return immediately without it — they deploy, report
  healthy, run on schedule, and **do nothing**. See `functions/.env.example`.

```
firebase functions:secrets:set CRON_SECRET --project grow--line
firebase deploy -P prod --only functions
```

**D2. Fix phone OTP, or formally accept email-only for the pilot.** (D82)
Production `sendVerificationCode` returns 400. Reverting to phone-first is one
line — `INITIAL_STEP` in `src/app/login/LoginFlow.tsx` — once SMS works. Until
then, note that phone numbers collected via email signup are **unverified**;
`complete-signup` still enforces uniqueness, and a verified token always wins, so
re-verification later needs no schema change.

**D3. Wire the four `PRIVACY_*` values** (from O2) into App Hosting as secrets.
`/privacy` publishes itself only when all four are present — deliberately
all-or-nothing, because a notice naming three of four fails the duty it exists to
discharge. See `src/modules/privacy/model.ts`.

**D4. Build coach-facing erasure.** `deleteProspect` has exactly **one** caller —
the prospect's own report-link removal route, which 404s once the link expires
(90 days). There is no coach-facing delete, no account deletion, and no data
export. The privacy notice was reworded to stop promising what does not exist,
but a DPDP erasure right currently has a human process behind it, not a button.
STATUS §16b. **Effort: M.**

**D5. Run `npm run verify:indexes` against production.** All 15 indexes are
deployed and `/status` reports 9/9, but the verifier walks *every* compound query
in the app, including screens nobody has opened yet. Needs a service-account key
locally. **Effort: S.**

**D6. Fix the health purge.** `functions/src/index.ts` filters
`.where("heightCm", "!=", null)`, and Firestore `!=` **excludes documents where
the field is absent** — capture requires only name and phone, so a prospect saved
with a weight but no height is never purged and their health data lives forever,
while the privacy notice promises deletion at 180 days. This is an
*under*-deletion bug, so current behaviour is the safe side; it is unfixed
deliberately because it lives in the one job that destroys data irreversibly and
wants a careful test. STATUS §16c. **Effort: M.**

**D7. App Check.** Ship the reCAPTCHA key, watch metrics for a few days, *then*
enforce. Enforcing before a key ships rejects every request. `src/lib/app-check.ts`.

---

## 3. The build queue after that

In dependency order. Effort: S = hours, M = a day or two, L = a week, XL = more.

### The delight programme (mid-flight)

A five-way visual comparison was run and "Sunrise" chosen; a ten-move plan follows
from a screen-by-screen audit that scored the app **3.3/10** against its own
design spec. Weeks 1 and most of 2 shipped. Remaining:

| Move | What | Effort |
|---|---|---|
| 9 | **Target ring on home** — a small remaining-arc ring on the My Target card, plus Today's Mission reframed as count-down ("3 of 6 follow-ups left today"), each item a depleting arc | M |
| 10 | **Mission completion states** — items flip to a tick in place; all three seals a "Day complete" state feeding a monthly tally | M |
| System B | **Share-card generator** — the biggest remaining win. Reuse the existing satori pipeline (`src/app/r/[token]/card.png`) to render the Weekly Recap and streak milestones as branded PNGs for WhatsApp Status. Strava's Stats Sticker, industrialised: the coach's pride becomes distribution, and the free-tier watermark rides along | L |
| — | **Jewel Asset Pack integration** — once O4 delivers, swap every emoji stand-in | M |

### First-run experience — the highest-value unbuilt thing

The owner's verdict on an empty account: *"it looks like a 1990s banking
application… people will not come back tomorrow."* All delight work so far targets
screens **with data**; a new coach has none. Strava and Duolingo both solve this by
getting a user into data inside sixty seconds. This is not in any spec yet and
should be designed. **Effort: L.**

### Features

| What | Notes | Effort |
|---|---|---|
| **Pro portfolio** (v2 §7) | Transformation gallery, testimonials, achievements, 3 themes, QR poster. **Blocked on Firebase Storage** (enabled but deny-all) + a thumbnail Cloud Function. Do not build on data-URLs — that repeats D3/D49 | L |
| **Onboarding tour** (v2 §9) | 3 screens, skippable | M |
| **FCM push** | Currently Web Push (VAPID). FCM is required before the Android build — Web Push cannot reach a native app | M |
| **Capacitor Android + Play Store** | Needs FCM first. Brand-neutral listing, Data Safety form covering health-adjacent fields | L |
| **Localisation** | Five languages are *offered*; roughly **nine in ten strings a coach reads are English** regardless of choice. `npx tsx scripts/audit-i18n.ts` measures it. Ten proposed translations await a native speaker — do not ship unverified (D72) | XL |
| **Promo codes / tier flip** | Built and tested; the flip is three coordinated changes and an **owner decision** (D70) | S |

---

## 4. Traps — these have already cost days

**Built but never mounted.** This has happened *three times*. A finished
`StreakFlame` that no screen rendered. A target-ring celebration gated on a prop
its only caller never passed — the confetti had never executed once. `.neopop`
and `.metal-gold` defined in CSS and used on two buttons. **Before building
anything, grep for it — it may already exist.**

**Firestore index direction must match exactly.** An index serves a query only if
*every field direction* matches. Two bugs of this shape shipped: `dailyLogs`
declared ASC where the streak reads DESC, `prospects` declared DESC where the
recap counts ASC. The emulator hides this completely — it invents whatever index
a query asks for. Production is the only place it shows.

**The emulator is more permissive than production, generally.** Missing indexes,
reserved ids, `!=` semantics. Never conclude "it works" from a green e2e run alone.

**Reserved Firestore document ids.** Ids matching `__…__` are reserved: production
rejects them with `INVALID_ARGUMENT`, and the emulator *hangs forever* rather than
answering. Cost an hour. See `DIAG_ID` in `src/app/status/page.tsx`.

**e2e runs whatever is in `.next`.** `playwright.config.ts` runs `next start`,
which never builds. A stale bundle once produced **43 phantom failures** across
unrelated specs. `e2e/global-setup.ts` now refuses to start on a mismatch — do not
remove it.

**One killed run poisons the next.** `reuseExistingServer: true` will attach to a
dying server. If you kill a suite, verify ports 3000/9099/8080 are free before
re-running, or you will debug 50 cascade failures that mean nothing.

**A known e2e intermittency exists.** `realtime.spec.ts` and
`offline-capture.spec.ts` each fail roughly 1-in-3 *on unmodified code* in this
container (measured: baseline 2/3 pass, six runs). Both wait 20s for a Firestore
listener to deliver a row. **Before blaming your change, run the baseline three
times.** It is worth chasing properly; it is not yet chased.

**Tests that pin design values break on every reskin.** Three did. They now assert
*relationships* (light is lighter than dark; body background equals the `--bg`
token) rather than hexes. Keep it that way.

**`value: ""` is invalid in `apphosting.yaml`.** To a Go validator an empty string
is indistinguishable from unset, so the entry reads as an env var with neither
value nor secret and **the whole file is rejected** — nine rollouts failed on this.
Absent means off; there is no "staged blank".

---

## 5. House rules that are not negotiable

Full list in `RULES.md`. These are the ones most likely to be "improved" by
accident:

- **L2/L3 — no medical claims, and no clinical word ever describes a person.**
  "Below / in / above the general range", never "obese" or "overweight". This is
  the Drugs & Magic Remedies Act, not a style preference.
- **L4 — no income promises.** Targets are points. No ₹ on a target, ever.
- **L1/L8 — no company or rank names**, and level names are never pre-filled.
- **P1/P2 — `shareProspects` defaults OFF and is enforced in Security Rules**, not
  app code. There is a mandatory test.
- **G1 — Trust Zones stay calm.** Payment, cancel, consent, privacy: no
  celebration, no haptics, no confetti. Celebrate earning, never charging.
- **G4 — no `backdrop-filter`.** The glass look is alpha fills + hairline borders
  + soft shadows, which is free. Blur re-samples on every scroll frame and is
  exactly the jank a ₹10K Android cannot absorb.
- **E1 — never `new Date()` for a day boundary.** IST is UTC+5:30; go through
  `day.ts`. This has broken roll-ups once already.
- **E2 — never import `./db` into anything a `"use client"` file touches.**
- **E6 — write the decision down.** `DECISIONS.md` has 83 entries and is the
  reason this handoff could be written at all.

---

## 6. Your first day

**Read, in this order:**

1. `RULES.md` — one page, all non-negotiables. Ten minutes.
2. This file, §2 and §4.
3. `STATUS.md` — the audited state of every feature, including bugs found and
   deliberately not fixed.
4. `CLAUDE.md` — product definition, personas, the *why*.
5. `DECISIONS.md` — skim the headings; read D45, D68, D70, D73, D79–D83 in full.
   Each records a deviation and its reasoning.

**Get it running:**

```
npm ci
npm run typecheck && npm run lint && npm run test:unit   # expect 714 passing
npm run emulators                                        # second terminal
npm run e2e:reset && npm run e2e                         # expect 71 passing, 1 skipped
```

**Your first three commits, in order:**

1. **Deploy the Cloud Functions** (D1). Highest-value single action available;
   the team roll-up has never worked in production.
2. **Run `verify:indexes` against prod** (D5) and fix whatever it names. Cheap,
   and it closes the outage class that has already taken the app down once.
3. **Coach-facing prospect delete** (D4). Small, self-contained, makes the privacy
   notice true, and teaches you the module conventions on a low-risk path.

**Then** pick up the delight plan at Move 9, or the first-run experience if the
owner prioritises retention over polish. The first-run problem is, in my judgement,
worth more than the remaining polish.

---

## A note on how this codebase is written

Comments here explain **why**, not what — especially where something looks wrong
and is deliberate. If a piece of code seems odd, check `DECISIONS.md` before
changing it; there is a good chance it is load-bearing and the reason is written
down. Where you find something genuinely wrong, fix it *and* add the entry. That
habit is the only reason a handoff this specific was possible.
