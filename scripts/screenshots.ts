// Captures the README screenshots from a running app (default: the dev server).
// Usage: npm run dev, then `npm run screenshots [-- url]`.
// PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's own.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import writeFakeCamera, { FAKE_CAMERA } from "../apps/web/e2e/fake-camera";

const url = process.argv[2] ?? "http://localhost:5180";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "docs", "images");
mkdirSync(out, { recursive: true });

/** Store actions to run once the case has loaded, by name. */
type Setup = Record<string, unknown>;

async function ready(page: Page, setup: Setup = {}): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => {
    const store = (window as unknown as { __insonate?: { getState(): { stats: { ms: number } } } }).__insonate;
    return (store?.getState().stats.ms ?? 0) > 0;
  });
  await page.evaluate((actions) => {
    const state = (window as unknown as { __insonate: { getState(): Record<string, (value: unknown) => void> } }).__insonate.getState();
    for (const [name, value] of Object.entries(actions)) state[name](value);
  }, setup);
  // Let the image settle (persistence) and the 3D view finish loading.
  await page.waitForTimeout(1200);
}

// A synthetic webcam showing the printed marker, for the Probe Cam shot.
writeFakeCamera();
const browser = await chromium.launch({
  ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${FAKE_CAMERA}`],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, permissions: ["camera"] });
// The welcome card is for first visits; the screenshots show the app in use.
await context.addInitScript(() => localStorage.setItem("insonate:welcomed", "1"));
const page = await context.newPage();

await ready(page, { setLabels: true });
await page.screenshot({ path: join(out, "free-scan.png") });
console.log("wrote free-scan.png");

await ready(page);
await page.getByRole("tab", { name: "Guided tasks" }).click();
await page.getByRole("button", { name: /Right kidney: long axis/i }).click();
await page.getByRole("button", { name: "Show me" }).click();
await page.getByText("View achieved").waitFor();
await page.screenshot({ path: join(out, "guided-task.png") });
console.log("wrote guided-task.png");

await ready(page, { setAnatomy: true });
await page.getByRole("button", { name: "Scan plane" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, "anatomy.png") });
console.log("wrote anatomy.png");

await ready(page, { setLanguage: "ar", setAnatomy: true });
await page.screenshot({ path: join(out, "arabic.png") });
console.log("wrote arabic.png");
await page.evaluate(() =>
  (window as unknown as { __insonate: { getState(): { setLanguage(language: string): void } } }).__insonate.getState().setLanguage("en"),
);

// Spectral Doppler in the aorta: longitudinal, heel–toe toward the head, the gate in the lumen
// (a pose where the aorta lies in the plane at under 60° to the beam).
await page.setViewportSize({ width: 1440, height: 1100 });
await ready(page, {
  setBreathing: "expire",
  setPose: { phiDeg: 0, zMm: 70, rotationDeg: -12, tiltDeg: -10, rockDeg: -14 },
  setSettings: { depthMm: 160, focusMm: 120, doppler: "pw", scaleCmS: 100, gate: { a: -6.8, d: 123.6, lengthMm: 3 } },
});
const align = page.getByRole("button", { name: "Align with the vessel" });
await page.waitForTimeout(600);
if (await align.count()) await align.click();
await page.waitForTimeout(4500);
await page.screenshot({ path: join(out, "doppler.png") });
console.log("wrote doppler.png");

// A teaching case: gallstones, with Anatomy mode outlining the stones.
await page.setViewportSize({ width: 1440, height: 900 });
await ready(page, { setSettings: { doppler: "off" } });
await page.getByRole("tab", { name: "Cases" }).click();
await page.getByRole("button", { name: /^1 Gallstones/ }).click();
await page.getByRole("button", { name: "Show me the finding" }).waitFor();
await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".case button.btn")?.disabled);
await page.getByRole("button", { name: "Show me the finding" }).click();
await page.keyboard.press("n");
await page.waitForTimeout(2600);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: join(out, "cases.png") });
console.log("wrote cases.png");
await page.getByRole("button", { name: "← All cases" }).click();

// The reporting exam, handed in: exam 60 is level 1, acute cholecystitis in the man of 67.
await page.setViewportSize({ width: 1440, height: 1100 });
await page.goto(`${url}#exam=60`);
await page.waitForFunction(() => {
  const store = (window as unknown as { __insonate?: { getState(): { exam: { made: unknown } | null; stats: { ms: number } } } })
    .__insonate;
  return Boolean(store?.getState().exam?.made) && (store?.getState().stats.ms ?? 0) > 0;
});
await page.getByLabel("Findings").selectOption("cholecystitis");
await page.getByLabel("Largest stone / polyp").fill("16");
await page.getByLabel("Wall thickness").fill("9");
await page.getByRole("radio", { name: "Positive" }).check({ force: true });
await page.getByRole("button", { name: "Hand in the report" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Yes" }).click();
await page.locator(".exam-result").waitFor();
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const result = document.querySelector(".exam-result");
  if (result) window.scrollTo(0, result.getBoundingClientRect().top + window.scrollY - 70);
});
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, "report.png") });
console.log("wrote report.png");
await page.evaluate(() => (window as unknown as { __insonate: { getState(): { endExam(): void } } }).__insonate.getState().endExam());

await page.setViewportSize({ width: 1440, height: 1250 });
await ready(page);
await page.getByRole("button", { name: /webcam/i }).click();
await page.getByRole("region", { name: "Probe Cam" }).getByRole("status").filter({ hasText: "Tracking" }).waitFor();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, "probe-cam.png") });
console.log("wrote probe-cam.png");

await browser.close();
