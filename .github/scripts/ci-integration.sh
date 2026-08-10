#!/usr/bin/env bash
#
# Runs inside `firebase emulators:exec`, so auth (9099) and firestore (8080) are up for
# the whole of it and are torn down afterwards.
#
# Order is deliberate:
#
#   seed -> reset+migrate -> verify   the data every later suite reads, and proof it
#                                     arrived
#   test:rules                  a separate emulator PROJECT, so it cannot disturb the
#                               seeded data (growline-rules-test / -budget)
#   next start -> e2e           the production bundle, not `next dev`, because that is
#                               what ships
#
# `e2e:reset` rather than a bare `migrate:firestore`, even though CI always starts from
# an empty emulator and the reset is a no-op there. The point is that this script then
# runs correctly on a developer's machine too, against emulators that have been up all
# afternoon accumulating test data — and a CI script you cannot rehearse locally is one
# whose failures you can only debug by pushing. Verified: without the reset it fails on
# a used emulator with a migrate MISMATCH, which is precisely the D44 trap.
set -euo pipefail

echo "--- seeding SQLite and migrating into Firestore"
npm run db:seed
npm run e2e:reset
npm run migrate:verify

echo "--- Security Rules (BUILD_PROMPT_V2 §5.7 makes this one mandatory)"
npm run test:rules

echo "--- starting the production server"
npx next start &
SERVER_PID=$!
# Kill the server whatever happens, including a failing e2e run, so emulators:exec is
# never left waiting on a child that outlives the script.
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

# Poll rather than sleep a fixed guess: a cold start is a few hundred ms on a warm
# runner and several seconds on a cold one, and a fixed wait is either flaky or slow.
if ! curl --retry 60 --retry-delay 1 --retry-connrefused -sf -o /dev/null \
  http://127.0.0.1:3000/login; then
  echo "Server never became ready on http://127.0.0.1:3000" >&2
  exit 1
fi
echo "--- server is up"

echo "--- e2e"
npm run e2e
