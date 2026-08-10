import { test, expect, type Page } from "@playwright/test";

/**
 * Design System 2.0 behaviours that are silent when broken (v2 §4, RULES G1–G6).
 *
 * These are not screenshot tests. Each one asserts a rule that has a *reason* —
 * the remaining arc, the banned blur, the income-free copy — so a future reskin
 * cannot quietly undo the reasoning along with the styling.
 */

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "growline-dev";
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const ASHA_PHONE = "9000000002";

async function loginAsAsha(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("98765 43210").fill(ASHA_PHONE);
  await page.getByRole("button", { name: /get otp/i }).click();
  const codeField = page.getByPlaceholder("••••••");
  await expect(codeField).toBeVisible({ timeout: 20_000 });
  const res = await fetch(
    `http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/verificationCodes`
  );
  const body = (await res.json()) as {
    verificationCodes: { phoneNumber: string; code: string }[];
  };
  const mine = body.verificationCodes.filter((c) => c.phoneNumber === `+91${ASHA_PHONE}`);
  await codeField.fill(mine[mine.length - 1].code);
  await expect(page.getByRole("heading", { name: /hello, asha/i })).toBeVisible({
    timeout: 20_000,
  });
}

test("the target ring lights the REMAINING arc, not the completed one", async ({
  page,
}) => {
  await loginAsAsha(page);
  await page.goto("/targets");

  const ring = page.locator('[data-testid="target-ring"]');
  await expect(ring).toBeVisible();

  // Asha is at 420/400 = 105%, so nothing remains and the gold arc is empty.
  // If someone "fixes" this to fill clockwise, the dash length inverts and this
  // fails — which is the point (v2 §4, Zeigarnik).
  await expect(ring).toHaveAttribute("data-percent", "105");

  const dash = await ring.locator("circle").nth(1).getAttribute("stroke-dasharray");
  const remaining = Number(dash?.split(" ")[0]);
  expect(remaining).toBe(0);
});

test("no screen puts money next to a target (RULES L4)", async ({ page }) => {
  await loginAsAsha(page);
  // Home is included because v2 §4's own example copy for Today's Mission carries
  // a "₹-equivalent" that D40 deliberately did not build. This is what stops it
  // being reintroduced later by someone reading the spec literally.
  for (const path of ["/targets", "/"]) {
    await page.goto(path);
    const text = (await page.locator("main").innerText()).toLowerCase();
    expect(text, `currency on ${path}`).not.toContain("₹");
    expect(text, `income wording on ${path}`).not.toMatch(
      /\bincome\b|\bearn(ing|ings)?\b|\bcommission\b|\bpayout\b/
    );
  }
});

test("Today's Mission renders actionable items from real data", async ({ page }) => {
  await loginAsAsha(page);
  await page.goto("/");

  const card = page.getByTestId("todays-mission");
  await expect(card).toBeVisible();

  // Never more than three — one item is not a list, four is a to-do app.
  const items = card.locator("li");
  expect(await items.count()).toBeLessThanOrEqual(3);

  // Every item must go somewhere: the card's whole job is one tap to the action.
  for (let i = 0; i < (await items.count()); i++) {
    await expect(items.nth(i).locator("a")).toHaveAttribute("href", /.+/);
  }
});

test("no screen uses backdrop-filter blur (RULES G4)", async ({ page }) => {
  await loginAsAsha(page);
  for (const path of ["/", "/log", "/targets", "/prospects", "/settings"]) {
    await page.goto(path);
    const blurred = await page.evaluate(() =>
      [...document.querySelectorAll("*")].some((el) => {
        const s = getComputedStyle(el);
        const bf = s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter;
        return !!bf && bf !== "none";
      })
    );
    expect(blurred, `backdrop-filter found on ${path}`).toBe(false);
  }
});

test("the settings theme switch actually flips the surface", async ({ page }) => {
  await loginAsAsha(page);
  await page.goto("/settings");

  await page.getByTestId("theme-light").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ).toBe("rgb(255, 255, 255)");

  await page.getByTestId("theme-dark").click();
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  ).toBe("rgb(11, 16, 32)");

  // The choice must survive a reload, or it is not a setting.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
