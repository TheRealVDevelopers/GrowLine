import { test, expect } from "@playwright/test";

/**
 * /status — the deployment's health readout (D83).
 *
 * Visited signed out, because that is its entire job: it exists for the moments
 * when the app is broken and nobody can log in. D68 is the standing lesson that a
 * public page nobody has visited signed-out is a page that may not be public at
 * all — this one has the extra trap that "status" is a RESERVED_SLUG, so a missing
 * PUBLIC_PATHS entry sends it to /login silently.
 *
 * Against the emulators every probe passes, so this also pins that the nine
 * checks run and report rather than crash: a status page that 500s is the one
 * outcome it is not allowed to have.
 */
test("the health readout is reachable signed out, and every probe reports", async ({ page }) => {
  const response = await page.goto("/status");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { name: /status/i })).toBeVisible({ timeout: 20_000 });

  // Nine verdicts, each PASS against the emulators. Zero FAILs, and zero would
  // also catch the page silently rendering an empty list.
  await expect(page.getByText("PASS", { exact: true })).toHaveCount(9);
  await expect(page.getByText("FAIL", { exact: true })).toHaveCount(0);

  // It never asks anyone to sign in.
  await expect(page).toHaveURL(/\/status$/);
});
