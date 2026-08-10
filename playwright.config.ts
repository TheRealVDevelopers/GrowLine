import { defineConfig, devices } from "@playwright/test";

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
        // Point at the Chromium already on the machine rather than downloading
        // one. @playwright/test pins a browser build (1234 at time of writing)
        // and this image ships 1194; without this the runner fails with
        // "Executable doesn't exist" and tells you to run `playwright install`,
        // which is both a large download and unnecessary.
        launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
      },
    },
  ],
});
