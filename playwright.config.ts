import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Which browser to drive, resolved per machine rather than hardcoded.
 *
 * The cloud container ships a Chromium at a fixed path and no matching Playwright
 * download, so the config pointed straight at it. That path does not exist on a
 * Windows PC, and the suite could not run there at all — which defeats the point of
 * "phone decides, PC verifies", since e2e is PC work by definition.
 *
 * Order: an explicit override, then the container's binary, then the locally
 * installed Chrome. Never a download.
 */
const CONTAINER_CHROMIUM = "/opt/pw-browsers/chromium";
const explicitPath = process.env.PW_CHROMIUM_PATH;
const resolvedPath =
  explicitPath && existsSync(explicitPath)
    ? explicitPath
    : existsSync(CONTAINER_CHROMIUM)
      ? CONTAINER_CHROMIUM
      : undefined;
const browserBinding = resolvedPath
  ? { launchOptions: { executablePath: resolvedPath } }
  : // Uses the Chrome already installed on the machine, so no revision has to
    // match and nothing is fetched.
    { channel: "chrome" as const };

/**
 * e2e against the Firebase emulators — no real project, no SMS, no reCAPTCHA.
 *
 * The emulator exposes the verification codes it "sent" over a REST endpoint, so
 * the whole phone-auth flow is drivable in CI. That is what makes the v2 §5.7
 * happy-path test possible without a phone in someone's hand.
 *
 * Assumes the emulators are already running (`npm run emulators`) and the data has
 * been migrated (`npm run migrate:firestore`). Deliberately not started here: the
 * emulator holds state in memory, and a test run that silently wipes it would make
 * every other script's results depend on test ordering.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one Firestore, shared state
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    // A ₹10K Android is the target device (v1 §4.4), so the viewport is a small
    // phone rather than a desktop window.
    ...devices["Pixel 5"],
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Pixel 5"],
        // See browserBinding above: the container's Chromium where it exists, the
        // machine's installed Chrome otherwise. Never `playwright install`.
        ...browserBinding,
      },
    },
  ],
});
