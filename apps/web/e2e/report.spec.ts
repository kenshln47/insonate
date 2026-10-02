import { expect, type Page, test } from "@playwright/test";

interface Made {
  truth: { kidneyRightMm: number; kidneyLeftMm: number; spleenMm: number; aortaMm: number };
  findings: Array<{ spec: { kind: string }; facts: Record<string, number> }>;
}

type Store = {
  getState(): {
    exam: { case: { code: string; level: number }; made: Made | null; result: { percent: number } | null } | null;
    pose: { phiDeg: number; zMm: number };
  };
};

/** The exam case as the worker made it (waits for it). */
async function made(page: Page): Promise<Made> {
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __insonate: Store }).__insonate.getState().exam?.made)))
    .toBe(true);
  return page.evaluate(() => (window as unknown as { __insonate: Store }).__insonate.getState().exam?.made as Made);
}

test("a teacher's exam code opens the same case, and a careful report scores full marks", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Exam c4: the young woman, level 2, a simple liver cyst.
  await page.goto("/#exam=c4");
  const truth = await made(page);
  const cyst = truth.findings.find((f) => f.spec.kind === "liverCyst");
  expect(cyst).toBeDefined();
  const form = page.locator(".request-form");
  await expect(form).toContainText("Female, 30 years");
  // The answer key stays shut during the exam.
  await expect(page.getByRole("button", { name: "Anatomy" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "CT", exact: true })).toBeDisabled();

  // The report: the cyst and its size, and the routine measurements, as a careful student took them.
  const liver = page.getByRole("group", { name: "Liver" });
  await liver.getByLabel("Focal lesion").selectOption("cyst");
  await liver.getByLabel("Lesion size (largest)").fill(String(cyst?.facts.diameterMm));
  await page
    .getByRole("group", { name: "Spleen" })
    .getByLabel("Length (pole to pole)")
    .fill(String(truth.truth.spleenMm - 3));
  await page
    .getByRole("group", { name: "Right kidney" })
    .getByLabel("Length (pole to pole)")
    .fill(String(truth.truth.kidneyRightMm - 4));
  // In centimetres, as some departments write it: read correctly.
  await page
    .getByRole("group", { name: "Left kidney" })
    .getByLabel("Length (pole to pole)")
    .fill(`${(truth.truth.kidneyLeftMm / 10).toFixed(1)} cm`);
  await page.getByRole("group", { name: "Aorta" }).getByLabel("Maximum diameter (outer to outer)").fill(String(truth.truth.aortaMm));

  await page.getByRole("button", { name: "Hand in the report" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes" }).click();
  await expect(page.locator(".exam-percent")).toHaveText("100%");
  await expect(page.locator(".exam-result")).toContainText("Pass");
  await expect(page.locator(".report-text").first()).toContainText("simple cyst");
  // After handing in, the answer key opens again.
  await expect(page.getByRole("button", { name: "Anatomy" })).toBeEnabled();

  // "Show me" takes the probe to the cyst.
  const before = await page.evaluate(() => (window as unknown as { __insonate: Store }).__insonate.getState().pose);
  await page.getByRole("button", { name: /Show me: Simple liver cyst/ }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __insonate: Store }).__insonate.getState().pose.zMm))
    .not.toBe(before.zMm);
  expect(errors).toEqual([]);
});

test("level 1 asks about one organ, and a missed finding does not pass", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Report" }).click();
  await page.getByRole("button", { name: /Level 1 · Focused/ }).click();
  await made(page);
  // One organ to report on, named in the clinical question.
  await expect(page.locator(".report-section")).toHaveCount(1);
  await expect(page.locator(".request-form")).toContainText("Clinical question");
  // Handing in the normal template misses the finding.
  await page.getByRole("button", { name: "Hand in the report" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes" }).click();
  await expect(page.locator(".exam-result")).toContainText("Not yet a pass");
  await expect(page.locator(".marking .is-missed").first()).toBeVisible();
  // The next case is a new one.
  const code = await page.evaluate(() => (window as unknown as { __insonate: Store }).__insonate.getState().exam?.case.code);
  await page.getByRole("button", { name: "Next case" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __insonate: Store }).__insonate.getState().exam?.case.code))
    .not.toBe(code);
});
