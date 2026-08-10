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

**Correction to this entry as first written.** It claimed `offline-capture.spec.ts`
had caught this race. It had not, and the original attribution was wrong.

That test was failing on a strict-mode violation — `toBeVisible()` throws rather than
retries when a locator matches two elements — and the two elements were both
server-rendered rows, momentarily present while `router.refresh()` swapped the tree
in. The pending list was not involved at all: the failure snapshot contains neither
the "On this phone" badge nor the "waiting to upload" banner, and the database held
exactly one document for that prospect throughout. Fixed on the test side (D51), and
the transient double-render during a refresh is a Next behaviour, not a defect here.

The race described above is still real and the guard is still correct — three event
sources, unordered IndexedDB reads, last-writer-wins. But it was found by reading the
code, and it has never been observed in the wild. Recorded that way rather than
claiming a test caught it, because a decision record that credits the wrong evidence
sends the next person to the wrong file.

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

## D51 — Threads: addressed by sender, not by a recipient list (2026-08-10, v2.4)

F8 built. The design question that shaped everything: how does a downline find the
broadcasts meant for them?

**Rejected: a recipient list on the thread.** It breaks on the two things that
actually happen. A senior coach's line of a few thousand does not belong in one
document, and anyone who joins tomorrow would never see what their upline sent last
week — the list is fixed at send time and a line is not.

**Chosen: a thread stores only who sent it.** A coach receives it if the sender is one
of their own ancestors, which they already know from `uplinePath` (D36). The inbox is
`senderId in <my uplinePath>`, so one broadcast is one document however many thousand
people it reaches, there is no fan-out at send time, and a coach who joins later sees
the history. `scope` then narrows it: "all" reaches every descendant, "direct" only
the sender's own direct downlines — resolved against the reader, never stored per
recipient.

**The rules shape follows from how Firestore evaluates a list.** Rules for a query are
evaluated ONCE against the query, not per document (D48), so every field the rule
tests must be pinned by the query's constraints. That is why the rule has a separate
branch for the direct upline instead of one branch testing both path membership and
scope: a client pinning `senderId == <one id>` makes `senderId == me().uplineId` a
decidable boolean, so a coach needs one listener for their upline rather than one per
scope. A deeper ancestor's threads require pinning `scope == "all"` too — which is
correct, because a "direct line only" message from a grandparent is not addressed to
you and the rules will not serve it. The rules tests pin all five query shapes,
including the one that must be refused.

**Re-broadcast copies rather than points.** A forward is a new thread owned by the
forwarder, carrying the ORIGINAL author's name — not the hop it arrived through, so a
chain reads "via Asha" rather than accumulating a map of somebody's team structure. It
then travels by exactly the same rule as anything else that coach sends: no special
case in the query, the rules, or the UI. And the original sender's ack count keeps
counting only the people they wrote to themselves, which is the number they can act
on.

**Receipts are denied to every client.** A sender watches `seenCount` and `ackCount`,
which sit on the thread document they already read. Nothing in the browser needs the
individual receipts, and opening them would hand a sender a per-person read log of
their line — a different and more intrusive thing than a number.

**Counters and idempotency.** `threadReceipts/{threadId}__{userId}` is a deterministic
id for the same reason as the constraints in D35: a doubled tap on a flaky connection
must not increment a count somebody is watching. The receipt and the increment move in
one transaction, and an ack implies a seen, so `ackCount` can never exceed `seenCount`.

**Seen is reported by the client, in one batch, after paint.** Not during the server
render: marking a message read is a write, and a render that writes fires again on
every refresh, so the count would measure renders rather than readers. Not one request
per card either — opening the tab on 3G must not fire thirty requests to move somebody
else's counter.

**Links, not uploads.** F8 asks for "video link", and a URL satisfies it — so Storage
stays deny-all (D49). The scheme is an allow-list of `http` and `https`, parsed with
`new URL` rather than a regex: this is the one field in the app authored by one user
and rendered to thousands, so `javascript:` and `data:text/html` both have to be
unreachable, and a regex on URLs is how `https:/\/evil.com` gets through.

**Not built: the Leader-tier gate.** v2 §8 makes sending a paid feature, but tiers do
not exist yet (v2.6), so gating now would lock every coach out of a feature they can
use. Left open deliberately rather than faked.

**Push is capped at 200 and says so.** One tap from a senior coach would otherwise fan
into thousands of push requests inside one HTTP handler. Past the cap the thread is
still delivered — it is in every inbox the moment it is written — and the route logs
how many were notified versus how many have it. A cap that stays silent reads as
"everyone was notified" when they were not.

## D52 — the offline-capture assertion was brittle, not the sync (2026-08-10, v2.4)

`expect(locator).toBeVisible()` throws a strict-mode violation when the locator
matches two elements, and does not retry it away. The prospects list momentarily holds
two copies of the same row while `router.refresh()` swaps in the server-rendered tree,
so the test failed intermittently — roughly one run in three, and only in-suite, which
is what made it look like state pollution and then like the D43 race.

It was neither. Verified: the failure snapshot contains no "On this phone" badge and no
"waiting to upload" banner, so the pending list is not involved, and the database held
exactly one document for that prospect. Both matches were server-rendered rows.

Fixed by asserting visibility on `.first()` and moving the no-duplicate guarantee onto
`toHaveCount(1)`, which retries until the count SETTLES at one. That is stronger than
the original pair: it catches a duplicate row that persists as well as a duplicate
document, and it cannot pass by racing. Confirmed over four repeats of the interaction
that reproduced it.

The general lesson, since this shape has now cost two debugging cycles on this branch:
`toBeVisible()` on a possibly-duplicated locator tests the renderer's transient state,
not the property you meant. Assert the property.

## D53 — CI, and a unit-test runner that costs nothing (2026-08-10, v2.3)

There was no `.github` directory. 21 e2e tests and 43 Security Rules checks existed and
ran when somebody remembered — which is not a safety net, and BUILD_PROMPT_V2 §5.7 calls
the rules test MANDATORY. "Mandatory" has to mean a machine enforces it.

**One job, not several.** The suites share one Firebase emulator and one seeded
database, so splitting them would mean booting and seeding twice to save no wall clock.
Every step blocks: there is no advisory step, because a check nobody has to pass is a
check nobody reads.

**The unit runner is `node --test` via `tsx`, adding zero packages.** Node has shipped a
test runner since 20 and `tsx` was already a dependency for the seed and migration
scripts. On a project with a stated infra budget (v1 §10) that installs from lockfile on
every push, a runner that adds nothing to `node_modules` is the right default. Vitest
earns its place the day something needs jsdom or module mocking; the pure modules under
test need neither, because they are pure.

**Three things that would each have made this fail only in CI:**

1. `NEXT_PUBLIC_*` values are inlined at BUILD time, so they are set at job level rather
   than before the test step. Set them late and the built bundle talks to a real project
   while the server talks to the emulator — the silent failure `.env.example` warns
   about, where nothing errors and the realtime row just never arrives.
2. `FIREBASE_SERVICE_ACCOUNT` is deliberately **unset**, because both emulator hosts are
   set and the D45 boot guard refuses that combination. A credential added here "for
   completeness" would stop the app booting, which is the guard working.
3. Chromium is resolved explicitly into `PW_CHROMIUM_PATH` rather than falling through
   to `playwright.config`'s `channel: "chrome"` branch, so CI does not depend on
   whichever Chrome the runner image happens to ship.

**The integration script uses `e2e:reset`, not a bare `migrate:firestore`,** even though
CI always starts from an empty emulator where the reset is a no-op. That is what makes
`bash .github/scripts/ci-integration.sh` a faithful local rehearsal — and it is not
theoretical: run it against emulators that have been up all afternoon and without the
reset it fails on a migrate MISMATCH, exactly the D44 trap. A CI script you can only
debug by pushing is a CI script you will not debug.

Rehearsed locally end to end before committing: exit 0, collections match,
`migrate:verify` all-pass, 43 rules checks, server up, 21 e2e passed. **What is still
unverified is everything GitHub-specific** — the runner image, `setup-java`,
`emulators:exec` under Actions, and artefact upload. The first real run is the test of
those, and it is expected to need a fix or two.

**CI still cannot catch a missing composite index** (D42). The emulator creates them on
demand. Nothing in this workflow changes that, and it must not be mistaken for
coverage.

## D54 — the healthy weight range is printable tenths, not bounds × height² (2026-08-10, v2.3)

`healthyWeightKg` published `{ min: 18.5 × h², max: 23 × h² }`. Both ends were wrong,
in opposite directions, at every height from 140 to 200 cm.

**The top.** 23 is the EXCLUSIVE top of the band — `bmiBand` asks `bmi < 23` — and the
band is decided on the ROUNDED figure (D12). So the heaviest weight the card presented
as healthy computed to a displayed BMI of 23.0, which the same card then labelled "Just
above the general range".

That is not cosmetic. Under D13 the entire purpose of the neutral phrasing is that the
card never passes judgement on a person, and telling somebody standing at the top of
their own stated healthy range that they are above it is exactly the judgement the
phrasing exists to avoid. RULES L3 territory.

**The bottom**, found while fixing the top: `18.5 × h²` rounds UP to a weight whose true
BMI is below 18.5 — at 150 cm the old `min` of 41.6 kg is a true BMI of 18.4889 — so it
only read as healthy because the display rounded it up, and it excluded a lighter tenth
that genuinely does read as healthy.

**Resolved as** a search for the extreme printable tenths, each verified against the
same `bmiBand` the card uses. The range is not an algebraic identity; it is a question
about rounding, so the invariant is stated as code rather than trusted to arithmetic.
At 165 cm the range moved from 50.4–62.6 to 50.3–62.4.

The test that used to assert `bounds × h²` is what let this through, so it now asserts
the property instead: every weight offered as healthy bands as healthy, and one tenth
outside either end does not. The unit-slip guard it also provided is kept at a looser
tolerance, because a centimetre/metre confusion is off by 10,000 and nothing else here
would catch it.

## D55 — the Weekly Recap reintroduced the E1 day-boundary bug in a private copy (2026-08-10, v2.3)

`weekly-recap.ts` had its own `startOfLocalDay`, whose comment claimed it was "the D26
rule, reused". It was not reused. It was a second implementation, and it was wrong in a
way that only appears on some machines:

```js
const asLocal = new Date(guess.toLocaleString("en-US", { timeZone }));
```

`toLocaleString` renders the wall clock in `timeZone`; `new Date(string)` parses it back
in the **host process's** timezone. They agree only when the host is UTC. On an IST host
it returned `2026-08-10T00:00:00Z` for "2026-08-10" instead of `2026-08-09T18:30:00Z` —
five and a half hours late.

That instant is the lower bound of the `prospects.createdAt` range query, so the recap
silently dropped every prospect captured between midnight and 05:30 IST on the first day
of the week, under-reporting the number on the card a coach shares to WhatsApp Status.

Fixed by importing `startOfDayInZone`. RULES E1 already said "go through `day.ts`" and
this is the second time that rule has been earned — the first cost a roll-up. Recorded
because the lesson is not "be careful with timezones" but the narrower and more useful
one: **a duplicate that looks obviously equivalent is how the first one got in.** The
deleted function is replaced by a comment saying so, at the site where the next person
would be tempted to write it again.

## D56 — the streak flame showed an intact streak as lost, from midnight (2026-08-10, v2.3)

`log/page.tsx` passed `live={state.hasLoggedToday}`. `hasLoggedToday` is false from IST
midnight until the coach logs, so an intact ten-day streak rendered greyed out with
"Log today to start again" every morning — precisely the "zero implying they already
lost it" outcome D27 was written to prevent.

The prop had nothing left to express. `streakFromKeys` anchors on today OR yesterday, so
it already returns 0 once a whole day has lapsed, and the render is gated on
`streak > 0` — meaning whenever the flame appears at all, the streak IS live. Now
omitted, with the reasoning at the call site.

Worth noting what this says about the shape of the bug: two correct components wired
together wrongly. Neither `StreakFlame` nor `streakFromKeys` was at fault, so no test of
either could have caught it.

## D57 — thread body and link validation: invisible characters, and where a cap applies (2026-08-10, v2.4)

Two gaps in D51's validation, both found by unit tests written against the stated intent
rather than against the code.

**`checkBody` missed zero-width characters.** `String.prototype.trim` follows the
ECMAScript WhiteSpace definition, which excludes U+200B–U+200D, U+2060 and U+FEFF. So a
body of one zero-width space survived the trim and delivered exactly the blank card plus
push notification to an entire line that the source comment said the trim prevented.

Now tested by codepoint. Deliberately **not** by stripping those characters from the
stored body: U+200D (zero-width joiner) is meaningful in Devanagari and Kannada
conjuncts and in emoji sequences, so stripping it from a coach's actual text would
corrupt legitimate Indic spelling in order to fix a blank-message bug. The check decides
whether anything visible is present; it does not edit what was written. The codepoints
are listed as escapes rather than a regex containing the literal characters — a
character class whose source is invisible cannot be reviewed.

**The link cap bounded the input, not the stored value.** `MAX_LINK_URL` was checked
against what was typed, but the value written to the document and rendered into every
recipient's anchor is `new URL(...).toString()`, which percent-encodes. 200 accented
characters arrive as 223 and leave as ~1223; astral characters take the multiplier to
about six.

The obvious fix — check the normalised form against 500 — is wrong, and rejecting it is
the actual decision here: it would refuse a perfectly ordinary link containing Kannada
or Devanagari text, which this audience will paste, and tell them a 223-character URL was
too long. So there are two ceilings: 500 on what is typed, 2000 on what is stored. The
first is a friendly early error, the second is the real bound.

The scheme allow-list was attacked and **held** — case variants, tab/newline splitting,
leading control characters, `data:text/html` plain and base64, `vbscript:`, `file:`,
`blob:`, and the ambiguous forms a regex mis-reads. Parsing with `new URL` rather than a
regex is what makes that true, since the WHATWG parser strips tab/LF/CR and lower-cases
the protocol before the check sees it.

## D58 — the Streak Shield is NOT built, and three failing tests say so (2026-08-10, v2.3)

BUILD_PROMPT_V2 §4 dopamine map #1 requires "one auto grace-day per month so a single
miss doesn't kill motivation". It does not exist. `streakFromKeys` breaks at the first
gap; there is no allowance and no month bookkeeping anywhere.

Worse, `StreakFlame` accepts a `shieldUsed` prop and renders copy for it — but nothing
ever passes it. The shield exists solely as UI text for a state that cannot occur.

**Recorded as three `todo` tests rather than as passing tests of the current
behaviour.** A green test asserting "one miss ends the streak" would read as a decision
and quietly become the spec. Under `node:test` a `todo` runs, prints its assertion
failure with the reason, and still exits 0 — so the gap stays visible on every CI run
without blocking unrelated work. The assertions are written implementation-agnostically
("more than the no-shield answer", not "exactly N") so they should start passing when the
mechanic lands, without being rewritten to match whatever it does.

This is the pattern for any spec requirement found unbuilt: encode it as a `todo`, never
as a passing test of the gap.

## D59 — five languages, by cookie, and NOT on the report card (2026-08-10, brought forward from v1 §8)

Kannada, Hindi, Tamil and Telugu alongside English. v1 §8 parks UI localization until
200 paying users and RULES S7 says do not build Phase 2 early; the owner asked for it
explicitly, which is the one thing that overrides that.

**A cookie, not `localStorage`.** The theme is a `localStorage` value applied before
paint, and that works because a theme is only CSS — the server ships one markup tree and
the browser recolours it. Language is not like that: the strings are IN the markup and
nearly every screen is server-rendered, so the server must know the language while it
renders. `localStorage` does not exist there. The cookie also removes any flash of
English and any layout shift when a longer Kannada word replaces a short English one.

**No `/[locale]` URL prefix,** which is the obvious Next pattern and wrong here: the
public portfolio lives at the ROOT, `growline.in/<username>` (F9), so a locale segment
would be indistinguishable from a coach's username and every prospect-facing link would
grow a prefix.

**No i18n library.** Five languages and a flat dictionary. A library would add a
dependency and a plural-rules engine for a problem this app does not have — its counts
render as bare numerals beside a label. `Intl.PluralRules` is the next step if that
changes, not a framework.

**Completeness is a type, not a convention.** `Dict = Record<keyof typeof en, string>`,
so a missing or misspelled key is a build error. `Record` rather than `typeof en`
deliberately: the values must be strings, not the same literal strings, or a translation
would only typecheck while it was still in English.

**What types cannot see, `tests/i18n.test.ts` does:** a key left in English, an empty
string, a dropped or renamed `{days}` placeholder, a string in the wrong script. All four
ship silently and none is caught by `tsc` or by a screenshot unless a reader of that
language looks at it. Script is asserted as "contains at least one character from this
block", not "only" — "QR" stays in Latin in several translations, and an over-strict test
must not break a real product decision.

**Layout is asserted, not eyeballed.** `e2e/language.spec.ts` switches through all four
and asserts the document never scrolls sideways AND that no nav label is clipped inside
the fixed-height bar. Those are different failures: a clipped label leaves the page
exactly 375px wide and simply becomes unreadable. Assertions are on SCRIPT rather than on
words, because every translator flagged wording they were unsure of and a test pinned to
a specific string would fail on a legitimate copy fix.

**The switcher never translates its own options.** All five always show their native
names. A coach who cannot read English cannot find "Kannada" in a list, but can find
ಕನ್ನಡ — and the case that matters most is somebody who has landed in a language they
cannot read and needs to get out of it. Translating the option labels would break exactly
that.

**The report card and PDF stay in English, and this is the important limitation.** They
are rendered as images by satori, which has no Indic shaper: Devanagari, Kannada, Tamil
and Telugu all come out with vowel marks misplaced and conjuncts broken, and committing
fonts does not fix it. A translated report would look worse than an English one, and the
report is the coach's first impression on a prospect. The switcher says so in plain words
rather than leaving a coach to discover it.

**Every translation needs a native-speaker review before launch.** They were produced by
this build, not by a translator, and each one came back with a flagged list — chiefly
"acknowledge" (no short natural equivalent in any of the four, and the app needs to
distinguish *seen* from *acknowledged*), "prospects" (rendered as the plain word for
"people" in all four, since the sales sense has no short natural translation), and
whether "QR" should stay in Latin. Those lists are in the session record; treat the
current strings as a working draft, not as finished copy.

## D60 — demo mode is a real session, not an auth bypass (2026-08-10)

The owner needs to show the app on the spot — an investor asks, and an OTP round trip
kills the moment. They also need to switch between an upline and a downline view, because
the story being told is a relationship: you set a target, here is how it arrives.

**The tempting implementation is a "skip auth" branch in the session check. Rejected.**
It would put a code path in production that production never exercises, make the demo
prove nothing about the real app, and place a bypass inside the one function that must
never have a way around it.

**Built instead as a real sign-in with the SMS step removed.** `POST /api/demo/session`
mints a custom token, exchanges it for an ID token, and sets an ordinary session cookie —
the same objects the phone flow produces. Downstream nothing knows the difference: same
Security Rules, same queries, same privacy toggle. That also makes it an honest demo,
because what the room sees is the product rather than a mock of it.

**The gate is one environment variable, `DEMO_MODE`.** Unset — which is production —
and `/demo` and `/api/demo/session` both return **404, not 403**: a 403 confirms a route
exists, and on the production deployment this must be indistinguishable from a typo. No
second way in: no query parameter, no header, and deliberately no "unless localhost"
check, because a guess about where the code is running is a guess that can be wrong.

**The uid is never taken from the request.** It is looked up from a fixed table of three
seeded seats, so even with demo mode on this cannot mint a session for an arbitrary
account. Verified: `role=admin` and `role=usr_root0000000000000000` are both refused.

**Three seats, because the story needs a top, a middle and a bottom.** Senior coach with
a team; a coach who is simultaneously somebody's downline and somebody's upline (the
position most coaches are actually in, and the only one where both halves of the
relationship can be shown); and a new coach receiving a target somebody else set. Fewer
than three and "here is what your downline sees" cannot be demonstrated at all.

**The chip stays visible, and that is a deliberate cost to the demo's polish.** Because a
demo session is a real session on real screens, the chip is the only thing distinguishing
this from the live product — the cue that stops demo data being screenshotted as if it
were somebody's own. Muted, `--info`-leaning, no gold and no animation: it is chrome, not
a feature being demonstrated.

**Two mistakes worth recording, both caught by tooling rather than by review:**

1. `window.location.href = next` failed the React Compiler's `react-hooks/immutability`
   rule. `assign()` is the honest form — the rule is right that assigning to a global is
   a mutation it cannot reason about.
2. `e2e/demo-gate.spec.ts` read `DEMO_MODE` from the **test runner's** environment while
   the server read it from `.env` — two different processes — so with the demo enabled
   locally the test asserted "must be 404" against a server correctly answering 200. Fixed
   by loading `.env` in `playwright.config.ts`, so both read one source of truth. CI is
   unaffected: it has no `.env` and sets nothing, so both sides see the flag unset.

The gate test asserts the correct behaviour for whichever mode it finds rather than
skipping when the flag is on — a test that quietly skips half the time teaches everybody
to ignore it. Verified in all three directions: open server + open expectation passes,
closed + closed passes, and closed-expectation against an open server **fails with the
intended message**, which is what makes it more than decoration.

## D61 — Mode A consent: a timestamp, enforced server-side (2026-08-10, v2.3)

v2 §5.2 and RULES P6: manual capture requires the coach to confirm the person knows and
agrees, before save.

**A timestamp, not a boolean.** "Did they consent" and "when" are different questions and
only the second is answerable to a regulator. Under DPDP the burden is on us to show
consent was obtained, and `true` with no date cannot be corroborated against anything.

**Null means NOT RECORDED, which is not the same as refused.** Every prospect captured
before this existed has null, and the migration **deliberately does not backfill** — a
timestamp written there would be invented evidence, which defeats the reason for storing
a date at all.

**Enforced in the API, not only by a disabled button.** The person whose name, phone and
body measurements are being stored is not in the request and cannot object to it, so the
gate has to live where a client cannot skip it. Strict `=== true`, no coercion — same
reasoning as D50: `Boolean("false")` is `true`, and recording a consent nobody gave is the
one mistake this field must not be able to make. The timestamp is stamped server-side; a
date the client chooses is worth nothing as evidence.

**Where the tick sits is a rules decision, not a layout preference.** RULES S2 caps a
screen at six input fields and `CaptureFields` already uses all six. This is not a seventh:
nothing is entered, nothing is stored from it but a timestamp, and it gates the ACTION
rather than collecting data. Splitting capture across two screens to make room would break
the 30-second rule (S1) for a control that costs one tap. So it sits with the Save button,
in the calm register — no gold, no animation. It is the one moment in the flow belonging to
somebody who is not holding the phone.

**It has to survive the offline queue (S5), and that is the subtle part.** The person was
standing there when the coach ticked; by the time the queue drains — hours later, on
another screen — nobody can confirm anything, so re-asking on sync is not an option. The
flag therefore travels in the queued record. A capture that lost it would be refused by
the API on replay and sit in the queue forever while the coach had already been told
"saved on this phone" — a silent loss of the person they just met. `offline-capture.spec`
asserts the tick is required AND that a queued capture still lands, which is why that
assertion lives in the offline test rather than in one of its own.

**Mode B needs no tick, because the act is the consent.** A QR self-fill is the person
scanning the code and typing their own details. Nobody is asserting anything on their
behalf, which makes it the stronger of the two: Mode A records a coach's word that a
conversation happened, Mode B records the person's own submission. Both now stamp
`consentAt`.

**Still outstanding:** the itemized privacy notice that v2 §5.2 wants linked from this
flow. It needs a grievance officer, a contact address and the legal entity — facts only
the owner can supply — and human translation for the four languages, so it is not
buildable here. The consent tick does not depend on it, and the erasure control on the
report page (D17) already gives the prospect a self-serve exit.

## D62 — the admin panel shows counts, and admin access is an env allowlist (2026-08-10, F12)

### Access is `ADMIN_UIDS`, not a database flag

A Firestore `admins/{uid}` document would let an admin be added without a deploy. That
convenience is exactly why it was rejected: it makes "who can see every coach's numbers"
writable by anything that can write to the database, and it makes a privilege grant
invisible in version control. An env allowlist means becoming an admin requires a
deployment, reviewed by whoever deploys. There will be one to three admins, so the
friction costs nothing.

An empty allowlist grants **nothing** and the whole panel 404s. Stated explicitly in code
because the alternative default — unset meaning "everybody" — is the kind of thing that
ships.

**404, not 403,** for a signed-in coach who is not an admin. A 403 tells a curious coach
the panel exists and is worth probing. A signed-out visitor gets the proxy's redirect to
`/login` instead, because the edge runtime cannot verify a JWT — the layout decides once
there is a session to check.

### The rule that governs the whole panel: counts, never identities

**No prospect name and no prospect phone number appears in the admin panel, ever.**

The entire F11 model — the toggle, the Security Rules, D48 closing the users collection —
exists so a coach's prospects stay theirs. An admin screen listing prospect identities
would be a second, unlogged path around all of it, available to whoever holds the deploy
key. Every query in `admin-metrics.ts` is a `count()` or an id-only `select()`, so the
constraint is structural rather than a habit.

The predictable pressure on this is support ("a coach asked us to find their prospect").
The answer is that the coach already has it on their own screen; we do not need a copy, and
holding one makes us worth attacking. The footer says so on every admin screen, because
that is where the argument will happen.

### A metric that cannot be computed says so, and does not show zero

Month-2 paid retention and trial→paid conversion both need paying users, and payments are
unbuilt (v2.6). A north-star retention figure rendering "0%" would be read as a
catastrophe rather than as an unbuilt feature, and somebody would act on it. So
"unmeasurable" is a first-class state with its own card and a reason.

The four that DO compute are the ones that answer "is the app working": coaches logging
(the habit the retention model rests on), captures per coach, reports actually sent, and
thread acknowledgements. Verified against seeded data — 40% logging, 0% sent (seeded
reports were never sent, which is correct), 100% ack.

Each percentage prints its raw pair underneath. "60%" of 5 coaches and of 5,000 are
different facts and a percentage alone hides which one you are reading.

### One known cost

Firestore has no `COUNT(DISTINCT)`, so the distinct-logger metric reads seven days of log
ids — bounded by (coaches × 7), and it fetches no document bodies because the id encodes
the user (D26). Fine at pilot scale. Before it is not, replace it with a counter
maintained by a Cloud Function on log write; do **not** switch it to sampling, because a
heartbeat you cannot trust is worse than none.

## D63 — the rest of the admin panel, and one screen deliberately not built (2026-08-10, F12)

**Coaches list and detail.** The list shows only what lives on the user document, so it
costs one query however wide the table gets; last-logged and streak need a coach's log
history and are computed on the DETAIL page, one coach at a time. Putting them in the list
would multiply a page view by the number of rows — the admin-panel N+1 that is invisible at
ten users and a bill at ten thousand.

Search filters in memory over one capped query. Firestore has no substring search, and the
alternatives are a prefix-only index (which cannot find "asha" in "Vidya Asha") or a search
service. `LIST_CAP` bounds it and the page says when it truncates; when the cap starts
biting, the answer is a real search index, not a bigger cap.

The detail page calls out a coach with no upline in words rather than showing a dash — an
unattached coach is exactly the case "Link my line" exists for, and today it cannot be
fixed after signup.

**Broadcast reuses Threads rather than adding an announcements banner.** Coaches already
know where threads live and already know the acknowledge tap, so the seen and ack counters
come free — which is precisely what you want to know after telling every user something.

`PLATFORM_SCOPE` is deliberately NOT a member of `THREAD_SCOPES`. That one decision is the
whole safety design: `THREAD_SCOPES` is what the composer renders and what `isThreadScope`
accepts, so a coach cannot select it and the coach-facing API rejects it without needing a
separate check. The only writer is the admin-gated route, which re-checks `isAdmin` because
a route is reachable directly whatever the layout does.

Three things this surfaced that were not obvious:

1. **`toAppThread` would have silently rewritten every announcement to "direct".** Its
   "anything unrecognised is the narrower scope" rule is right, and it needed `platform`
   listed explicitly or `canRead` would have hidden announcements from everyone whose
   direct upline was not the admin — i.e. almost everybody.
2. **`listInbox` returned early for a coach with no upline,** which would have hidden
   announcements from exactly the people most likely to be new. Platform threads are now
   fetched unconditionally, by their own query.
3. **The announcement displayed the admin's personal name.** Caught by looking at the
   stored document rather than at the screen. It now displays as "Growline" — partly
   because "Root Coach" reads as a message from another coach and undermines it, but mainly
   because it would tell every user on the platform which account is an admin. `senderId`
   still records the real person, so the document and the audit log agree.

**No push on a platform broadcast, deliberately.** A notification to every user from one
button press needs a rate-limited job behind it. The announcement is in every inbox the
moment it is written; only the buzz is missing, and that is a smaller problem than a
fan-out nobody bounded.

**Typed confirmation on broadcast.** It is the widest-reach, least-undoable action in the
product. A checkbox gets dismissed without reading; typing "SEND TO EVERYONE" requires
having noticed what it says.

**Audit log is denied to clients, including admins.** A trail the audited party can read
from a browser is one they can learn to work around, and one they might be able to write to
if a future session relaxes the rule by half. Entries carry the actor's NAME as well as
their uid, because a uid is unreadable six months later and an audit entry has to stay
legible without a join.

**Subscriptions says it is empty rather than showing zeros,** same reasoning as the
Overview's unmeasurable cards. It also surfaces a row for any unrecognised `plan` value
instead of hiding the discrepancy in a total that does not add up.

**Promo codes: NOT built, and not in the nav.** A promo code exists to grant an extended
Leader trial or a locked founding price, and both are meaningless until tiers and payments
exist (v2.6). A screen that creates codes today creates codes that do nothing — and
somebody would hand them out at a club launch and find out in front of a room. A dead nav
item is worse than an absent one.

## D64 — dailyLogs and targets are closed to clients; the snapshot grant is gone (2026-08-10)

The last open finding from the v2.1 audit: `dailyLogs` and `targets` authorised reads with
`inLineOf(resource.data.uplinePath)`, where that `uplinePath` is a **snapshot** taken when
the row was written. `prospects` resolves the coach live and follows the tree; these did
not.

**Why it had to be fixed before re-parenting, not after.** Left alone it is a stale
roll-up. The moment a coach can be moved — the point of "Link my line" — it becomes a stale
**grant**: every log and target written before the move still names the OLD upline, so that
upline keeps read access to a coach who no longer reports to them, indefinitely, while the
new upline has none. A permission that outlives the relationship it was derived from.

**Resolved by closing both collections to every client, including the owning coach.**

The live-lookup alternative — `uid() in coach(resource.data.userId).uplinePath`, the shape
`prospects` uses — is correct but forces every client query to pin `userId`, and the only
query these collections are read with filters on `uplinePath` instead. So the correct rule
would break the only query shape that exists.

The real answer is that **no browser code reads either collection.** Verified rather than
assumed: the only client-side Firestore reads in the repo are `prospects`
(`RealtimeProspects`) and `threads` (`RealtimeThreads`). This was a grant no feature had
asked for — the same thing D48 closed on `users`, for the same reason.

**Activity still flows up** (v1 §5.4). It always did so through the Admin SDK:
`buildTeamTree()` is server-side and untouched. Confirmed by the full suite passing
unchanged, which is the point — if a screen had depended on the client grant, e2e would have
caught it.

The rules test that used to assert an upline **can** read a downline's log now asserts it
**cannot**, so reopening this has to be somebody's deliberate decision. A `targets` fixture
was added at the same time, because the new assertion would otherwise have passed vacuously
against a document that did not exist.

**A note for whoever adds a client-side team roll-up.** It gets a rule written against the
query it actually makes — and that rule must resolve the coach live, because a
snapshot-based grant is wrong again the day re-parenting ships.

## D65 — "Link my line": attach after signup, both directions, always two-sided (2026-08-10, F1)

`uplineId` was written once at signup and never again. So a coach who installed the app
BEFORE their upline did — which is how adoption actually happens, from the keen person
downward — signed up with no referral code and became a **permanent root**. There was no way
to attach them afterwards, ever.

That, and not a senior coach refusing to install, was what blocked bottom-up adoption. If
the person at the top never joins, the tree simply roots at the highest person who did and
everyone below still works — *provided* attachment can happen after signup.

**Two-sided approval, in both directions, always.** Never one tap:

- attaching yourself UNDER someone would let you see their line, so anyone could help
  themselves to a stranger's team by guessing a code;
- claiming someone as your downline would make their activity flow up to you.

Either direction unilaterally is a privacy hole, so both ask. Enforced in the library from
the stored request — the approver must be the party who did NOT ask — because the route is
reachable directly and a disabled button proves nothing.

**Identified by referral code, not phone number.** Both coaches already know each other; the
app only needs an identifier. Using the code means this cannot be used to test whether a
phone number has an account. And a failed lookup returns one message for both "no such code"
and "malformed", so the endpoint is not an oracle for guessing codes either.

**v1 attaches an unattached coach; it does not MOVE an attached one.** Moving somebody who
already reports to a coach is a different question — whose team are they on, does the old
upline get a say — and that is a product decision.

It also makes the hard part easy, which is why the constraint is worth keeping. Because the
child is a root their `uplinePath` is empty and every descendant's path currently ENDS at
them, so re-parenting is a pure **append** of the child's new ancestors onto every affected
path. No recomputation, and the same operation for the child, their descendants, and all of
those coaches' prospects, logs and targets.

**Two phases, because no Firestore transaction is big enough for the second.** The
authoritative change — the child's `uplineId` and path, the parent's counter, the request
status — is one transaction. The fan-out across four collections is batched afterwards and
**idempotent**: each write is skipped if the path already contains the new immediate parent,
so a fan-out interrupted halfway can simply be re-run. If it is interrupted, the tree is
correct at the top and stale below, and roll-ups under-report until it is re-run. That is the
honest trade; the alternative is holding a lock across thousands of writes, whose failure
mode is a half-attached coach.

**The subtle bug this design has, and how it is handled.** A root's own prospects, logs and
targets have an EMPTY path — that is what being a root means — so `array-contains child.id`
does not match them and the subtree passes miss them entirely. They are rewritten by a
separate owner-scoped pass. This is the single most likely thing to be got wrong here, and it
is asserted directly.

**`scripts/verify-reparent.ts`**, wired into CI. This operation rewrites documents across
four collections and its failure mode is silent: the coach looks attached, their team screen
looks right, and their downlines' work quietly stops rolling up. A unit test cannot reach it
and an e2e test would drive two browsers to assert what is really a data property. 17 checks,
including the grandchild (proving the whole subtree moves, not just the top), the root's own
rows, the cycle guard, the depth cap, that the asker cannot accept their own request, and
that a stranger cannot accept it either. The fixture is prefixed `vrp_` and self-cleaning so
it shares an emulator with the seeded data.

The fixture deliberately has TWO levels above the parent, because a bug that appends only
the immediate parent would pass against a shallower one.

**`lineRequests` is denied to clients entirely**, read included. An open read would let
anyone list who is trying to attach to whom — somebody's team structure assembled from the
outside.
