import { expect, type Page, test } from "@playwright/test";

interface Pose {
  phiDeg: number;
  zMm: number;
  rotationDeg: number;
  tiltDeg: number;
  rockDeg: number;
}

interface StoreSnapshot {
  pose: Pose;
  stats: { ms: number; contact: number };
  coach: { live: number; hint: { text: string } | null } | null;
}

/** Read part of the app state through the debugging hook in main.tsx. */
function snapshot(page: Page): Promise<StoreSnapshot> {
  return page.evaluate(() => {
    const store = (window as unknown as { __insonate: { getState(): StoreSnapshot } }).__insonate;
    const { pose, stats, coach } = store.getState();
    return { pose, stats, coach };
  });
}

function setPose(page: Page, pose: Pose): Promise<void> {
  return page.evaluate((p) => {
    const store = (window as unknown as { __insonate: { getState(): { setPose(pose: Pose): void } } }).__insonate;
    store.getState().setPose(p);
  }, pose);
}

/** Wait until the case has loaded and the worker has rendered a frame. */
async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect.poll(async () => (await snapshot(page)).stats.ms, { timeout: 60_000 }).toBeGreaterThan(0);
}

test.describe("Insonate", () => {
  test("loads the case and renders ultrasound frames", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);
    const lit = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas.us-canvas");
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return -1;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) if ((data[i] ?? 0) > 40) count++;
      return count / (data.length / 4);
    });
    // A real image: a good part of the fan is speckle, not black.
    expect(lit).toBeGreaterThan(0.15);
    expect(errors).toEqual([]);
  });

  test("keyboard slides the probe toward the head", async ({ page }) => {
    await ready(page);
    const before = (await snapshot(page)).pose.zMm;
    await page.locator("body").press("w");
    await expect.poll(async () => (await snapshot(page)).pose.zMm).toBeGreaterThan(before);
  });

  test("holding a key glides the probe, whatever the keyboard layout", async ({ page }) => {
    await ready(page);
    const before = (await snapshot(page)).pose.zMm;
    await page.keyboard.down("w");
    await page.waitForTimeout(700);
    await page.keyboard.up("w");
    const after = (await snapshot(page)).pose.zMm;
    expect(after - before).toBeGreaterThan(10);
    // An Arabic layout types "ص" on the W key: it is still the key in the W position.
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ص", code: "KeyW", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "ص", code: "KeyW", bubbles: true }));
    });
    await expect.poll(async () => (await snapshot(page)).pose.zMm).toBeGreaterThan(after);
  });

  test("the probe in the hand: drag the image, double-click to centre, hold X to press", async ({ page }) => {
    // Several renders per step: CI machines without a GPU draw the 3D view in software, slowly.
    test.slow();
    await ready(page);
    // Longitudinal, marker toward the head: the head is on the image's left.
    const start: Pose = { phiDeg: 25, zMm: 0, rotationDeg: 0, tiltDeg: 0, rockDeg: 0 };
    await setPose(page, start);
    await expect.poll(async () => (await snapshot(page)).pose.zMm).toBe(0);
    const box = await page.locator(".us-overlay").boundingBox();
    if (!box) throw new Error("no image");
    const at = (fx: number, fy: number) => ({ x: box.x + fx * box.width, y: box.y + fy * box.height });

    // Dragging the anatomy to the right (toward the feet) moves the probe toward the head.
    const from = at(0.45, 0.5);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + box.width * 0.15, from.y, { steps: 8 });
    await page.mouse.up();
    expect((await snapshot(page)).pose.zMm).toBeGreaterThan(8);

    // Double-click a point left of the middle (toward the head): the probe goes to it.
    await setPose(page, start);
    const point = at(0.3, 0.5);
    await page.mouse.dblclick(point.x, point.y);
    await expect.poll(async () => (await snapshot(page)).pose.zMm).toBeGreaterThan(15);

    // Shift-drag sideways rotates the probe.
    await setPose(page, start);
    await page.keyboard.down("Shift");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    expect((await snapshot(page)).pose.rotationDeg).toBeGreaterThan(3);

    // Hold X: graded compression builds up (the screen and the Press key show it), and eases off on release.
    const pressure = () =>
      page.evaluate(
        () =>
          (window as unknown as { __insonate: { getState(): { settings: { pressure: number } } } }).__insonate.getState().settings.pressure,
      );
    await page.keyboard.down("x");
    await expect.poll(pressure).toBeGreaterThan(0.95);
    await expect(page.getByRole("button", { name: /Press the probe in/ })).toHaveClass(/is-pressing/);
    await page.keyboard.up("x");
    await expect.poll(pressure).toBe(0);
  });

  test("guided task: the coach points the way, and Show me reaches the view", async ({ page }) => {
    await ready(page);
    await page.getByRole("tab", { name: "Guided tasks" }).click();
    await page.getByRole("button", { name: /Right kidney: long axis/i }).click();

    // Far from the kidney: the coach still gives a direction.
    await setPose(page, { phiDeg: -40, zMm: -60, rotationDeg: 90, tiltDeg: 0, rockDeg: 0 });
    await expect.poll(async () => (await snapshot(page)).coach?.hint?.text ?? "").toMatch(/Slide|Rotate|Fan/);

    await page.getByRole("button", { name: "Show me" }).click();
    await expect(page.getByText("View achieved")).toBeVisible();
    expect((await snapshot(page)).coach?.live ?? 0).toBeGreaterThanOrEqual(80);
    // The view is taken in a deep breath in, below the ribs, and the pad says where the probe is.
    await expect(page.getByLabel("Probe position", { exact: true })).toContainText("mid-axillary line");
    await expect(page.getByLabel("Probe position", { exact: true })).toContainText(/Subcostal|Intercostal/);
  });

  test("about dialog credits the CT data", async ({ page }) => {
    await ready(page);
    await page.getByRole("button", { name: "About Insonate" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("TotalSegmentator");
    await expect(dialog).toContainText("CC BY 4.0");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
