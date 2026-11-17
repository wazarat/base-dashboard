import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const HAS_HISTORY = fs.existsSync(path.join(__dirname, "..", "data", "history", "_meta.json"));

/** The static export is built with .env.local, so read the same file to know whether the form buttons should exist. */
function envLocal(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const file = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return undefined;
  const m = fs.readFileSync(file, "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
  return m?.[1].trim() || undefined;
}

/** next-themes ignores the system scheme here (enableSystem is off), so the light projects set its stored choice before any script runs. */
test.beforeEach(async ({ page }, testInfo) => {
  // TradingView widgets load only inside the ticker drawer; answer them with an empty script so screenshots stay offline and quiet.
  await page.route("**/*.tradingview.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  if (testInfo.project.name.endsWith("-light")) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("theme", "light");
      } catch {}
    });
  }
});

const PAGES = [
  { path: "/", name: "overview" },
  { path: "/sectors/", name: "sectors" },
  { path: "/traction/", name: "traction" },
  { path: "/funding/", name: "funding" },
  { path: "/funding/?bt=VC-backed&bk=yes", name: "funding-backers-filtered" },
  { path: "/funding/?fv=rounds", name: "funding-rounds" },
  { path: "/funding/?mv=chart", name: "funding-flow-chart" },
  { path: "/funding/?mv=table", name: "funding-flow-table" },
  { path: "/funding/?fundingType=VC-backed", name: "funding-type-modal" },
  { path: "/explorer/?view=map", name: "explorer-map" },
  { path: "/explorer/?view=table&xtvl=1m&xhas=fees", name: "explorer-more-filters" },
  { path: "/traction/?br=7d&bz=true&bs=DEXs+%26+Liquidity", name: "traction-business-model-7d" },
  { path: "/sectors/?sectorDrawer=DEXs+%26+Liquidity", name: "sectors-modal" },
  { path: "/sectors/?sectorDrawer=Lending+%26+Credit", name: "sectors-modal-lending" },
  { path: "/sectors/?sectorDrawer=Wallets+%26+Custody", name: "sectors-modal-unmeasured" },
  { path: "/sectors/?project=morpho", name: "project-lending" },
  { path: "/sectors/?project=metamask", name: "project-unmeasured" },
  { path: "/sectors/?project=veranta-formerly-avantis", name: "project-perps" },
  { path: "/sectors/?project=steakhouse-financial", name: "project-yield" },
  { path: "/security/", name: "security" },
  { path: "/explorer/?view=table", name: "explorer" },
  { path: "/?sector=DEXs+%26+Liquidity&tm=volume&project=uniswap", name: "overview-filtered-drawer" },
  { path: "/explorer/?q=zzzz-no-match", name: "explorer-empty" },
  { path: "/?cr=all&ar=all&tm=fees&cm=fees", name: "overview-all-fees" },
  { path: "/?cr=7d&ar=7d&mr=7d", name: "overview-7d" },
  { path: "/traction/?mr=7d&mm=volume", name: "traction-7d-volume" },
  { path: "/?project=aerodrome-finance&hr=90d", name: "overview-drawer-history" },
  { path: "/traction/?nc=Base+native", name: "traction-native-only" },
  { path: "/investors/", name: "investors" },
  { path: "/investors/?investor=founders-fund", name: "investors-drawer" },
  { path: "/compare/", name: "compare-empty" },
  { path: "/compare/?compare=aerodrome-finance,uniswap,pancakeswap,curve&xr=90d&xm=volume", name: "compare-four" },
  { path: "/methodology/", name: "methodology" },
  { path: "/?expand=chain-over-time", name: "overview-expand" },
  { path: "/?sectorDrawer=DEXs+%26+Liquidity&sectorSub=Liquidity+management", name: "overview-subsector-drawer" },
  { path: "/?sector=Exchanges+%26+On%2FOff-Ramps", name: "overview-exchanges" },
  { path: "/?project=moonwell", name: "overview-drawer-security" },
  { path: "/compare/?compare=uniswap,morpho&align=days", name: "compare-cross-sector" },
];

for (const page of PAGES) {
  test(`screenshot ${page.name}`, async ({ page: p }, testInfo) => {
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await p.goto(page.path);
    await p.waitForLoadState("networkidle");
    // Give Recharts' ResponsiveContainer a frame to measure.
    await p.waitForTimeout(600);

    // No horizontal overflow on any viewport, and no cell whose text runs past its box.
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${page.name}`).toBeLessThanOrEqual(1);
    const overflowingCells = await p.evaluate(() => Array.from(document.querySelectorAll("td")).filter((td) => td.scrollWidth > td.clientWidth + 1).length);
    expect(overflowingCells, `overflowing table cells on ${page.name}`).toBe(0);

    // The design system has no badges, toggle groups, hover tooltips, global metric switcher or security-risk filter.
    expect(await p.locator("[data-slot=badge], [data-slot=toggle-group], [data-slot=tooltip-content]").count()).toBe(0);
    expect(await p.getByRole("radiogroup", { name: "Metric", exact: true }).count()).toBe(0);
    expect(await p.getByRole("combobox", { name: /Security risk/ }).count()).toBe(0);
    // Research notes and hand-written lines are admin-only (src/lib/notes.ts).
    expect(await p.locator("[data-admin-note]").count(), `admin note visible on ${page.name}`).toBe(0);

    // The live shell has taken over from the prerendered default view (src/components/layout/prerendered-shell.tsx).
    expect(await p.locator("[data-prerender]").count(), `prerendered view left behind on ${page.name}`).toBe(0);
    expect(await p.locator("main").count()).toBe(1);

    await p.screenshot({ path: `e2e/screenshots/${testInfo.project.name}-${page.name}.png`, fullPage: true });
    expect(errors, `console errors on ${page.name}`).toEqual([]);
  });
}

test("filters round-trip through the URL", async ({ page }) => {
  await page.goto("/explorer/?sector=Launchpads&chain=Base+native");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Showing\s+\d+\s+of 1038 projects/)).toBeVisible();
  const text = await page.getByText(/Showing\s+\d+\s+of 1038 projects/).textContent();
  expect(text).toMatch(/Showing\s+15\s+of 1038/);
});

test("each card has its own range, written to its own URL key", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // No global range control in the filter bar.
  await expect(page.getByRole("radiogroup", { name: "Date range", exact: true })).toHaveCount(0);
  const chain = page.locator("#chain-over-time");
  const activity = page.locator("#chain-activity");
  const chainRange = chain.getByRole("radiogroup", { name: "Chain over time date range" });
  await expect(chainRange.getByRole("radio", { name: "30d", exact: true })).toBeChecked();
  await expect(chain).toContainText("over 30d");
  // Cards stay uncluttered; the summary lives in the expanded view only.
  await expect(chain.getByTestId("takeaway")).toHaveCount(0);
  await chainRange.getByRole("radio", { name: "7d", exact: true }).click();
  await expect(page).toHaveURL(/cr=7d/);
  await expect(chain).toContainText("over 7d");
  // The neighbouring card keeps its own choice, and the filters are untouched.
  await expect(page).not.toHaveURL(/ar=/);
  await expect(activity.getByRole("radiogroup", { name: "Chain activity date range" }).getByRole("radio", { name: "30d", exact: true })).toBeChecked();
  await expect(page.getByText(/Showing\s+1038\s+of 1038 projects/)).toBeVisible();
  await chainRange.getByRole("radio", { name: "All", exact: true }).click();
  await expect(page).toHaveURL(/cr=all/);
  await expect(chain).toContainText("over all history");
  // Risers and fallers compare fixed windows, so they do not offer All.
  await expect(page.locator("#movers").getByRole("radio", { name: "All", exact: true })).toHaveCount(0);
});

test("overview tiles keep their text short and the range line sits under its chart", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/^Tracked for \d+ of 1038 projects, double-counted excluded$/).first()).toBeVisible();
  // Stablecoin supply arrives with the daily refresh (Milestone 2).
  if (HAS_HISTORY) await expect(page.getByText(/^Tracking \d+ coins?$/)).toBeVisible();
  await expect(page.getByText(/^Native TVL share \d+%$/)).toBeVisible();
  // Low, high and change read as a caption under the chart, never as a second title line.
  if (HAS_HISTORY) {
    const stats = page.locator("#chain-over-time").getByTestId("range-stats").first();
    await expect(stats).toHaveText(/^Low .+, high .+ over 30d$/);
    const below = await stats.evaluate((el) => {
      const svg = el.parentElement?.querySelector("svg.recharts-surface");
      return svg ? el.getBoundingClientRect().top >= svg.getBoundingClientRect().bottom - 1 : false;
    });
    expect(below).toBe(true);
  }
  if (testInfo.project.name.startsWith("desktop")) {
    // Reset and Copy link sit under the project count at the right edge of the filter bar.
    const count = await page.getByText(/Showing\s+1038\s+of 1038 projects/).first().boundingBox();
    const copy = await page.getByRole("button", { name: "Copy link to this view" }).boundingBox();
    const reset = await page.getByRole("button", { name: "Reset", exact: true }).boundingBox();
    expect(copy!.y).toBeGreaterThanOrEqual(count!.y + count!.height - 1);
    expect(reset!.y).toBeGreaterThanOrEqual(count!.y + count!.height - 1);
    expect(Math.abs(copy!.x + copy!.width - (count!.x + count!.width))).toBeLessThan(2);
  }
});

test("a lending pop-up shows deposited, borrowed and TVL side by side, revenue as zero by design and no DEX volume", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  await page.goto("/sectors/?project=morpho");
  await page.waitForLoadState("networkidle");
  const modal = page.getByTestId("project-modal");
  const trio = modal.getByTestId("metric-trio");
  await expect(trio.locator("[data-metric]")).toHaveCount(3);
  await expect(trio).toContainText("Total deposited");
  await expect(trio).toContainText("Borrowed");
  await expect(trio).toContainText("TVL");
  await expect(trio).toContainText("Collateral plus lending supply");
  await expect(modal.locator("[data-metric=utilization]")).toHaveText(/^\d+%/);
  await expect(modal.locator("[data-metric=revenue][data-state=zero-by-design]").first()).toContainText("$0 by design");
  await expect(modal).not.toContainText("30d DEX volume");
  await expect(modal).toContainText(/Figures as of/);
  // Every number carries its definition.
  await modal.getByRole("button", { name: "About Total deposited" }).click();
  await expect(page.locator("[data-slot=info-tip]")).toContainText("collateral plus lending supply");
});

test("a project in an unmeasured sector shows no Traction heading and a tier of Not applicable", async ({ page }) => {
  await page.goto("/sectors/?project=metamask");
  await page.waitForLoadState("networkidle");
  const modal = page.getByTestId("project-modal");
  await expect(modal.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(modal.getByRole("heading", { name: "Traction", exact: true })).toHaveCount(0);
  await expect(modal).toContainText("Not applicable");
  await expect(modal).not.toContainText("TBD");
  // Facts still show where the data has them.
  await page.goto("/sectors/?project=base-app");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("project-modal").locator("[data-metric=feesFact]")).toHaveText(/^\$[\d,]+/);
  // And unmeasured sectors stay off the traction leaderboard and the tier chart.
  await page.goto("/traction/?sector=Wallets+%26+Custody");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("No projects with traction data in this selection.")).toBeVisible();
});

test("the newer sources reach the pop-ups and the Security page", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  // Open interest is the perps headline, with its definition, and paid-only volume reads Not tracked.
  await page.goto("/sectors/?project=veranta-formerly-avantis");
  await page.waitForLoadState("networkidle");
  const modal = page.getByTestId("project-modal");
  await expect(modal.locator("[data-metric=openInterest][data-state=value]")).toHaveText(/^\$[\d,]+/);
  await expect(modal.locator("[data-metric=perpsVolume][data-state=not-tracked]")).toContainText("Not tracked");
  // A vault curator's assets are flagged as double counted.
  await page.goto("/sectors/?project=steakhouse-financial");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("project-modal").locator("[data-metric=vaultAssets]")).toContainText("double counted");
  // Incidents stay at chain level, on the Security page only.
  await page.goto("/security/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#chain-incidents")).toContainText("Incidents recorded for the chain");
  await page.goto("/sectors/?project=uncx-unicrypt");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("project-modal")).not.toContainText("Incidents recorded for the chain");
});

test("sector leaders rank by the headline metric and show it on each row", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  await page.goto("/sectors/");
  await page.waitForLoadState("networkidle");
  const lending = page.getByTestId("sector-card").filter({ hasText: "Lending & Credit" });
  const first = lending.getByTestId("sector-card-leaders").locator("li").first();
  await expect(first).toContainText("Morpho");
  await expect(first).toContainText(/\$[\d.]+B deposited/);
  // An unmeasured sector shows the role in place of a figure.
  const wallets = page.getByTestId("sector-card").filter({ hasText: "Wallets & Custody" });
  await expect(wallets.getByTestId("sector-card-leaders").locator("li").first()).toContainText("Wallets");
  await expect(wallets.getByTestId("sector-card-leaders")).not.toContainText("$");
  await lending.getByRole("button", { name: "Lending & Credit" }).click();
  const modal = page.getByTestId("sector-modal");
  await expect(modal).toContainText("Ranked by deposited");
  await expect(modal.getByTestId("sector-leaders").locator("li").first()).toContainText("Morpho");
  await expect(modal.getByTestId("sector-leaders").locator("li").first()).toContainText("deposited");
});

test("sector cards show two stats and three leaders with no blank band", async ({ page }) => {
  await page.goto("/sectors/");
  await page.waitForLoadState("networkidle");
  const cards = page.getByTestId("sector-card");
  await expect(cards).toHaveCount(22);
  await expect(page.getByText("With traction")).toHaveCount(0);
  await expect(page.getByText(/Mostly offchain services/)).toHaveCount(0);
  const first = cards.first();
  await expect(first.locator("dt")).toHaveText(["Projects", "Base native"]);
  await expect(first.locator("dd").nth(1)).toHaveText(/^\d+ \(\d+%\)$/);
  await expect(first.getByTestId("sector-card-leaders").getByRole("button")).toHaveCount(3);
  // The stats start right under the title on every card.
  const gaps = await cards.evaluateAll((els) => els.map((el) => el.querySelector("dl")!.getBoundingClientRect().top - el.querySelector("button")!.getBoundingClientRect().bottom));
  expect(Math.max(...gaps)).toBeLessThan(20);
  // A leader opens its project, the title opens the ranked leaders.
  await first.getByTestId("sector-card-leaders").getByRole("button").first().click();
  await expect(page).toHaveURL(/project=/);
  await page.keyboard.press("Escape");
  await first.getByRole("button").first().click();
  await expect(page).toHaveURL(/sectorDrawer=/);
});

test("the explorer opens on the map, with the table one click away", async ({ page }, testInfo) => {
  await page.goto("/explorer/");
  await page.waitForLoadState("networkidle");
  const view = page.getByRole("tablist", { name: "Explorer view" });
  await expect(view.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-tile-kind=sector]").first()).toBeVisible();
  // The map inside the Explorer has no table switch of its own; the Overview copy keeps it.
  await expect(page.locator("#explorer-map").getByRole("tablist", { name: "View as" })).toHaveCount(0);
  // The Explorer card keeps its top padding in both views.
  const pad = () => page.getByRole("heading", { name: "Explorer", exact: true }).evaluate((h) => h.getBoundingClientRect().top - h.closest("[data-slot=card]")!.getBoundingClientRect().top);
  const mapPad = await pad();
  expect(mapPad).toBeGreaterThanOrEqual(16);
  if (testInfo.project.name.startsWith("desktop")) {
    // More filters shares the search row, at its right end.
    const search = await page.getByTestId("explorer-search").boundingBox();
    const more = await page.getByTestId("more-filters").boundingBox();
    expect(Math.abs(more!.y + more!.height / 2 - (search!.y + search!.height / 2))).toBeLessThan(6);
    expect(more!.x).toBeGreaterThan(search!.x + search!.width);
  }
  await view.getByRole("tab", { name: "Table" }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page.getByRole("columnheader", { name: /TVL/ }).first()).toBeVisible();
  expect(await pad()).toBe(mapPad);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#sectors-treemap").getByRole("tablist", { name: "View as" })).toHaveCount(1);
});

test("chart cards offer a table view", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const card = page.locator("#chain-over-time, [data-slot=card]").filter({ hasText: "Chain over time" }).first();
  await card.getByRole("tab", { name: "Table" }).click();
  await expect(card.getByRole("columnheader", { name: "DEX volume" })).toBeVisible();
});

test("project modal adds to compare and the tray persists across navigation", async ({ page }) => {
  await page.goto("/?project=uniswap");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add to compare" }).click();
  await expect(page).toHaveURL(/compare=uniswap/);
  await expect(page.getByTestId("compare-tray")).toContainText("Uniswap");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Traction" }).click();
  await expect(page).toHaveURL(/traction\/.*compare=uniswap/);
  await expect(page.getByTestId("compare-tray")).toContainText("Uniswap");
});

test("presets live on the compare page only and open at least two projects", async ({ page }) => {
  await page.goto("/traction/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "DEXs" })).toHaveCount(0);
  await page.goto("/compare/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "DEXs" }).first().click();
  await expect(page).toHaveURL(/\/compare\/\?compare=[^&]+,[^&]+/);
  await expect(page.getByText("Metrics, with rank and share in sector")).toBeVisible();
});

test("form buttons follow the Tally configuration", async ({ page }) => {
  await page.goto("/explorer/?project=uniswap");
  await page.waitForLoadState("networkidle");
  const configured = Boolean(envLocal("NEXT_PUBLIC_TALLY_SUBMIT_URL"));
  expect((await page.getByTestId("submit-project").count()) > 0).toBe(configured);
  if (configured) {
    await expect(page.getByTestId("submit-project").first()).toHaveAttribute("href", envLocal("NEXT_PUBLIC_TALLY_SUBMIT_URL") as string);
    await expect(page.getByTestId("suggest-correction")).toBeVisible();
  }
});

test("header and footer carry the product frame", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("banner")).toContainText("CanHav Research");
  await expect(page.getByRole("banner")).toContainText("Base Ecosystem Atlas");
  await expect(page.getByRole("contentinfo")).toContainText(/Data as of/);
  await expect(page.getByRole("contentinfo")).toContainText("Research preview, not financial advice.");
});

test("project modal labels are plain text and the modal is centred, closing on Escape", async ({ page }, testInfo) => {
  await page.goto("/?project=uniswap");
  await page.waitForLoadState("networkidle");
  const modal = page.getByTestId("project-modal");
  await expect(modal).toContainText(/DEXs & Liquidity, (Base native|Arbitrum native|Other EVM|Other non-EVM)/);
  await expect(modal).toContainText(/Tier 1 - Leader/);
  const box = await modal.boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  if (box && testInfo.project.name.startsWith("desktop")) expect(Math.abs(box.x + box.width / 2 - vw / 2)).toBeLessThan(2);
  if (box && testInfo.project.name.startsWith("phone")) expect(Math.round(box.width)).toBe(vw);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/project=/);
});

test("light theme paints the flat canvas", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("-light"), "light projects only");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(245, 245, 247)");
});

test("long table text clamps and expands", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("desktop"), "phone projects only");
  await page.goto("/security/");
  await page.waitForLoadState("networkidle");
  const more = page.getByRole("button", { name: "Show more" }).first();
  if ((await more.count()) === 0) return;
  await more.click();
  await expect(page.getByRole("button", { name: "Show less" }).first()).toBeVisible();
});

test("the expand dialog opens from the URL and Escape clears it", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  await page.goto("/?expand=chain-over-time");
  await page.waitForLoadState("networkidle");
  const dialog = page.getByTestId("chart-expand");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Chain over time");
  // The summary sits at the bottom, after the charts, as one row per metric over 7d, 30d and 90d.
  const summary = dialog.getByTestId("takeaway-table");
  await expect(summary.getByRole("columnheader")).toHaveText(["Metric", "7d", "30d", "90d"]);
  await expect(summary.getByRole("rowheader")).toHaveText(["Chain TVL change", "Daily DEX volume, average", "Daily fees, average", "Daily revenue, average"]);
  // The chart area scrolls on a phone, so compare document order rather than pixels.
  const after = await dialog.evaluate((d) => {
    const chart = Array.from(d.querySelectorAll("*")).find((e) => e.textContent === "Daily revenue");
    const take = d.querySelector("[data-testid=takeaway]");
    return Boolean(chart && take && chart.compareDocumentPosition(take) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(after).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/expand=/);
});

test("the Expand button stores the chart in the URL", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Expand Sectors by projects" }).click();
  await expect(page).toHaveURL(/expand=sectors-treemap/);
  await expect(page.getByTestId("chart-expand")).toBeVisible();
});

test("with a filter on, shares compare against the selection", async ({ page }) => {
  await page.goto("/?chain=Base+native");
  await page.waitForLoadState("networkidle");
  const card = page.locator("#concentration");
  await expect(card.getByRole("heading", { name: "Share of selection TVL" })).toBeVisible();
  // The rest of the selection, not the rest of the chain, sits in the last bar.
  await expect(card).not.toContainText(/All other projects\s*9\d%/);
  await expect(card.getByTestId("takeaway")).toHaveCount(0);
});

test("the sector pop-up follows the filters", async ({ page }) => {
  await page.goto("/sectors/?chain=Base+native&sectorDrawer=DEXs+%26+Liquidity");
  await page.waitForLoadState("networkidle");
  const modal = page.getByTestId("sector-modal");
  await expect(modal).toContainText(/Filtered, 1 filter active/);
  await expect(modal).not.toContainText("Uniswap");
});

test("a treemap sector tile opens the sector pop-up", async ({ page }) => {
  await page.goto("/explorer/?view=map");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("navigation", { name: "Treemap level" })).toHaveCount(0);
  const tile = page.locator("[data-tile-kind=sector]").first();
  const sector = ((await tile.getAttribute("aria-label")) ?? "").replace("Open ", "");
  await tile.click();
  await openPreviewOnTouch(page);
  await expect(page).toHaveURL(/sectorDrawer=/);
  await expect(page).not.toHaveURL(/tz=/);
  const modal = page.getByTestId("sector-modal");
  await expect(modal.getByRole("heading", { name: sector, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/sectorDrawer=/);
});

/** On touch screens the first tap on a tile shows its details with an Open button; Open acts. */
async function openPreviewOnTouch(page: import("@playwright/test").Page) {
  const preview = page.getByTestId("treemap-preview");
  if (await preview.isVisible().catch(() => false)) await preview.getByRole("button", { name: "Open" }).click();
}

test("the sector pop-up narrows to a subcategory and widens back", async ({ page }) => {
  await page.goto("/?sectorDrawer=DEXs+%26+Liquidity&sectorSub=Liquidity+management");
  await page.waitForLoadState("networkidle");
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "DEXs & Liquidity, Liquidity management" })).toBeVisible();
  await drawer.getByRole("button", { name: "Show all of DEXs & Liquidity" }).click();
  await expect(page).not.toHaveURL(/sectorSub=/);
  await expect(drawer.getByRole("heading", { name: "DEXs & Liquidity", exact: true })).toBeVisible();
});

test("the Stablecoins pop-up shows each issuer's supply on the chain with its sources", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  await page.goto("/sectors/?sectorDrawer=Stablecoins+%26+Payments");
  await page.waitForLoadState("networkidle");
  const modal = page.getByTestId("sector-modal");
  await expect(modal).toContainText("with traction");
  const line = modal.getByTestId("onchain-lines").first();
  await expect(line).toContainText(/USDC on the chain \$\d/);
  await expect(line.getByRole("link", { name: "DefiLlama" })).toBeVisible();
});

test("Overview shows stablecoin supply as its own KPI", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const card = page.locator("[data-slot=card]").filter({ hasText: "Stablecoin supply" }).first();
  await expect(card).toContainText(/\$\d/);
});

test("a sector with no tracked volume reads Not tracked", async ({ page }) => {
  await page.goto("/?sector=Security%252C+Risk+%26+Compliance");
  await page.waitForLoadState("networkidle");
  const card = page.locator("[data-slot=card]").filter({ hasText: "30d DEX volume" }).first();
  await expect(card).toContainText("Not tracked");
  await expect(card).toContainText("Tracked for 0 of 28 projects, double-counted excluded");
});

test("the timeline opens as a table and a row opens the event popup", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const card = page.locator("#timeline");
  await expect(card.getByRole("tab", { name: "Table" })).toHaveAttribute("aria-selected", "true");
  await expect(card.getByRole("columnheader")).toHaveText(["Date", "Type", "Event", "Projects"]);
  await card.getByRole("button", { name: "Moonwell MAMO market exploited through collateral price manipulation" }).click();
  await expect(page).toHaveURL(/event=2026-08-27-/);
  const popup = page.getByTestId("event-dialog");
  await expect(popup).toContainText("$8,700,000");
  await expect(popup.getByRole("link", { name: /theblock\.co/ })).toHaveAttribute("href", /^https:\/\/theblock\.co\/news\/defi\//);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(page).not.toHaveURL(/event=/);
});

test("every event popup offers a direct source, never a bare profile", async ({ page }) => {
  await page.goto("/?event=2026-06-25-invalid-block-halts-base-for-116-minutes");
  const popup = page.getByTestId("event-dialog");
  await expect(popup).toContainText("Invalid block halts Base for 116 minutes");
  await expect(popup).not.toContainText("No direct source yet");
  await expect(popup.getByRole("link", { name: /cointelegraph\.com/ })).toHaveAttribute("href", /^https:\/\/cointelegraph\.com\/news\//);
  await page.keyboard.press("Escape");
  // No link anywhere on the page points at a bare profile.
  await expect(page.locator('a[href="https://x.com/RobinHubHB"]')).toHaveCount(0);
  // An id that matches no event opens nothing.
  await page.goto("/?event=2026-06-25-no-such-event");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("event-dialog")).toHaveCount(0);
});

test("the timeline chart hides events before 2025 behind one marker", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const card = page.locator("#timeline");
  await card.getByRole("tab", { name: "Chart" }).click();
  await expect(card.getByText("Before 2025").first()).toBeVisible();
  await card.getByRole("button", { name: /Show earlier events/ }).click();
  await expect(card.getByRole("button", { name: "Hide earlier events" })).toBeVisible();
});

test("the security page shows aggregates, not ratings", async ({ page }) => {
  await page.goto("/security/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("High and Medium risk projects")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Risk", exact: true })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "What happened" })).toBeVisible();
  await expect(page.getByText("Red flags by type")).toBeVisible();
});

test("the funding donut counts only disclosed projects and a type opens its modal", async ({ page }) => {
  await page.goto("/funding/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("funding-line")).toHaveCount(0);
  await expect(page.getByText("disclosed", { exact: true })).toBeVisible();
  const legend = page.getByTestId("funding-legend");
  await legend.getByRole("button", { name: /VC-backed/ }).click();
  await expect(page).toHaveURL(/fundingType=VC-backed/);
  const modal = page.getByTestId("funding-type-modal");
  await expect(modal.getByRole("heading", { name: "VC-backed" })).toBeVisible();
  await expect(modal).toContainText("Top backers");
  // Opening a type never filters the page on its own.
  await expect(page).not.toHaveURL(/funding=/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/fundingType=/);
  // Deep link, then the secondary button applies the old facet filter.
  await page.goto("/funding/?fundingType=Acquired");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("funding-type-modal")).toBeVisible();
  await page.getByRole("button", { name: "Filter the atlas to this type" }).click();
  await expect(page).toHaveURL(/funding=Acquired/);
  await expect(page).not.toHaveURL(/fundingType=/);
});

test("the money flow filter shows counts, sorts newest first and has an empty state", async ({ page }) => {
  await page.goto("/funding/");
  await page.waitForLoadState("networkidle");
  const filter = page.getByRole("radiogroup", { name: "Money flow type" });
  await expect(filter.getByRole("radio", { name: /^All \d+$/ })).toBeChecked();
  await filter.getByRole("radio", { name: /^Base Ecosystem Fund \d+$/ }).click();
  await expect(page).toHaveURL(/mf=Base\+Ecosystem\+Fund/);
  await expect(page.getByTestId("money-flow")).toContainText("Base Ecosystem Fund");
  // Chart and Table show disclosed funding by quarter in the same box, and the type filter steps aside.
  const mode = page.getByRole("tablist", { name: "Money flow view" });
  await mode.getByRole("tab", { name: "Chart" }).click();
  await expect(page).toHaveURL(/mv=chart/);
  await expect(page.getByTestId("rounds-quarter-chart")).toBeVisible();
  await expect(filter).toHaveCount(0);
  await mode.getByRole("tab", { name: "Table" }).click();
  await expect(page.getByTestId("funding-by-quarter").getByRole("columnheader").first()).toHaveText("Quarter");
  // The funding type card no longer offers a table view; its legend already carries the counts.
  await expect(page.locator("#funding-type").getByRole("tablist", { name: "View as" })).toHaveCount(0);
});

test("a link with backers filters and no view opens on the backers table", async ({ page }) => {
  await page.goto("/funding/?bt=VC-backed&bk=yes");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("backers-table")).toBeVisible();
  await expect(page).toHaveURL(/fv=backers/);
  // Clearing the filters keeps the reader on the table.
  await page.getByTestId("backers-table").getByRole("button", { name: "Reset" }).click();
  await expect(page).not.toHaveURL(/bk=/);
  await expect(page.getByTestId("backers-table")).toBeVisible();
});

test("the leaderboard shows five columns and a row opens the side bar", async ({ page }) => {
  await page.goto("/traction/");
  await page.waitForLoadState("networkidle");
  const board = page.locator("[data-slot=card]").filter({ has: page.getByRole("heading", { name: "Leaderboard", exact: true }) });
  await expect(board.getByRole("columnheader")).toHaveText(["Project", "Sector", "Native chain", "Tier", "TVL"]);
  await expect(board.getByRole("radiogroup")).toHaveCount(0);
  await board.locator("tbody tr").first().click();
  await expect(page).toHaveURL(/project=/);
  const drawer = page.getByRole("dialog");
  // The pop-up shows the rows of the project's own sector (docs/SECTOR-METRICS.md), each with its definition.
  await expect(drawer).toContainText("30d fees");
  await expect(drawer.getByRole("heading", { name: "Traction", exact: true })).toBeVisible();
  await expect(drawer.locator("[data-metric]").first()).toBeVisible();
});

test("the business model chart can show one native-chain type", async ({ page }) => {
  test.skip(!HAS_HISTORY, "needs the daily history from Milestone 2");
  await page.goto("/traction/");
  await page.waitForLoadState("networkidle");
  const card = page.locator("#business-model");
  await expect(card.locator("[data-chain]")).toHaveCount(4);
  await card.getByRole("combobox", { name: /Native chain/ }).click();
  await page.getByRole("option", { name: /Base native/ }).click();
  await expect(page).toHaveURL(/nc=Base/);
  await expect(card.locator("[data-chain]")).toHaveCount(1);
  await expect(card.locator("[data-chain]")).toHaveText("Base native");
});

test("the backers table has no count in its title, one word for blanks, and its own filters", async ({ page }) => {
  // The box opens on money flow; the rounds and backers tables are one click away, with no scrolling.
  await page.goto("/funding/");
  await page.waitForLoadState("networkidle");
  const box = page.getByTestId("funding-box");
  const views = box.getByRole("tablist", { name: "Funding data" });
  await expect(box.getByRole("heading", { name: "Base ecosystem money flow", exact: true })).toBeVisible();
  await views.getByRole("tab", { name: "Rounds" }).click();
  await expect(page).toHaveURL(/fv=rounds/);
  await expect(box.getByRole("heading", { name: "Funding rounds", exact: true })).toBeVisible();
  await views.getByRole("tab", { name: "Backers" }).click();
  await expect(page).toHaveURL(/fv=backers/);
  await expect(page.getByRole("heading", { name: "Disclosed backers per project", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Token-funded projects", exact: true })).toHaveCount(0);
  const table = page.getByTestId("backers-table");
  await expect(table.getByRole("columnheader")).toHaveText([/Project/, /Type/, /Investors/, /Amount raised/]);
  // No cell repeats the raw placeholder text from the source file.
  for (const raw of ["None", "Unknown", "None confirmed", "N/A"]) await expect(table.getByRole("cell", { name: raw, exact: true })).toHaveCount(0);
  const all = await table.getByText(/Showing\s+\d+\s+of \d+ projects/).innerText();
  await table.getByRole("radiogroup", { name: "Has token" }).getByRole("radio", { name: "Yes" }).click();
  await expect(page).toHaveURL(/bk=yes/);
  expect(await table.getByText(/Showing\s+\d+\s+of \d+ projects/).innerText()).not.toBe(all);
  await table.getByRole("button", { name: "Reset" }).click();
  await expect(page).not.toHaveURL(/bk=/);
  await table.getByRole("searchbox", { name: "Search backers" }).fill("zzzz-no-match");
  await expect(table).toContainText("No project matches these filters.");
});

test("research notes and the discovery source stay out of the public page", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/Morpho and Steakhouse/)).toHaveCount(0);
  await expect(page.getByText("Analyst notes")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Live insights" })).toBeVisible();
  await page.goto("/?project=uniswap");
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("Native chain");
  await expect(drawer).not.toContainText("Discovered via");
  await expect(drawer).not.toContainText("Discovery source");
  await page.goto("/traction/");
  await expect(page.locator("#business-model")).not.toContainText("Uniswap keeps");
  await expect(page.getByText(/projects show transactions on their tracked contracts/)).toHaveCount(0);
});

test.describe("the export without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  const DEFAULT_VIEWS = [
    { path: "/", heading: "Chain over time", text: /Showing\s+1038\s+of 1038 projects/ },
    { path: "/methodology/", heading: "Methodology", text: /Coverage terms/ },
  ];
  for (const view of DEFAULT_VIEWS) {
    test(`${view.path} carries its default view`, async ({ page }) => {
      await page.goto(view.path);
      await expect(page.getByRole("heading", { name: view.heading, exact: true }).first()).toBeVisible();
      await expect(page.getByText(view.text).first()).toBeVisible();
    });
  }
  // Login wall phase 2: a gated page's HTML holds placeholder shapes only, never its data.
  for (const path of ["/security/", "/explorer/", "/funding/"]) {
    test(`${path} carries placeholders, not data`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId("page-placeholder")).toBeVisible();
      await expect(page.getByRole("main").getByRole("table")).toHaveCount(0);
    });
  }
});

test("a link with a query string never paints the default view", async ({ page }) => {
  // Hold the scripts back so the page stays exactly as exported, which is what the first paint shows.
  await page.route("**/*.js", (route) => route.abort());
  const count = page.getByText(/Showing\s+1038\s+of 1038 projects/);
  await page.goto("/explorer/?q=zzzz-no-match");
  await expect(count).toHaveCount(1);
  await expect(count).toBeHidden();
  await page.goto("/explorer/");
  await expect(count).toBeVisible();
});

test("security and investors are hidden from the nav but still load by link", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("banner").getByRole("navigation");
  await expect(nav.getByRole("link")).toHaveText(["Overview", "Sectors", "Traction", "Funding", "Explorer", "Compare"]);
  await page.goto("/investors/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("main")).toBeVisible();
});

test("the explorer search shares q with the filter bar and More filters read as one line", async ({ page }) => {
  await page.goto("/explorer/");
  await page.waitForLoadState("networkidle");
  const search = page.getByTestId("explorer-search");
  await search.fill("pantera");
  await expect(page).toHaveURL(/q=pantera/);
  await expect(page.getByRole("searchbox", { name: "Search projects", exact: true })).toHaveValue("pantera");
  await expect(page.getByTestId("explorer-count")).toContainText(/\d+ projects?/);
  await page.goto("/explorer/?xsub=AMM+DEXs&xtvl=1m");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("more-filters-summary")).toHaveText("Filtered by Subcategory AMM DEXs, Minimum TVL $1M+");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).not.toHaveURL(/xsub=|xtvl=/);
});

test("on a phone, tapping a treemap tile previews it with an Open button", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("phone"), "touch only");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator("[data-tile-kind=sector]").first().click();
  const preview = page.getByTestId("treemap-preview");
  await expect(preview).toBeVisible();
  await expect(page).not.toHaveURL(/sectorDrawer=/);
  await preview.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/sectorDrawer=/);
});
