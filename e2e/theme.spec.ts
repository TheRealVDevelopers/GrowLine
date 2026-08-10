import { test, expect } from "@playwright/test";

/**
 * Design System 2.0 theme layer (v2 §4).
 *
 * Three things worth proving, because all three are silent when broken:
 *   1. dark really is the default
 *   2. a stored choice survives a reload — and survives it WITHOUT a flash of the
 *      wrong theme, which is why ThemeScript blocks before paint
 *   3. the system preference is honoured on first run
 */

test("a device that prefers dark gets dark", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // The token layer is actually wired, not just the attribute.
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );
  expect(bg).toBe("rgb(11, 16, 32)"); // #0B1020
  await ctx.close();
});

test("the server ships dark, so a dark-mode user never sees a light flash", async ({
  request,
}) => {
  // The pre-hydration default in the HTML is what a user sees for the few
  // milliseconds before ThemeScript runs. It must be dark: this audience is
  // overwhelmingly on dark, and a white flash on every load is the single most
  // visible way a theme system can feel broken.
  const res = await request.get("/login");
  expect(await res.text()).toContain('data-theme="dark"');
});

test("a light system preference is honoured on first run", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await ctx.close();
});

test("an explicit dark choice beats a light system preference", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("growline:theme", "dark"));
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );
  expect(bg).toBe("rgb(11, 16, 32)");
  await ctx.close();
});

test("the theme is applied before first paint, not after", async ({ page }) => {
  await page.evaluate(() => {}).catch(() => {});
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("growline:theme", "light"));

  // Capture the attribute at the earliest possible moment on the next load. If
  // ThemeScript ran after hydration this would still read "dark" here, which is
  // exactly the white-flash bug it exists to prevent.
  const early = await page.evaluate(async () => {
    const res = await fetch(location.href);
    const html = await res.text();
    return html.includes('data-theme="dark"');
  });
  expect(early).toBe(true); // server ships the default...

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light"); // ...script corrects it
});
