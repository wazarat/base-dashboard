import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { TEST_USER } from "./test-user";

/**
 * Login wall phase 2, signed in (owner prompt, 2026-11-11): every tab loads its data from
 * /api/data/gated (200), and an Add to compare clicked before logging in is finished after.
 * Uses the CI-created test user through @clerk/testing; skips without the Clerk keys.
 */
test.skip(!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, "No Clerk keys in the environment, so the logged-in run is skipped.");

const TABS = ["/sectors/", "/traction/", "/funding/", "/explorer/", "/security/", "/stocks/", "/investors/"];

function watch(page: Page) {
  const errors: string[] = [];
  const api: number[] = [];
  page.on("console", (m) => m.type() === "error" && !/status of 401/.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => /\/api\/data\/gated\//.test(r.url()) && api.push(r.status()));
  void page.route(/tradingview\.com/, (r) => r.fulfill({ body: "", contentType: "application/javascript" }));
  return { errors, api };
}

test("every tab loads its gated data once signed in", async ({ page }) => {
  const w = watch(page);
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: TEST_USER });
  for (const tab of TABS) {
    await page.goto(tab);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("login-wall")).toHaveCount(0);
    await expect(page.getByTestId("gated-loading")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("login-dialog")).toHaveCount(0);
    await expect(page.getByRole("main")).not.toBeEmpty();
  }
  expect(w.api.length).toBeGreaterThan(0);
  expect(w.api.every((s) => s === 200), `gated API statuses ${w.api.join(",")}`).toBe(true);
  // The Funding event detail and a two-project comparison are there too.
  await page.goto("/?event=2025-11-11-lighter-raises-68m-with-robinhood-participating");
  await expect(page.getByTestId("event-dialog")).toContainText("Ribbit Capital");
  await expect(page.getByTestId("event-dialog").getByRole("link", { name: /fortune\.com/ })).toBeVisible();
  await page.goto("/compare/?compare=uniswap,lighter");
  await expect(page.getByRole("main").getByRole("table").first()).toBeVisible();
  expect(w.errors).toEqual([]);
});

test("an Add to compare clicked while logged out is finished after login", async ({ page }) => {
  const w = watch(page);
  await page.goto("/compare/?compare=uniswap&project=lighter");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("project-modal").getByRole("button", { name: "Add to compare" }).click();
  await expect(page.getByTestId("login-dialog")).toBeVisible();
  await expect(page).not.toHaveURL(/compare=[^&]*lighter/);
  await clerk.signIn({ page, emailAddress: TEST_USER });
  await expect(page).toHaveURL(/compare=[^&]*lighter/, { timeout: 15_000 });
  // The gated set arrives without a reload once the reader has logged in on the page.
  await expect.poll(() => w.api.includes(200), { message: `gated API statuses after login: ${w.api.join(",") || "none"}`, timeout: 15_000 }).toBe(true);
  // The project pop-up (and the login pop-up, if still up) hide the page from the accessibility tree; close them first.
  const dialogs = page.getByRole("dialog");
  for (let i = 0; i < 3 && (await dialogs.count()) > 0; i++) await page.keyboard.press("Escape");
  await expect(dialogs).toHaveCount(0);
  // The 1 MB gated set is parsed and the comparison re-rendered after the 200, so allow what the tab test allows.
  const state = async () =>
    page.evaluate(() => ["login-wall", "gated-loading", "page-placeholder", "login-dialog"].filter((id) => document.querySelector(`[data-testid="${id}"]`)).join(",") || "no placeholder or dialog");
  await expect(page.getByRole("main").getByRole("table").first(), `comparison table after login (${await state()})`).toBeVisible({ timeout: 15_000 });
  expect(w.errors).toEqual([]);
});
