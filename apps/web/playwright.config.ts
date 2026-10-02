import { defineConfig, devices } from "@playwright/test";
import { FAKE_CAMERA } from "./e2e/fake-camera";

// E2E_URL points the tests at an already-running server (for example `npm run dev`);
// otherwise they run against the production build served by `vite preview`.
const external = process.env.E2E_URL;
// PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's own download.
const channel = process.env.PW_CHANNEL;
const url = external ?? "http://localhost:4180";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: url,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        ...(channel ? { channel } : {}),
        // A synthetic webcam showing the printed marker, for Probe Cam.
        permissions: ["camera"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-video-capture=${FAKE_CAMERA}`,
          ],
        },
      },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: "npx vite preview --port 4180 --strictPort",
        url,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
