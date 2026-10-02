// Rasterises the Insonate logo (apps/web/public/favicon.svg) into the PNG icons the
// web app manifest needs, using a headless browser so the PNGs match the SVG exactly.
// PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's own.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "apps", "web", "public");
const svg = readFileSync(join(publicDir, "favicon.svg"), "utf8");
const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
/** The logo's own background, used to fill the full bleed of maskable icons. */
const BACKGROUND = "#0e0f10";

const ICONS = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  // Maskable icons keep the artwork inside the central 80 % safe zone.
  { name: "icon-maskable-512.png", size: 512, maskable: true },
] as const;

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage();
const target = join(publicDir, "icons");
mkdirSync(target, { recursive: true });
for (const icon of ICONS) {
  const art = icon.maskable ? Math.round(icon.size * 0.8) : icon.size;
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<body style="margin:0;display:grid;place-items:center;width:${icon.size}px;height:${icon.size}px;` +
      `background:${icon.maskable ? BACKGROUND : "transparent"}">` +
      `<img src="${source}" width="${art}" height="${art}" alt=""></body>`,
  );
  await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  writeFileSync(join(target, icon.name), await page.screenshot({ omitBackground: !icon.maskable }));
  console.log(`wrote ${icon.name}`);
}
await browser.close();
