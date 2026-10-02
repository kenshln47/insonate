import { expect, test } from "@playwright/test";

interface Pose {
  phiDeg: number;
  zMm: number;
  rotationDeg: number;
}

function pose(page: import("@playwright/test").Page): Promise<Pose> {
  return page.evaluate(() => {
    const store = (window as unknown as { __insonate: { getState(): { pose: Pose } } }).__insonate;
    const { phiDeg, zMm, rotationDeg } = store.getState().pose;
    return { phiDeg, zMm, rotationDeg };
  });
}

test("Probe Cam: a marker in front of the webcam steers the probe", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /webcam/i }).click();
  const panel = page.getByRole("region", { name: "Probe Cam" });
  await expect(panel.getByRole("status")).toHaveText("Tracking", { timeout: 20_000 });
  const start = await pose(page);
  // The fake camera slides the marker sideways, then turns it.
  await expect
    .poll(async () => {
      const now = await pose(page);
      return Math.abs(now.phiDeg - start.phiDeg) + Math.abs(now.zMm - start.zMm);
    })
    .toBeGreaterThan(5);
  await expect.poll(async () => Math.abs((await pose(page)).rotationDeg - start.rotationDeg)).toBeGreaterThan(10);
  await panel.getByRole("button", { name: "Print the marker" }).click();
  await expect(page.getByRole("dialog")).toContainText("black square should measure 5 cm");
});
