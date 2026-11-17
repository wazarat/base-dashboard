import { defineConfig } from "@playwright/test";
import path from "node:path";

/**
 * The login wall, logged out at desktop and phone widths, and signed in (login wall
 * phase 2). Needs the Clerk development keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
 * CLERK_SECRET_KEY) in the environment or .env.local; without them the tests skip with
 * a message. The web server rebuilds .next with the wall on, so run this suite and the
 * main one (`npm run screenshots`) one at a time. E2E_BASE_URL runs the logged-out tests
 * against a deployed site instead of a local build.
 *
 *   npm run screenshots:auth
 */
const remote = process.env.E2E_BASE_URL;
/**
 * localhost, not 127.0.0.1, and next start on every interface: with the Clerk keys set, Clerk's proxy rewrites
 * each request to http://localhost:<port>/. When the server listened on 127.0.0.1 only, Next treated that as
 * another origin and proxied it to ::1, where nothing listened, so every page hung (E2E run #3).
 */
const LOCAL = "http://localhost:3272";

export default defineConfig({
  testDir: ".",
  outputDir: "./test-results-auth",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: remote ?? LOCAL, colorScheme: "dark" },
  webServer: remote
    ? undefined
    : {
        command: "sh -c 'npx next build >/dev/null && npx next start -p 3272'",
        cwd: path.resolve(__dirname, ".."),
        stdout: "ignore",
        stderr: "pipe",
        url: LOCAL,
        reuseExistingServer: false,
        timeout: 300_000,
      },
  projects: [
    { name: "logged-out-desktop", testMatch: /auth\.spec\.ts/, use: { viewport: { width: 1440, height: 900 } } },
    { name: "logged-out-phone", testMatch: /auth\.spec\.ts/, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "clerk-setup", testMatch: /clerk\.setup\.ts/ },
    { name: "logged-in", testMatch: /logged-in\.spec\.ts/, dependencies: ["clerk-setup"], use: { viewport: { width: 1440, height: 900 } } },
  ],
});
