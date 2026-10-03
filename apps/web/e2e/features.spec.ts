import { expect, type Page, test } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __insonate: { getState(): { stats: { ms: number } } } }).__insonate.getState().stats.ms,
        ),
      // Loading the patient and the first frame: slow on a CI machine without a GPU.
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
}

/** How many overlay pixels have roughly this colour. */
function countColour(page: Page, rgb: [number, number, number]): Promise<number> {
  return page.evaluate((target) => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.us-overlay");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i + 3] > 200 &&
        Math.abs(data[i] - target[0]) < 30 &&
        Math.abs(data[i + 1] - target[1]) < 30 &&
        Math.abs(data[i + 2] - target[2]) < 30
      )
        count++;
    }
    return count;
  }, rgb);
}

test("Anatomy mode outlines the organs in the image", async ({ page }) => {
  await ready(page);
  // The opening view is the gallbladder: its outline is green.
  expect(await countColour(page, [79, 209, 139])).toBeLessThan(20);
  await page.getByRole("button", { name: "Anatomy" }).click();
  await expect.poll(() => countColour(page, [79, 209, 139])).toBeGreaterThan(200);
});

test("Insonate speaks Arabic, right to left", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "عربي" }).click();
  await expect(page.getByRole("tab", { name: "مسح حر" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
  await page.getByRole("tab", { name: "مهام موجّهة" }).click();
  await page.getByRole("button", { name: /الكلية اليمنى: المحور الطويل/ }).click();
  await expect(page.getByRole("button", { name: "أرِني" })).toBeVisible();
  // The choice is remembered.
  await page.reload();
  await expect(page.getByRole("tab", { name: "مسح حر" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("tab", { name: "Free scan" })).toBeVisible();
});

test("the 3D view faces the scan plane on request", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.getByRole("button", { name: "Scan plane" }).click();
  await expect(page.getByRole("button", { name: "Scan plane" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await page.keyboard.press("w");
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

/** Pixels of the ultrasound image that are clearly red (flow toward the probe) or blue (away). */
function flowColours(page: Page): Promise<{ red: number; blue: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.us-canvas");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return { red: 0, blue: 0 };
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let red = 0;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 140 && data[i + 2] < 110 && data[i] - data[i + 1] > 60) red++;
      if (data[i + 2] > 140 && data[i] < 110 && data[i + 2] - data[i + 1] > 30) blue++;
    }
    return { red, blue };
  });
}

test("colour Doppler shows flow in the IVC, and PW draws its spectrum", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const store = (window as unknown as { __insonate: { getState(): Record<string, (value: unknown) => void> } }).__insonate.getState();
    store.setBreathing("expire");
    store.setPose({ phiDeg: 1, zMm: 144.4, rotationDeg: -1.5, tiltDeg: 0, rockDeg: 1.5 });
    store.setSettings({ depthMm: 180, scaleCmS: 25, colorBox: { center: 0.5, width: 0.9, top: 40, bottom: 140 } });
  });
  await page.keyboard.press("v");
  await expect
    .poll(async () => {
      const { red, blue } = await flowColours(page);
      return red + blue;
    })
    .toBeGreaterThan(300);
  await page.keyboard.press("p");
  await expect(page.getByRole("region", { name: "Spectral Doppler" })).toBeVisible();
});

test("a teaching case adds its finding, and the mystery patient is graded", async ({ page }) => {
  await ready(page);
  await page.getByRole("tab", { name: "Cases" }).click();
  await page.getByRole("button", { name: /^1 Gallstones/ }).click();
  const showMe = page.getByRole("button", { name: "Show me the finding" });
  await expect(showMe).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByText(/3 stones/)).toBeVisible();
  await showMe.click();
  // Anatomy mode outlines the stones in their own colour.
  await page.getByRole("button", { name: "Anatomy" }).click();
  await expect.poll(() => countColour(page, [255, 241, 168]), { timeout: 15_000 }).toBeGreaterThan(20);
  await page.getByRole("button", { name: "← All cases" }).click();
  await page.getByRole("button", { name: /Mystery patient/ }).click();
  await page.getByRole("radio", { name: "Normal" }).check();
  await page.getByRole("button", { name: "Check my answer" }).click();
  await expect(page.getByText(/^(Correct\.|Not quite)/)).toBeVisible();
});

test("a shared link opens the same patient, mode and case", async ({ page }) => {
  await page.goto("/#patient=s0139&mode=cases&case=liverCyst");
  await expect(page.getByRole("heading", { name: "Simple liver cyst" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("combobox", { name: "Patient" })).toHaveValue("s0139");
  await expect(page.getByRole("button", { name: "Show me the finding" })).toBeEnabled({ timeout: 20_000 });
  // Back to the first patient: a fresh start.
  await page.getByRole("combobox", { name: "Patient" }).selectOption("s0319");
  await expect(page.getByRole("tab", { name: "Cases" })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.location.hash)).toBe("");
});
