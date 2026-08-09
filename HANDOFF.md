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
- [ ] **Leg 2 — cloud → PC.** On the PC:
      ```bash
      git fetch origin claude/mobile-pc-workflow-test-alhnwl
      git checkout claude/mobile-pc-workflow-test-alhnwl
      git pull
      ```
      Then fill in the PC line in the log table below, commit, push.
- [ ] **Leg 3 — PC → phone.** From the phone, ask this session (or a new one)
      to pull and read the file back. If it can read the line the PC wrote,
      the loop is closed.

---

## Handoff log

Append a row every time you hand the work over. Newest at the bottom.

| # | From | What was done | Where it stopped / what's next |
|---|------|---------------|-------------------------------|
| 1 | Phone → Claude Code web | Pulled the repo, created this file on the test branch, pushed. | Waiting on Leg 2 — PC needs to pull and add row 2. |
| 2 | PC | _(fill this in from the PC — even one line is enough)_ | |

---

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

---

## Where this repo sits, and what needs a PC

Current state: one commit, phases 1–6. `CLAUDE.md` §14 says phases go **one at
a time** — so the natural unit of a handoff here is one phase.

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
