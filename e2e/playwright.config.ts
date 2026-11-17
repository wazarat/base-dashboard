import { defineConfig } from "@playwright/test";
import path from "node:path";

/**
 * Screenshots every page of a production build at desktop and phone widths, with the
 * login wall off (Clerk keys blanked even if .env.local has them), so the whole UI is
 * covered. The web server rebuilds .next for that, so run the two suites one at a time;
 * the logged-out suite lives in playwright.auth.config.ts.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /screenshots\.spec\.ts/,
  outputDir: "./test-results",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3271",
    colorScheme: "dark",
  },
  webServer: {
    command: "sh -c 'export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY=; npx next build >/dev/null && npx next start -H 127.0.0.1 -p 3271'",
    cwd: path.resolve(__dirname, ".."),
    stdout: "ignore",
    stderr: "pipe",
    url: "http://127.0.0.1:3271",
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "desktop-light", use: { viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "phone-light", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" } },
  ],
});
