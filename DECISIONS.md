# Architecture Decisions

Deviations from the Section 10 stack recommendation, with reasons (as Section 10 requires).

> **⚠️ The migration target changed in v2. Several decisions below name Supabase as
> the destination — that is now WRONG.** [BUILD_PROMPT_V2.md](./BUILD_PROMPT_V2.md) §3
> replaces it with Firebase. Read the swap points in these entries as pointing at
> Firebase, not Supabase:
>
> | Decision | Says "swap to…" | Actually swap to |
> |---|---|---|
> | D1 (SQLite database) | Supabase Postgres + RLS | **Cloud Firestore + Security Rules** |
> | D2 (custom OTP + JWT) | Supabase Auth | **Firebase Auth, Phone provider** |
> | D3 (data-URL photos) | Supabase Storage | **Firebase Storage** (+ resize Function) |
> | D22 (Web Push/VAPID) | FCM later, for Android only | **FCM now, replacing VAPID entirely** |
> | D33 (no video proofs) | blocked on object storage | **Unblocked** — Firebase Storage |
>
> The *reasoning* in each entry still holds; only the destination moved. D11 is
> unaffected — v2 §3 does not ask for report blobs in Storage, so reports keep
> rendering on demand from the frozen snapshot.

## D1 — Local dev database: Prisma + SQLite instead of Supabase (2026-08-08, Phase 1)

**Why:** No Supabase project/credentials exist yet, and the user asked to start with a dev-mode OTP stub (no external services). Prisma + SQLite gives a zero-setup local database.

**Migration plan:** The Prisma schema mirrors Section 11 table/column names exactly (`users`, `daily_logs`, `targets`, snake_case columns via `@map`). When Supabase credentials arrive: switch the datasource to Postgres, run migrations against Supabase, and add RLS policies (the privacy toggle in Section 5.4 must be enforced in RLS, not just app code). All DB access goes through `src/lib/db.ts` and API routes — no client-side DB calls — so the swap is contained to the server layer.

## D2 — Auth: custom phone+OTP with JWT session cookie instead of Supabase Auth (2026-08-08, Phase 1)

**Why:** Same as D1 — no Supabase project yet. The UX (phone → OTP → profile) is identical to Supabase's phone OTP flow, so screens won't change when we swap.

**Implementation:** OTPs are random 6-digit codes, SHA-256 hashed in the `otp_codes` table, 10-minute expiry, max 5 verify attempts, basic per-phone rate limit. In dev mode the code is echoed back to the UI and console instead of sent via SMS (`src/lib/otp.ts` — the `sendOtp` function is the single swap point for a real SMS provider: Twilio/MSG91 via Supabase Auth later). Sessions are 30-day HS256 JWTs (`jose`) in an httpOnly `gl_session` cookie.

**Route protection:** `src/proxy.ts` (Next 16's replacement for middleware) does a cheap cookie-presence redirect; real JWT verification happens in the authenticated layout and in every API route. Auth-near-routes is the Next 16 recommended pattern.

## D3 — Profile photos: client-side resized data URLs in the DB instead of Supabase Storage (2026-08-08, Phase 1)

**Why:** No storage bucket yet. Photos are downscaled client-side to 256px JPEG (~20 KB) before upload, so DB bloat is bounded. Swap point: upload the same resized blob to Supabase Storage and store the URL — the `photo_url` column already holds a string either way.

## D5 — Capture requires only name + phone (2026-08-09, Phase 2)

**Why:** F2 lists six fields, and all six are on the screen. But the 30-second rule
means a coach stopping someone on a morning walk often won't know their age or
weight yet. Blocking the save would cost them the person. So name and phone are
required; age, gender, height and weight are optional and range-validated when
given. The Phase 3 report engine asks for whatever is missing before it can
generate a report.

## D6 — `clientId` column added to `prospects` (2026-08-09, Phase 2)

**Why:** The offline queue retries. Without an idempotency key, one weak-signal
capture could become three people after a flaky sync. Each queued capture carries
a client-generated UUID, unique per coach, so replays return the original row
(`duplicate: true`) instead of inserting again. Null for QR self-fills, which are
created online in a single request. This extends the Section 11 model, which
invites extension.

## D7 — Public capture form lives at `/c/<referralCode>` (2026-08-09, Phase 2)

**Why:** The QR encodes this URL, so it should be short enough to also read aloud
or type. It is deliberately **not** at the root: F9 reserves `growline.in/<username>`
for portfolios, and a root-level capture path would eventually collide with a
username. `/c/` is added to the public allowlist in `src/proxy.ts`. The page is
`noindex, nofollow` — prospect details must never be crawlable.

## D8 — Minimal hand-written service worker (2026-08-09, Phase 2)

**Why:** "Prospect capture must work offline" is not satisfied by the IndexedDB
queue alone — a cold open with no network needs cached HTML and JS. `public/sw.js`
is ~60 lines with no build step or Workbox dependency: cache-first for hashed
`/_next/static/` assets, network-first with cache fallback for pages, and `/api/`
never cached (stale auth or stale prospect lists would be worse than an error).

**Honest limit:** a route works offline only after being opened once with network.
There is no precache, because precaching authenticated routes at install time
risks caching a `/login` redirect under a real path.

Registered in production only (`ServiceWorkerRegistrar`) — in development a cache
layer fights HMR and hides code changes. Verified against `next start`, not `next dev`.

## D9 — Queue sync is driven from the app layout, not the Prospects screen (2026-08-09, Phase 2)

**Why:** First implementation drained the queue inside the Prospects list
component. A coach who captures ten people on a walk and never opens that list
would have kept ten unsynced captures on their phone. `OfflineSync` now lives in
the authenticated layout and drains on mount, on `online`, and when the tab
becomes visible again, from any screen.

Capture also skips the network entirely when `navigator.onLine` is false and caps
any attempt at 8 seconds — a hanging request on a weak signal otherwise leaves the
coach staring at a stuck "Saving…" button well past 30 seconds.

## D10 — QR submissions are not yet pushed in real time (2026-08-09, Phase 2)

F2 says a QR self-fill "appears instantly in the coach's pipeline with a
notification." The row is written immediately and shows on the next load of the
Prospects screen, but there is **no push notification yet** — FCM is Phase 4.
Polling was rejected deliberately: background polling burns data on the cheap
plans this audience uses (Section 4.4).

## D11 — Reports render on demand from a frozen snapshot, not stored blobs (2026-08-09, Phase 3)

**Why:** Section 10 calls for rendering PNG/PDF into Supabase Storage. There is no
Supabase project yet (D1), and storing blobs would also mean managing their
lifecycle and deletion. Instead the `reports` row stores a **frozen metrics
snapshot** plus an unguessable token, and the PNG, the neutral preview image and
the PDF are all rendered on demand from that snapshot. `image_url` / `pdf_url` from
the Section 11 model are therefore not needed — the token *is* the address.

A report row is **immutable**. If a coach later fills in a missing age, a NEW report
with a new token is minted rather than the old one being rewritten: a prospect who
already opened a link must never find the numbers changed underneath them.

`REPORT_SNAPSHOT_VERSION` guards the stored shape. A snapshot from an older version
is treated as unreadable rather than rendered, because coercing an old shape would
either crash a render or — worse — display a figure computed on a basis since
corrected. Bumping it retires old links; the coach's screen mints a fresh one
automatically.

## D12 — BMI bands use the WHO Asia-Pacific cut-offs (2026-08-09, Phase 3)

18.5 / 23 / 25, not the WHO international 18.5 / 25 / 30. South Asian bodies carry
more fat at a given BMI, so the international set would tell a large share of
at-risk Indian adults they are in the clear.

**Consequence to be aware of:** these lower cut-offs place many ordinary Indian
adults above the range, which is precisely why the labels are non-clinical (D13).
The card **names the standard it used**, so the numbers shown and the standard cited
must always change together. A separate Indian consensus (Misra et al. 2009, JAPI —
the set MoHFW/NPCDCS use) puts the lower bound of normal at 18.0 rather than 18.5;
switching to it means editing the citation too.

## D13 — No clinical category word ever describes the person (2026-08-09, Phase 3)

Bands read "Below / In / Just above / Above the general range" — never "Obese",
"Overweight", "Underweight" or "Normal".

**Why this is legal, not cosmetic:** "obesity" is a listed condition in the Schedule
to the Drugs and Magic Remedies (Objectionable Advertisements) Act 1954, whose s.3
bars advertisements suggesting diagnosis or cure of a scheduled condition — and F3
explicitly calls this report a marketing asset for the coach. Separately, CDSCO's
medical-device-software guidance keeps "general wellness" software outside MDR-2017
only while it has no medical purpose; naming a disease state and attaching a next
step is the shortest path to being argued into SaMD licensing.

Consequences enforced in code: labels describe where the **number** sits, not what
the person **is**; one neutral accent colour for every band with no red/green,
arrows or severity icons; below-range treated exactly as calmly as above-range; and
the encouraging line is chosen from a fixed pool by a hash of the report id,
**independently of the band** — copy that varies with a health estimate is
advice-by-algorithm. All report copy lives in `src/lib/report-copy.ts` and none of
it is coach-editable at runtime.

A second disclaimer line travels with the Section 5.2 line, because the Consumer
Affairs / ASCI guidance for health-and-wellness influencers requires saying this is
not a substitute for professional advice and encouraging a consult, which the
Section 5.2 wording does neither of.

## D14 — Maintenance calories are NOT produced (2026-08-09, Phase 3)

Section 5.2 *permits* calorie guidance; it does not require it, and F3's report list
does not include it. Producing one would mean applying an invented activity
multiplier, because capture collects no activity level — and adding an activity
field would put the capture screen at seven inputs, over the Section 5.6 limit.

A fabricated low calorie figure, sent by someone who sells meal replacements, is a
real mechanism of harm rather than a missing feature. BMR is shown instead, hedged
as an estimate. If this is ever added, it needs its own step to ask activity level,
must be framed as a range against a stated assumption, and must never display a
number below BMR.

## D15 — Refuse rather than degrade; no snapshots for under-18s (2026-08-09, Phase 3)

A report needs age **and** height **and** weight, or it is not made. A card with
blanks invites the coach to supply the number verbally, off the record, which is the
one channel no control reaches.

Under-18s are refused outright. The DPDP Rules 2025 (Rule 10) require verifiable
parental consent before processing a child's data, which a roadside conversation
cannot deliver; Deurenberg also has a separate children's equation and adult BMI
bands do not apply below 19. Capture itself still accepts partial details — the
30-second rule from Phase 2 is unchanged; only report generation is gated.

Note the age gate is 18 (the legal threshold) while WHO's BMI-for-age reference runs
to 19; at 18 the adult curves have effectively converged, so the practical error is
negligible.

## D16 — Water guidance is EFSA/ICMR adult intake, not weight × 35 ml (2026-08-09, Phase 3)

The per-kg rule is **not** an evidence-based population recommendation. It is a
clinical IV-maintenance heuristic for hospitalised patients, descended from a 1945
suggestion of 1 ml per kcal; Valtin (2002) found no evidence for it in healthy
adults. Multiplying a prospect's weight by it and presenting the product as their
personal target would be inventing a requirement.

The card now shows EFSA's Adequate Intake for total water — 2.0 L for women, 2.5 L
for men, and a 2–2.5 L span when sex is unknown — which agrees with ICMR-NIN's 2024
"about 8 glasses" for Indian adults, and states that it counts all fluids including
water in food. This is why water no longer varies with weight.

Body fat is shown as a **range**, never a single decimal: the Deurenberg standard
error is ~4 percentage points, and one decimal would claim precision the formula
does not have. Body fat and BMR are both omitted for gender "other" rather than
guessed — every published equation is keyed to binary sex, and averaging the two has
never been validated.

## D17 — The snapshot link is treated as a bearer credential (2026-08-09, Phase 3)

The link travels over WhatsApp to someone with no account, so the token is the whole
access control: ~130 bits, rejection-sampled so every character is uniform, with no
lookalike glyphs, and validated before any database lookup.

Around it: a 90-day expiry (checked on every public surface); `noindex, nofollow`,
`Referrer-Policy: no-referrer` and `Cache-Control: private, no-store` via
`next.config.ts`; **first name only** and never the prospect's phone on any rendered
surface; nothing but the opaque token in the URL; and a link-preview image that is
**neutral branding with no metrics**, because a forwarded link renders its preview
inside whatever group chat it lands in.

There is also a public "Not you, or want this removed?" control that deletes the
prospect. Holding the link is the authorisation — the same bearer secret that grants
read access — and deletion is the safe direction to fail.

**Known limitation:** the snapshot HTML keeps Next's own
`Cache-Control: no-cache, must-revalidate`, which overrides both the proxy and
`next.config` headers on dynamic page responses. Revalidation is enforced but the
response is not marked `private`. The card, preview and PDF routes do carry
`private, no-store`, because a Route Handler controls its own headers.

## D18 — Card typography is size-and-colour, not weight (2026-08-09, Phase 3)

The card is rendered with `next/og` (satori + resvg, already bundled with Next — no
new dependency, no native build). satori only ships one font, Geist **Regular**, and
`fontWeight: 700` against a single 400-weight face is a silent no-op producing a
byte-identical PNG. So the card builds hierarchy from size and colour instead, which
still satisfies Section 9's "numbers large and bold" in spirit but not in weight.

**To get real bold:** add Inter Regular + Bold `.ttf` files to the repo and pass them
via the `fonts` option. satori cannot parse `woff2`, so the files Next caches for
`next/font` are unusable, and `next/font` emits CSS rather than font bytes. This
needs font files added to the project — flagged rather than done, since it means
committing binaries.

**Non-Latin names are a live limitation.** Devanagari and Kannada names do render,
but satori has no glyphs for them in the bundled font and fetches a fallback from
Google Fonts **at render time**. That means a runtime network dependency on the
image path, added latency, and the name being sent to a third party. Verified
working online; it will degrade if egress is blocked. The fix is the same: ship Noto
Sans Devanagari / Kannada / Tamil `.ttf` files. The image routes now fail soft
(logged 500, no stack trace) so the web snapshot still works if a render fails.

The prospect's name is also kept out of the PDF's `Content-Disposition` filename —
HTTP headers are byte strings, so a Devanagari name threw outright, and the filename
would have followed the file into the prospect's downloads.

## D19 — Portfolio link on the report is deferred to Phase 8 (2026-08-09, Phase 3)

F3 and F4 say the report carries the coach's portfolio link. The portfolio (F9) does
not exist until Phase 8, and shipping a dead link on a prospect-facing marketing
asset is worse than shipping none. The report carries the coach's name, photo, city,
phone and a "Message me on WhatsApp" button; the portfolio URL slots in when Phase 8
lands.

## D20 — Report identity is a hash of its inputs (2026-08-09, Phase 3)

`reports` carries `inputs_hash` with `UNIQUE (prospect_id, inputs_hash)`, and
`ensureCurrentReport` upserts on it.

**Why:** report creation runs during a GET page render, so two tabs — or a save
racing the `router.refresh()` that follows it — could each insert a row. That meant
two live 90-day bearer tokens to the same person's health data, only one of which
the coach ever saw or could mark as sent. With the constraint, concurrent writers
converge on one row; verified with six simultaneous requests returning a single
token. An expired row is refreshed in place, keeping one identity per set of inputs.

## D21 — Public URLs come from NEXT_PUBLIC_SITE_URL (2026-08-09, Phase 3)

QR capture URLs, snapshot links and the Open Graph image base all resolve through
`src/lib/site-url.ts`, which prefers `NEXT_PUBLIC_SITE_URL` and falls back to the
request's Host header so local development needs no configuration.

**Why:** the Host header is attacker-controlled, and Next needs an absolute
`metadataBase` for relative `og:image` URLs — without one they resolve to localhost
off Vercel, so a forwarded snapshot link renders in WhatsApp with no preview card at
all and nothing in development reveals it. **Set this in production.**

## D22 — Web Push over VAPID instead of FCM (2026-08-09, Phase 4)

Section 10 specifies FCM. Reminders use the **Web Push API with VAPID keys**
(`web-push` + the existing service worker) instead.

**Why:** FCM's web delivery *is* Web Push underneath — Firebase mainly adds a
console, a vendor account and an SDK. VAPID keys are generated locally
(`npx web-push generate-vapid-keys`), so follow-up reminders work today with no
external account, consistent with D1/D2. FCM stays available later for the
Capacitor Android build, where native delivery does need it; the subscription table
and the send wrapper (`src/lib/push.ts`) are the only pieces that would change.

Notifications are treated as an enhancement throughout: with no keys configured
everything no-ops and the in-app follow-up queue still does the job. A dead
subscription (404/410 from the push service) is deleted rather than retried forever.

## D23 — The daily reminder runs hourly and decides per coach (2026-08-09, Phase 4)

`POST /api/notifications/daily` is meant to be called **every hour** by a scheduler,
not once a day. Each coach is notified only when it is morning in *their* timezone
(captured at subscribe time) and only once per local day, tracked by
`users.followup_push_on`.

**Why:** one daily cron fires at a single UTC moment, which is the middle of the
night for some users. An hourly job with a per-coach morning check serves every
timezone from one schedule and can be retried safely. Verified: a Kolkata coach at
17:00 local is skipped as `not-morning-there` while a New York coach at 08:00 is
selected, and a second run in the same local day skips as `already-sent-today`.

The endpoint **fails closed** — without `CRON_SECRET` it returns 503, and it
compares the supplied secret in constant time. Otherwise anyone on the internet
could trigger a push to every coach. `?dryRun=1` reports exactly what would be sent
without sending, which is how the logic is verified without a live push service.

**Not verified end to end:** actual delivery and the browser permission grant.
Notification permission cannot be granted in this automated environment, and the
service worker registers in production builds only — so `Settings → Morning
reminder` needs a real device or production build to switch on. The graceful-failure
path was verified against unreachable endpoints; the 404/410 cleanup branch was not
exercised against a live push service.

## D24 — All day boundaries go through a timezone helper (2026-08-09, Phase 4)

`src/lib/day.ts` resolves "which day is it" in a named zone (`Asia/Kolkata` by
default), and every follow-up query and label uses it.

**Why:** a server in UTC is 5.5 hours behind India. A naive `new Date()` comparison
puts every follow-up between 00:00 and 05:30 IST on the wrong day, so "6 follow-ups
today" would be wrong for five and a half hours every night. Verified against known
IST facts: 18:29Z is still 9 August in India while 18:30Z is already the 10th, the
IST day starts at 18:30Z the previous day, a follow-up at 23:00 IST counts as today,
and month/year/leap rollovers are correct.

Buckets and labels are computed **server-side** and passed to the list, so every row
agrees on what "today" is instead of each browser deciding from its own clock.

## D25 — Pipeline edits are a separate endpoint from details (2026-08-09, Phase 4)

`PATCH /api/prospects/[id]/pipeline` handles stage, follow-up and notes;
`PATCH /api/prospects/[id]` still handles the six capture fields as a set.

**Why:** the details route validates name and phone together, so a one-tap stage
move would have had to resend them to succeed. Splitting keeps the 30-second rule
intact and means a stage change cannot fail on unrelated validation. Notes live here
rather than on the capture screen, which is already at the Section 5.6 six-field
ceiling.

`src/lib/followup.ts` is **pure** (no database import) because client components use
its date and copy helpers; the queries live in `followup-queries.ts`. Importing
`./db` into anything a `"use client"` file touches pulls the SQLite driver into the
browser bundle and breaks the build with `Can't resolve 'fs'`.

## D26 — `log_date` stores local midnight as a UTC instant (2026-08-09, Phase 5)

A daily log's `log_date` is the UTC instant of midnight in the coach's timezone, via
`logDateFor()`.

**Why:** that is what makes `unique(user_id, log_date)` mean "one log per coach per
day **in their own day**". Storing a raw timestamp would split an Indian evening
across two UTC days and let one evening produce two rows.

The same fix was applied to `src/lib/team.ts`, which computed the month boundary and
"today" from **server-local** time. On a UTC host that counted the wrong month for
the first 5.5 hours of every 1st and read the wrong "today" every night — it would
have quietly corrupted the roll-ups this phase is built on. Not a refactor: the
Phase 5 roll-ups depend on it being right.

## D27 — Streaks measure from yesterday when today is unlogged (2026-08-09, Phase 5)

`streakFromKeys` anchors on today if today is logged, otherwise on yesterday.

**Why:** a coach who logged ten days straight and opens the app at 4pm should see
"10", not a zero implying they already lost it. The streak only breaks once a whole
day passes unlogged. Verified against ten cases including gaps, duplicate keys,
month boundaries and a future-dated row.

Backfill is capped at 14 days (`MAX_BACKFILL_DAYS`) — enough for any offline log to
sync, but not enough to manufacture a streak after the fact. Milestones fire only on
the **first** save of **today**: a backfilled day is not an achievement to announce,
and correcting a number must not replay a celebration the coach already saw.

Milestone copy celebrates the habit and never earnings (Section 5.3), and the
celebration is a colour change plus one line — Section 4.8 wants recognition, Section
4.4 rules out anything heavy on a cheap phone.

## D28 — The offline queue now carries logs as well as prospects (2026-08-09, Phase 5)

Section 4.3 requires that "prospect capture **and daily logs**" work offline. The
IndexedDB database moves to version 2 with a second store, `pending_logs`, keyed by
day — so re-saving an evening overwrites rather than queueing twice, and last write
for a day wins, which is what correcting a number should do.

The store creation is guarded individually so upgrading a v1 database adds only what
is missing and loses nothing already queued (verified: both stores present after
upgrade, prospects store intact).

Logs sync even when the prospect loop stops early — a stuck prospect must not hold a
coach's streak hostage. A day the server refuses as too old to backfill is **dropped**
rather than retried forever.

## D29 — Level names are free text with no default and no suggestions (2026-08-09, Phase 6)

`users.level_name` is NULL by default, and `LevelNameField` has no placeholder, no
example, no datalist and no picker.

**Why:** F7 says level names are user-editable labels "never pre-filled with any
company's rank names", and Section 5.1 forbids any direct-selling or nutrition
company's trademarks appearing anywhere in this app. A suggestion list would be
exactly that — us shipping the rank names. The only way a rank name can appear is a
coach typing their own words, which is their choice about their own screen. **Do not
add suggested levels here**, however helpful it looks.

The label is shown to the coach's upline on the targets screen, because it is the
coach's own description of what they are working toward.

## D30 — A target is a count of points and nothing else (2026-08-09, Phase 6)

No currency, no conversion, no projection, no "at this rate you would…". Section 11
calls the field `target_points` and F7 says "points/volume"; the UI says **points**
only — "volume" is loaded language in this industry and invites a money reading.

Section 5.3 forbids income promises, so the celebration copy recognises effort
("Target reached. Your line can see this.") and never earnings. Verified by grep:
no rank names, no ₹, no income/commission/payout wording anywhere in the target code.

## D31 — Achievement is derived from the numbers, not the stored status (2026-08-09, Phase 6)

`targets.status` is maintained for querying, but every display asks
`isAchieved(progress, target)` instead.

**Why:** the stored status is only refreshed when a target or its progress is
written. A row last touched before it was met — an old month, a seeded row, a
migration — showed "105%" beside no "Reached" badge and a bar that never turned
green, which reads as a bug to the coach. Caught on real data: a Phase 1 seeded
target sitting at 420/400 with `status = "active"`.

Overshoot is shown honestly ("105% — past the target") while the bar clamps at 100%.

## D32 — All target and proof authorization lives in targets-queries.ts (2026-08-09, Phase 6)

Every mutation re-derives permission from the database; routes are thin. The matrix,
verified end to end:

| Actor | set target | move progress | ask proof | attach evidence | approve/reject |
|---|---|---|---|---|---|
| the coach | ✗ | ✓ | ✗ | ✓ | ✗ |
| their DIRECT upline | ✓ | ✗ | ✓ | ✗ | ✓ |
| an upline two levels up | ✗ | ✗ | ✗ | ✗ | ✗ |
| anyone else | ✗ | ✗ | ✗ | ✗ | ✗ |

Target-setting is **direct line only**, per F7 — reaching past it would let a
grandparent overwrite the target a coach's own upline set. A coach cannot set their
own target, which is the entire point of the feature. "Not allowed" and "not found"
return the same 404 so no route can be used to probe the tree.

A rejection requires a comment: sending work back with no reason is a dead end for
the downline, who cannot tell what to fix. An approved proof cannot be re-answered.

## D33 — Proof photos are re-encoded, which strips EXIF (2026-08-09, Phase 6)

`fileToProofDataUrl` draws the photo through a canvas and re-encodes it as JPEG,
stepping quality down until it fits rather than rejecting a large photo outright.

The size bound matters for Section 4.4, but the **re-encode matters more for
privacy**: a camera photo carries GPS coordinates and a timestamp, and this image is
about to be sent to the coach's upline. Re-encoding means a proof cannot quietly
disclose where a coach lives. The screen tells them so.

**Video is not supported.** F7 says "photo/video", but there is nowhere to put a
video — no object storage yet (D1/D3), and a video cannot live in a bounded data URL.
Photos plus a note cover the trust case; video needs Supabase Storage or S3 first.

The `proofs` table adds a `submitted` status beyond Section 11's
pending/approved/rejected, because without it there is no way to distinguish "not
answered yet" from "answered, waiting on the upline" — which is the state the
downline is actually waiting on.

## D4 — Next.js 16 notes (scaffolded 2026-08-08)

create-next-app installed Next 16.3.0: `middleware.ts` is now `proxy.ts` (named `proxy` export, Node runtime), and `cookies()` / `headers()` / `params` / `searchParams` are strictly async everywhere. Docs live in `node_modules/next/dist/docs/` per AGENTS.md.

## D34 — Firebase Auth uids are the pre-existing cuids (2026-08-09, v2.1a)

The migration calls `auth.importUsers()` with `uid` set to each user's existing
`cuid`, keyed by phone, instead of letting Firebase mint new uids at first sign-in.

**Why:** every foreign key in the database — `coachId`, `userId`, `setById`,
`requestedById` — points at the cuid, and migrated users do not sign in until
*after* cutover, so a Firebase-minted uid does not exist at migration time. The
alternatives were rewriting every foreign key later, or an `authUid → userId`
mapping collection that costs a `get()` inside **every rule evaluation on every
collection, forever**. Setting the uid ourselves costs one script and keeps
Security Rules as plain `request.auth.uid == …` comparisons with no lookups.

Users still re-verify by SMS exactly as BUILD_PROMPT_V2 §3 requires — they simply
land back on the same id. Verified: `auth.getUser(cuid)` returns the user with the
original E.164 phone intact.

## D35 — Every `@@unique` became a deterministic document id (2026-08-09, v2.1a)

Firestore has no unique constraints, and all four in the Prisma schema were
load-bearing. Each is now expressed as the document id, because a `set()` on a
deterministic id is an upsert and two racing writers converge on one document:

| Was | Now |
|---|---|
| `unique(coachId, clientId)` (D6) | `prospects/{coachId}__{clientId}` |
| `unique(prospectId, inputsHash)` (D20) | `reports/{prospectId}__{inputsHash}` |
| `unique(userId, logDate)` (D26) | `dailyLogs/{userId}__{dayKey}` |
| `unique(coachId, month)` | `targets/{coachId}__{month}` |

**Do not replace these with auto-ids plus a query.** A query is not atomic, and the
constraint silently stops existing — which for D20 means two live 90-day bearer
tokens to one person's health data.

`clientId` arrives from the browser, so `assertValidDocId` rejects ids containing
`/`, the ids `.`/`..`, anything matching Firestore's reserved `__.*__` pattern, and
anything over 1500 bytes. QR self-fills have no `clientId` and keep an auto-id.

A count mismatch after migration is therefore usually two source rows colliding on
one id — the constraint working, not a bug to paper over.

## D36 — `uplinePath` is denormalised onto logs and targets (2026-08-09, v2.1a)

`dailyLogs` and `targets` each carry a copy of their owner's `uplinePath`.

**Why:** `buildTeamTree()` used **four `groupBy` aggregations**, which Firestore
cannot express. BUILD_PROMPT_V2 §11 schedules the Cloud Function counters that
replace them for v2.1b — but the team tree is v1 Phase 1, so v2.1a's parity gate
has to prove it works. As written, v2.1a was asked to pass a gate using machinery
it was not allowed to build yet.

With the path denormalised, an upline's whole-line roll-up is one
`array-contains` + `count()` and needs no Cloud Functions. Verified against the
emulator: 6 August logs across a two-level line, with the 31 July logs correctly
excluded. This also retires `isInDownline()`, which walked the tree with one query
per hop for up to 100 hops.

**Known limitation:** a log's `uplinePath` is frozen at write time, so moving a
coach in the tree leaves historical logs on the old path. There is no UI for tree
moves today and it is rare at pilot scale. If one is ever built, it must re-stamp
that coach's descendants' logs and targets.

## D37 — `importUsers()` is not an upsert, so the migration skips existing uids (2026-08-09, v2.1a)

Discovered by re-running the migration against the emulator: `importUsers()` fails
with *"localId belongs to an existing account — can not overwrite"* rather than
updating. A migration interrupted after the Auth step could therefore never be
re-run — it would fail at the same place every time and nothing downstream would
execute.

The script now looks up existing uids first (`getUsers`, max 100 identifiers per
call) and imports only the missing ones. Combined with `batch.set()` on
deterministic ids, which is already an upsert, the whole migration is safe to
re-run. Verified: a second run reports `0 created, 4 already present` and every
collection count is unchanged.

This is why §3 says run it against a copy first. A one-shot migration that cannot
resume after a partial failure is a trap.

## D38 — Security Rules deny everything during v2.1a (2026-08-09, v2.1a)

`firestore.rules` is `allow read, write: if false`.

**Why:** nothing in the app talks to Firestore from the browser yet. Every read and
write goes through API routes and server components using the Admin SDK, which
bypasses rules entirely — the same server-only shape D1 established. A permissive
placeholder is the kind of thing that survives to production; a deny-all cannot.

The real rules land in v2.1b with the privacy toggle, its mandatory test, and the
client listeners that are the first thing to actually need client reads.

## D39 — "Dark by default" and "respect the system" collide, and the system wins (2026-08-10, v2.2a)

BUILD_PROMPT_V2 §4 asks for both: *"Dark theme is the DEFAULT"* and *"respects
system preference on first run."* On the web those are not fully compatible.

**Why:** `prefers-color-scheme: no-preference` was removed from the CSS spec.
Chromium reports **light** for a device that has expressed no preference at all,
so a browser cannot distinguish "the user chose light" from "the user chose
nothing". Verified in Playwright: a context created with
`colorScheme: "no-preference"` still matches `(prefers-color-scheme: light)`.

**Resolved as:** the system preference decides on first run, so a device
reporting light gets light. Dark remains the default in the two senses that are
actually implementable — it is what the server renders before any script runs,
and it is what a device preferring dark (or any device once the Settings switch
is used) gets.

**Why this way round:** the alternative is ignoring the media query and forcing
dark until someone finds the Settings switch, which overrides a preference the
user has genuinely expressed at OS level. On a ₹10K Android the OS theme is a
real, deliberate setting, not a default nobody touched.

The pre-hydration HTML ships `data-theme="dark"` regardless, because a white
flash on every load for a dark-mode user is the most visible way a theme system
can feel broken — that has its own test.

## D40 — Today's Mission shows points, not a rupee equivalent (2026-08-10, v2.2a)

BUILD_PROMPT_V2 §4's example copy for the Today's Mission card reads:

> "🔥 Log today to keep your 12-day streak · 📞 6 follow-ups waiting ·
> 🎯 **₹-equivalent:** 400 VP to cross 75%"

**Not built as written.** The target item says points and stops.

**Why:** v1 §5.3 forbids income promises anywhere in UI copy, and D30 already
settled that a target is a count of points with no currency, conversion or
projection — "volume" was rejected as loaded language for the same reason. A
rupee figure attached to a progress number on the home screen is the clearest
possible income projection: it tells a coach what their activity is worth, every
time they open the app.

RULES L4 is a legal line. An illustrative string inside a design section does not
outrank it, and the rest of §4 is followed exactly — three items, generated from
the coach's own data, one tap to the action.

The `e2e/design.spec.ts` money-copy check now covers the home screen as well as
targets, so this cannot be reintroduced quietly.

## D41 — `unique(referralCode)` becomes a reservation document (2026-08-10, v2.2b)

D35 re-expressed four Prisma unique constraints as Firestore document ids. The
schema had **six**. `referralCode` and `reports.token` were left with their
read-then-write helpers intact and the constraint underneath them gone.

`referralCode` is the one that matters, and it cannot be a document id: the user
document is already keyed by the Auth uid (D34), and a document has one id. So the
code gets its own **reservation document**, `referralCodes/{CODE}`, holding only the
owning uid — created inside the same transaction that writes the user, which
Firestore aborts if anybody claimed it in between. `createUser` retries with a new
candidate up to 20 times and then throws rather than issue a duplicate.

**Why it is worth a collection:** a shared code silently reroutes one coach's QR
captures and downline placements to a stranger. Nothing errors and nobody notices
until a coach asks where their people went. `getUserByReferralCode` now resolves
through the reservation, so two coaches holding one code is unreachable rather
than merely unlikely — and it costs two document reads instead of a query.

Client reads and writes are both denied in `firestore.rules`. A write would let
anyone squat a code; a read would turn the collection into a directory mapping
every code to a coach's uid. `/join/<code>` resolves server-side.

**`reports.token` is deliberately left undefended.** 26 characters over a 33-char
alphabet from a CSPRNG is ~131 bits. A reservation there would cost a write on
every report to defend against a collision rarer than silent disk corruption.

The migration backfills a reservation per existing user and **throws** on a
collision rather than merging two coaches onto one code.

## D42 — the eight composite indexes, and why the emulator cannot find them (2026-08-10, v2.2b)

`firestore.indexes.json` declared 4 composite indexes. The shipped code needs 8.
The missing four fail with `FAILED_PRECONDITION` against a real project.

**The Firestore emulator creates composite indexes on demand.** No suite run
locally can catch this — not e2e, not the rules tests, not `migrate:verify`. Every
one of them passes against an emulator that silently invents whatever index the
query asked for. This is the one class of defect on this branch where a green
local run carries no information at all, which is why it is written down here
rather than left to the file.

| Index (all `COLLECTION` scope) | Serves | If missing |
| --- | --- | --- |
| `dailyLogs` (userId ASC, dayKey ASC) | `daily-log-queries.ts:38` (the `/log` read **and** every `saveLog`, via the re-read at :129), `team.ts:98`, `weekly-recap.ts:39`, `functions/src/index.ts:50` | F6 breaks on read *and* write — and `saveLog` writes before it re-reads, so the coach sees an error for a log that actually saved |
| `users` (uplineId ASC, createdAt ASC) | `users.ts:220` `getDirectDownlines`, `team.ts:80` once per tree level | My Team and Targets both dead — `getDirectLineTargets` calls `getDirectDownlines` first |
| `prospects` (coachId ASC, source ASC, createdAt ASC) | `api/public/capture/[code]/route.ts:28`, the per-coach hourly rate limit | Every QR self-fill 500s — and the person seeing it is a prospect, not a user (F2 Mode B) |
| `prospects` (createdAt ASC, heightCm ASC) | `functions/src/index.ts:123` `purgeStaleHealthData` | Throws once a night, silently. The 180-day health-data purge never runs — a compliance control, not a nicety |

Two direction calls worth recording, because both look wrong:

1. **`(createdAt, heightCm)`, not `(heightCm, createdAt)`.** The purge combines two
   inequalities on different fields and has no explicit `orderBy`. Firestore sorts
   implicit inequality orderings **lexicographically by field path** —
   `@google-cloud/firestore/build/src/reference/query.js:592` ends
   `getInequalityFilterFields()` with a sort — so the ordering is `createdAt ASC,
   heightCm ASC, __name__ ASC`. Field order in the index is not free choice.
2. **`dailyLogs` ASC even though `daily-log-queries.ts:40` orders `dayKey desc`.**
   `userId` is pinned by an equality filter, so a reverse scan of the ASC index over
   the contiguous `userId == U` segment *is* `dayKey DESC`. The file already bets on
   this same reversal rule elsewhere: the declared `prospects(coachId ASC, createdAt
   DESCENDING)` is the only index that can serve `weekly-recap.ts:46`, whose implicit
   ordering is `createdAt ASC`.

**Not added, on purpose.** `targets(uplinePath CONTAINS, month ASC)` was reported
missing but is already declared. `prospects(coachId ASC, createdAt ASC)` is
redundant with the DESC index by the same reversal rule.

**Two things that look like index problems and must not be fixed with indexes:**
`api/notifications/daily/route.ts:45` reads the entire `pushSubscriptions`
collection every hour with an unfiltered `orderBy` — a cost defect, not a missing
index. And `targets-queries.ts:91` sorts proofs in memory on purpose so the `in`
lookup at :74 needs no composite index; that comment is correct as written.

**Still unverified against a real project.** These are derived from the SDK's own
query planner and the documented rules, not from a `FAILED_PRECONDITION` that
stopped appearing. First deploy must run each of the four paths once and check the
Firebase console for index-build errors.

## D43 — the offline queue's pending list needs a sequence guard (2026-08-10, v2.2b)

`ProspectList` reads the IndexedDB queue on mount, on `QUEUE_CHANGED`, and on
`online`. When the signal returns all three fire within milliseconds, and IndexedDB
reads can resolve **out of order** — the last one to land wins.

That is a duplicate on screen, not a flicker. A read that started before
`OfflineSync` dequeued a synced capture can resolve after the one that started
after it, pinning the prospect to the pending list as "On this phone" while
`router.refresh()` has already brought in their real row. The coach sees the same
person twice, one apparently unsaved, and it never settles.

`refreshPending` now stamps each read with an incrementing sequence and applies
only the newest. The `cancelled` flag it already had guards unmount, which is a
different problem and does not help here.

Found by `offline-capture.spec.ts` failing on a **clean** emulator — the sync
completed fast enough to lose the race. On a polluted emulator it passed. Worth
noting for what it says about the next bug of this shape: the test was correct and
the timing was doing the hiding.

## D44 — `npm run e2e:reset` before every e2e run (2026-08-10, v2.2b)

The e2e suite is not idempotent and cannot be: `signup.spec` creates a coach, and
the offline and QR specs each create a prospect. Run it twice against one emulator
and the second run sees a database that no longer matches the seed.

This is not hypothetical tidiness. A green 18/18 suite went to **6 failed with no
code change**, purely because the emulator had accumulated two signup users and
four extra prospects. It looked exactly like a regression in the commit under test,
and it cost a full debugging cycle chasing a bug that did not exist.

`scripts/reset-emulators.ts` clears Firestore **and Auth** — Auth matters as much,
because signup creates an account and the Phone provider allows one per number
(the invariant behind D34). `npm run e2e:reset` chains it into
`migrate:firestore`, so one command gives a known state.

## D45 — the emulator boot guard describes two switches, not one (2026-08-10, v2.2b)

`src/lib/firebase-admin.ts` derived `usingEmulators` from `FIRESTORE_EMULATOR_HOST`
alone. The Admin SDK resolves emulator routing **per product**, from two independent
variables, so one flag could never describe the state correctly.

**Why it mattered, and it is worse than it sounds.** With only
`FIREBASE_AUTH_EMULATOR_HOST` set in production, `token-verifier.js` swaps in the
emulator verifier — `verifyJwtSignature(token, undefined, { algorithms: ['none'] })`,
which also stops requiring `kid` and RS256. `verifyIdToken` and `verifySessionCookie`
then merely *decode*. An unsigned cookie naming any uid would be accepted against
real Firestore data, while `usingEmulators` read false, so the missing-credential
check was satisfied by a real service account and `migrate-to-firestore.ts` still
printed "PRODUCTION". Nothing would have errored. One variable in a deploy config.

**Resolved as** a `resolveTarget()` returning a discriminated union. Two
configurations boot — both hosts and no credential (dev, e2e, CI), or a credential
and neither host — and the other four throw at boot naming the offending variable.
Because the union carries the service account only on the non-emulator branch,
`createApp()` dropped its own `if (!raw)` check: "real project, no credential"
stopped being a state that function can be called in.

**Three deliberate choices.** The resolver sits at module scope, not inside
`createApp()`, which runs only when `getApps()` is empty — a guard that
initialization order can skip is not a guard. `NODE_ENV` takes no part:
`next build && next start` against the emulators is how the production bundle gets
checked locally, so `NODE_ENV=production` is not evidence of a real deployment, and
the service account is the honest signal of intent instead — which is why one
alongside an emulator host is an error rather than a precedence rule to pick. And
presence is plain truthiness, matching the SDK's own `useEmulator()`, so `FOO=""` is
unset to both and `.env.example`'s empty credential line still boots. A guard that
disagrees with the thing it guards is worse than none.

Verified across all six combinations plus the empty-credential shape, each in its own
process, with the repo's real `.env` as the first case.
`FIREBASE_STORAGE_EMULATOR_HOST` is not in the pair check because nothing uses
Storage (D49); it has to join `resolveTarget` in the same change that switches
Storage on, or the same skew reappears for a third product.

## D46 — logout revokes on the Auth backend, for every device (2026-08-10, v2.2b)

`POST /api/auth/logout` deleted the cookie and stopped. A session cookie is a signed
JWT, not a row, so deleting the browser's copy told the Auth backend nothing: the
cookie stayed valid for the rest of its 14 days. Anyone holding a copy taken before
the logout — the realistic case on shared and second-hand Androids — kept full access
to prospect names, phones and health inputs.

`revokeRefreshTokens(uid)` closes it, and it does apply to session cookies and not
only ID tokens: in the installed SDK, `verifySessionCookie` and `verifyIdToken` both
route through `verifyDecodedJWTNotRevokedOrDisabled`, which compares the token's
`auth_time` against the user's `tokensValidAfterTime`. Nothing had ever set that
stamp, so the `checkRevoked` flag `session.ts` always passed was catching disabled
accounts and no logout at all.

**It signs the coach out of every device, and that is intended.** Revocation is
per-user; Firebase offers no per-session handle. Per-device logout would mean minting
our own session ids and storing them — the hand-rolled session table v2.1a deleted —
and checking one costs a read per request. The price of revoking is one SMS on the
other device; the price of not revoking is a logout button that logs nobody out.
v1 §12 does expect a phone and a club laptop signed in at once, so the button says
plainly that it ends both.

**GET does not revoke.** It is the loop-breaker the authenticated layout redirects
to, and a `SameSite=lax` cookie rides along on a cross-site top-level navigation — so
`location = "…/api/auth/logout"` on any page would otherwise sign a visiting coach
out of every device they own.

**A failed revoke keeps the coach logged in.** POST returns 502 and the cookie
deliberately stays set, so the button keeps them on the screen to retry — the cookie
is the only thing that still names the uid. A coach with a dead network therefore
cannot log out at all: honest, and better than a silent success. Offline-first
(v1 §4.3) covers capture and daily logs, not ending a session on a backend we cannot
reach.

**The browser's own Firebase credentials go too** (`signOut` in `LogoutButton`). The
cookie was never the only key: `RealtimeProspects` reads prospects straight from
Firestore with the client SDK's persisted refresh token, which the rules allow for
`coachId == uid`.

**Revocation has one-second granularity.** `validSince` is stamped in whole seconds
and the check is `auth_time < validSince`, strictly less — so a session created and
revoked inside the same wall-clock second survives its own revocation. No real coach
can hit that; a Playwright script hits it easily, which is why the e2e test crosses
the boundary on purpose. Also note `validSince` comes from our clock and `auth_time`
from Google's: a server clock running fast would reject cookies minted just after a
revoke, which looks like a login loop. Check this first if "I logged out and now I
cannot get back in" ever arrives.

## D47 — `/login` is not redirected away on cookie presence (2026-08-10, v2.2b)

`src/proxy.ts` sent anyone holding a `gl_session` cookie from `/login` to `/`. With
D46 revoking sessions for real, that turned a dead-but-present cookie into a
**redirect loop**:

```
/                 -> layout cannot verify -> /api/auth/logout
/api/auth/logout  -> clears the cookie    -> /login
/login            -> cookie still on THIS request -> /
```

and round again. Found by the D46 e2e test, whose replayed cookie landed on the
authenticated home instead of the login screen — the loop settling on the wrong side.

The proxy runs in the edge runtime with no Admin SDK, so it can only see that a
cookie **exists**. "Has a cookie" and "is signed in" are different questions, and a
revoked or expired session answers yes to the first and no to the second. Sending a
signed-in coach from `/login` to home was a convenience; bouncing a signed-out one
between three routes is a lockout. The convenience loses.

The authenticated layout is the only thing that can actually decide, so it is now the
only thing that decides. The `!hasSession && !isPublic` half is untouched — refusing
a request with no cookie at all needs no verification.

**The e2e assertion changed shape too, and this is the more general lesson.** It
asserted a final URL; a rejected cookie travels through the layout's redirect to
`/api/auth/logout` and on to `/login`, and where that chain settles depends on the
host it started from — `NextResponse.redirect(new URL("/login", req.url))` resolved
to `localhost` for a request made to `127.0.0.1`. The property that must hold does
not care about the route: the replayed cookie buys **no access**. Asserting
capability instead of location is what made the test both correct and stable.

## D48 — `users` is closed to clients, and the shared-prospect `get()` finding is withdrawn (2026-08-10, v2.2b)

Two audit findings on `firestore.rules`, reconciled into one ruleset.

**`users` is now `allow read, write: if false`.** The old grant was
`uid() == userId || inLineOf(resource.data.uplinePath)`, with a comment saying the
upline "sees the summary fields — name, photo, counts". Rules have no field-level
reads, so that comment described an intention, not the grant. What an ancestor at any
depth could actually fetch with a hand-written query was the whole document: `phone`,
`referralCode`, `levelName`, `followupPushOn`, `plan`, `trialEndsAt`, and
`shareProspects`.

**Why the last two decide it.** `plan == "readonly"` means a failed UPI mandate
(F10) — a coach's payment trouble is not their whole upline chain's to read. And a
rule that reports the privacy toggle's current value to the party the toggle protects
against is arguing with v1 §5.4 rather than serving it. The phone number alone would
not have justified this; a direct upline usually has it. But `inLineOf` is the entire
ancestor chain (up to 100 hops, D36), not the person who recruited you.

**Why deny rather than narrow:** nothing in the browser reads this collection. The
only client-SDK call in the repo is the `prospects` listener in
`RealtimeProspects.tsx`; the team tree is built server-side through the Admin SDK,
and drilling goes through `/api/team`, which checks the line itself. D38's discipline
applies — this was the one read in the file no feature asked for. Self-read is denied
too, because leaving it open keeps `plan`/`trialEndsAt` reachable from the client, the
same second-weaker-path this file already rejects for `reports`. If a screen ever
needs another coach's name and photo in the browser (a v2.4 threads UI is the likely
first pressure), the answer is a server-written summary document holding only those
fields.

The privacy rule's `coach()` helper still `get()`s `/users`: a `get()` inside a rule
is not itself subject to the rules. Emulator-verified — all four toggle checks pass
with the collection closed.

**The second finding — "the shared listing does two `get()` per document, so it fails
past ~10 prospects" — is withdrawn as measured wrong.** A query is evaluated once
against its own constraints, not once per returned document; that is the same
machinery that refuses an unfiltered listing here. `coachId` is a single bound value,
so the rule resolves one `/users` document however many prospects come back. Budget
is per request: measured at 10 lookups for a single-document read and 20 for a query
(the docs say 10 for both, so the rule budgets against 10). Emulator-verified — the
shared listing passes at 26 and 60 documents, with and without `orderBy`, while the
toggle-off listing is still refused at 60.

**Changed anyway:** the two `coach()` calls became one `let`-bound lookup in
`sharedUpwardBy()`. Not for the budget — 2 of 10 was never near the ceiling — but
because the docs hedge caching with "may be", and because the invariant that both
halves of the predicate read the SAME coach document is now syntactic instead of a
convention two separate lookups could drift out of.

**Not done, deliberately:** copying `shareProspects` onto prospect documents.
`PLAN_V2.1a.md` §4 already rejected it for revocation latency and that still stands —
a fan-out window where a stale `true` grants access is exactly what a DPDP control
cannot have. `coachUplinePath` is already denormalised on prospects and does not
help: it carries the path but not the toggle, and a rule reading fields the query
does not constrain refuses the query outright, which would push the privacy predicate
out of the rules and into every call site — the opposite of BUILD_PROMPT_V2 §3.

`e2e/rules.test.ts` goes 21 → 27 checks: the two `users` assertions flip to
`assertFails` (plus one for the self read) so a reopening cannot pass quietly, the
mandatory toggle-off denial is re-run against a 26-document fixture, and a canary on
a throwaway ruleset pins the lookup ceilings so "26 documents still pass" cannot go
vacuously green if the emulator ever stops counting. **Honest limit:** the scale and
canary checks pass against the old rules too, because there was no bug there to
catch. They are a regression pin, not a reproduction.

## D49 — Storage rules go back to deny-all until something uploads (2026-08-10, v2.2b)

`storage.rules` shipped in v2.1b as a working ruleset for three folders. Nothing in
the app has ever used Storage: no `storageBucket` in `src/lib/firebase.ts`, no
`firebase/storage` import, no bucket on the Admin app, `npm run emulators` starts only
auth and firestore, and proof media is still a base64 data URL in the Firestore
document (D3, D33).

**Why:** one of those grants was wrong, in the direction that matters.
`/users/{userId}/proofs/{fileName}` allowed `read: if signedIn()` — any signed-in
coach could read any other coach's evidence photos, while the Firestore `proofs` rule
correctly narrows the same evidence to the coach it is about and the upline who
asked. A signed-in client needs no download token to use that: a constructed `ref()`
plus `getBytes` is the whole exploit. The header's "enumeration is not possible"
defence was reasoning about anonymous callers, and its "unguessable id" leaned on the
shape of file names that no code produces yet.

**Resolved as** deny-all, for exactly the reason D38 gave for `firestore.rules` in
v2.1a: a permissive placeholder is the kind of thing that survives to production, and
a deny-all cannot. `firebase.json` already points `storage` at this file, so it was
one `firebase deploy` from live, not inert. The size and contentType bounds were the
useful part and they lose nothing by landing with the uploader that must satisfy them.

**The design is not thrown away.** The path conventions and reasoning now live in
`storage.rules` itself, where the next session will read them. Short version: Storage
rules cannot `get()` a Firestore document, and object metadata is settable by the
uploader, so the identities the rule must compare have to live in the path.
`proofs/{coachId}/{reviewerId}/{rest=**}` reproduces the Firestore predicate from two
fields that never change after `requestProof` writes them, and it sits outside
`users/{uid}/` so a future public-read rule on that prefix cannot swallow evidence
photos. That is correct **only** while those two fields stay immutable — if a proof
request is ever reassigned to a different upline, the baked path goes stale and the
reviewer silently loses access.

`initializeTestEnvironment` accepts a `storage` block, so the check that was never
possible — a coach outside the exchange cannot read the proof — becomes possible the
day there is a proof to read. Note `submitProof` currently demands a
`data:image/jpeg;base64,` prefix, so it changes in the same session as the uploader.

## D50 — the F11 toggle had a rule but no switch (2026-08-10, v2.3)

`firestore.rules` has held the correct privacy predicate since the migration: an
upline reads a downline's prospects only if `shareProspects == true` **and** they are
in that coach's `uplinePath`. `updateUser` accepted the field. But nothing in the app
could produce a `true` — `createUser` writes `false`, and `PATCH /api/me` builds a
whitelist covering `name`, `city`, `photoUrl`, `levelName` and dropped
`shareProspects` silently. The allow branch was reachable only by hand-editing a
Firestore document, which is why the rules tests passed: the fixture sets it directly.

The API now accepts the field as a **strict boolean** — no coercion.
`Boolean("false")` is `true`, and turning sharing ON when the caller meant off is the
one mistake this field must not be able to make. So `"true"`, `1`, `null`, `[]` are
all rejected. The response echoes the saved document's value rather than the
request's, so the client never infers the state of a privacy grant.

`settings/PrivacyToggle.tsx` carries no accent colour and nothing animates: gold on
"share my prospects" would read as the app leaning on the coach to say yes, and a
privacy screen has no opinion about their answer (G1, G3). Turning it ON asks a second
time and names the names and phone numbers out loud; turning it OFF is one tap.
Withdrawing consent must never cost more taps than giving it — the same
no-dark-patterns logic as cancel-anytime. State reads as the words "On." / "Off."
rather than a slider, because a slider's position is the one thing a coach must not
have to guess at. Both states say the activity counts flow up regardless, so nobody
turns it on believing it hides their numbers.

**Copy tension worth knowing about.** F11's mandated phrase is "Share my prospect
details with my upline", so the button carries it verbatim. But the rule grants the
whole `uplinePath`, not just the direct upline — so the state lines and the confirm
body widen it to "your upline — and the coaches above them". A coach who reads only
the button underestimates what they are agreeing to; a button that contradicts the
spec fails a compliance grep. The widening went in the prose.

A coach with no upline gets an explanation instead of the switch: their `uplinePath`
is empty, so the switch would change nothing. That is a deviation from a literal
reading of "this toggle is non-negotiable", taken because a control that does nothing
is its own dishonesty on a privacy screen.

**The switch grants a capability nothing consumes yet.** Every server read scopes
prospects to the session user and the team tree shows counts only. An upline-facing
prospect reader is a separate piece of work — and per D48 the rule now costs one
lookup, so the cap that was thought to block it does not exist.

**The prospect never consents to this**; the coach consents on their behalf. Mode A's
consent tick (v2 §5.2, unbuilt) covers "I am saving your details", not "I may show
them to my upline". Whoever writes that tick decides whether it mentions onward
sharing.
