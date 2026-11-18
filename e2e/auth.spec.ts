import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Login wall phase 2, logged out (owner prompt, 2026-11-11). Gated pages show placeholder
 * shapes under the login pop-up, never the real page; no /api/data response succeeds; and
 * no gated string reaches any file the browser downloads. Runs against a local build with
 * the Clerk development keys, or against a deployed site with E2E_BASE_URL.
 */

/** The wall is only on when the build saw both Clerk keys, or when testing a deployed site. */
function wallOn(): boolean {
  if (process.env.E2E_BASE_URL) return true;
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) return true;
  const file = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return false;
  const env = fs.readFileSync(file, "utf8");
  return /^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\S+/m.test(env) && /^CLERK_SECRET_KEY=\S+/m.test(env);
}

test.skip(!wallOn(), "Clerk keys are not set (.env.local or env) and E2E_BASE_URL is not given, so the login wall is off and there is nothing to test.");

const GATED = ["/sectors/", "/traction/", "/funding/", "/explorer/", "/security/", "/investors/"];
const SHOTS = path.resolve(__dirname, "..", ".claude", "shots");
/** Gated strings: an investor that only the gated set names, and the Funding event detail that names it. */
const SENTINELS = ["Bankless Ventures", "founders of FanDuel", "bankless-ventures", "fortune.com"];
const FUNDING_EVENT = "2026-03-26-megapot-raises-5m-pre-seed";

type Watch = { errors: string[]; api: { url: string; status: number }[]; leaks: string[]; bodies: Promise<void>[] };

async function watch(page: Page): Promise<Watch> {
  const w: Watch = { errors: [], api: [], leaks: [], bodies: [] };
  page.on("console", (m) => m.type() === "error" && !/status of 401/.test(m.text()) && w.errors.push(m.text()));
  page.on("pageerror", (e) => w.errors.push(e.message));
  page.on("response", (r) => {
    const url = r.url();
    if (/\/api\/data\//.test(url)) w.api.push({ url, status: r.status() });
    w.bodies.push(
      r
        .body()
        .then((b) => {
          const text = b.toString("utf8");
          for (const s of SENTINELS) if (text.includes(s)) w.leaks.push(`${s} in ${url}`);
        })
        .catch(() => undefined),
    );
  });
  await page.route(/tradingview\.com/, (r) => r.fulfill({ body: "", contentType: "application/javascript" }));
  return w;
}

/** Nothing gated arrived: every /api/data call was refused and no body held a gated string. */
async function nothingGated(page: Page, w: Watch) {
  await page.waitForLoadState("networkidle");
  await Promise.all(w.bodies);
  expect(w.api.filter((a) => a.status < 400), "a gated API call succeeded").toEqual([]);
  expect(w.leaks, "a downloaded file holds a gated string").toEqual([]);
  expect(w.errors).toEqual([]);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Overview is public, the header offers Log in, and nothing gated downloads", async ({ page }, info) => {
  const w = await watch(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("login-dialog")).toHaveCount(0);
  await expect(page.getByTestId("header-login")).toBeVisible();
  await noOverflow(page);
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `auth-overview-${info.project.name}.png`) });
  await page.getByTestId("header-login").click();
  await expect(page.getByTestId("login-dialog")).toBeVisible();
  await nothingGated(page, w);
  // The gated API refuses a logged-out request outright.
  const res = await page.request.get("/api/data/gated/");
  expect(res.status()).toBe(401);
  expect(res.headers()["cache-control"]).toContain("private");
  expect(await res.text()).not.toContain("Bankless Ventures");
});

for (const route of GATED) {
  test(`${route} shows placeholders under the login pop-up and keeps the URL`, async ({ page }, info) => {
    const w = await watch(page);
    await page.goto(`${route}?q=uni`);
    await page.waitForLoadState("networkidle");
    const dialog = page.getByTestId("login-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Log in for free access" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Create free account" })).toBeVisible();
    await expect(page.getByTestId("login-wall").getByTestId("page-placeholder")).toBeVisible();
    await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, "\\/")}\\?q=uni`));
    if (route === "/funding/") await page.screenshot({ path: path.join(SHOTS, `auth-gated-funding-${info.project.name}.png`) });
    // Esc closes the pop-up; the placeholders stay with a way back in.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log in for free access" })).toBeVisible();
    await noOverflow(page);
    await nothingGated(page, w);
  });
}

test("Compare takes one project logged out, and a second one asks for login", async ({ page }, info) => {
  const w = await watch(page);
  await page.goto("/compare/?compare=uniswap");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("login-dialog")).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("Uniswap");
  await page.screenshot({ path: path.join(SHOTS, `auth-compare-${info.project.name}.png`) });
  await page.goto("/compare/?compare=uniswap&project=megapot");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("project-modal").getByRole("button", { name: "Add to compare" }).click();
  await expect(page.getByTestId("login-dialog")).toBeVisible();
  await expect(page).not.toHaveURL(/compare=[^&]*megapot/);
  await nothingGated(page, w);
});

test("a shared comparison of two projects waits behind the login pop-up", async ({ page }) => {
  const w = await watch(page);
  await page.goto("/compare/?compare=uniswap,megapot");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("login-dialog")).toBeVisible();
  await expect(page.getByTestId("login-wall").getByTestId("page-placeholder")).toBeVisible();
  await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
  await expect(page).toHaveURL(/compare=uniswap(%2C|,)megapot/);
  await noOverflow(page);
  await nothingGated(page, w);
});

test("a Funding event shows title, date and amount, and the detail asks for login", async ({ page }) => {
  const w = await watch(page);
  await page.goto(`/?event=${FUNDING_EVENT}`);
  const dialog = page.getByTestId("event-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Megapot raises $5M pre-seed");
  await expect(dialog.getByTestId("event-detail-login")).toBeVisible();
  // The source link is gated too: its URL names the lead investor.
  await expect(dialog.getByTestId("event-source-login")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /fortune\.com/ })).toHaveCount(0);
  await expect(dialog).not.toContainText(/bankless/i);
  await dialog.getByTestId("event-detail-login").click();
  await expect(page.getByTestId("login-dialog")).toBeVisible();
  await nothingGated(page, w);
});

test("a shared project link shows header, Overview and Traction, the rest behind one panel", async ({ page }) => {
  const w = await watch(page);
  await page.goto("/?project=uniswap");
  await page.waitForLoadState("networkidle");
  const modal = page.getByTestId("project-modal");
  await expect(modal.getByRole("heading", { name: "Uniswap" })).toBeVisible();
  await expect(modal).toContainText("Overview");
  await expect(modal).toContainText("Traction");
  await expect(modal.getByTestId("login-panel")).toHaveCount(1);
  for (const hidden of ["Financials", "Security facts", "Sources", "Similar projects"]) await expect(modal.getByRole("heading", { name: hidden })).toHaveCount(0);
  await nothingGated(page, w);
});
