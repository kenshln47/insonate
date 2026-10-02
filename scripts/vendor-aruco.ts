// Converts the parts of js-aruco2 that Probe Cam needs into ES modules under
// apps/web/src/probecam/vendor. The library is CommonJS that assigns to top-level
// `this`, which bundlers turn into `undefined`; as ES modules it bundles cleanly, and
// only the ARUCO_MIP_36h12 dictionary is kept. Run after upgrading js-aruco2:
//
//   npx tsx scripts/vendor-aruco.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, "apps", "web", "package.json"));
const source = dirname(require.resolve("js-aruco2"));
const version = (JSON.parse(readFileSync(join(source, "..", "package.json"), "utf8")) as { version: string }).version;
const target = join(root, "apps", "web", "src", "probecam", "vendor");
mkdirSync(target, { recursive: true });

function replaceOnce(text: string, from: string | RegExp, to: string, file: string): string {
  const next = text.replace(from, to);
  if (next === text) throw new Error(`${file}: expected to find ${String(from)}`);
  return next;
}

const banner = `// Vendored from js-aruco2 ${version} (MIT, see the licence below), converted to an ES module
// by scripts/vendor-aruco.ts. Do not edit by hand.
`;

const files: Record<string, (text: string) => string> = {
  "cv.js": (text) => `${replaceOnce(text, "var CV = CV || {};\nthis.CV = CV;", "var CV = {};", "cv.js")}\nexport { CV };\n`,
  "svd.js": (text) => `${replaceOnce(text, "var SVD = SVD || {};\nthis.SVD = SVD;", "var SVD = {};", "svd.js")}\nexport { SVD };\n`,
  "posit1.js": (text) => {
    let out = replaceOnce(text, "var POS = POS || {};\nthis.POS = POS;", "var POS = {};", "posit1.js");
    out = replaceOnce(out, "var SVD = this.SVD || require('./svd').SVD;", 'import { SVD } from "./svd.js";', "posit1.js");
    return `${out}\nexport { POS };\n`;
  },
  "aruco.js": (text) => {
    let out = replaceOnce(
      text,
      "var AR = {};\nvar CV = this.CV || require('./cv').CV;\nthis.AR = AR;",
      'import { CV } from "./cv.js";\nvar AR = {};',
      "aruco.js",
    );
    // Keep only the dictionary Insonate prints.
    out = replaceOnce(out, /\n {2}ARUCO: \{\n[\s\S]*?\n {2}\},\n(?= {2}ARUCO_MIP_36h12: \{)/, "\n", "aruco.js");
    return `${out}\nexport { AR };\n`;
  },
};

for (const [file, convert] of Object.entries(files)) {
  const text = readFileSync(join(source, file), "utf8").replace(/\r\n/g, "\n");
  writeFileSync(join(target, file), banner + convert(text));
  console.log(`wrote vendor/${file}`);
}
