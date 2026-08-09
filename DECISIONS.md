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
