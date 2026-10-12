// Builds dist/ from src/, then mirrors it into site/lib/ for the website.
//
//   dist/boot-effect.js     the library (UMD, no dependencies)
//   dist/boot-effect.d.ts   typings
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8");
const { version } = JSON.parse(read("package.json"));

const shader = read("src", "shader.frag")
  .trimEnd()
  .split("\n")
  .map((line) => "    " + JSON.stringify(line))
  .join(",\n");
const template = read("src", "boot-effect.js")
  .replace("__SHADER__", () => `[\n${shader}\n  ].join("\\n")`)
  .replaceAll("__VERSION__", version);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "boot-effect.js"), template);
copyFileSync(join(root, "src", "boot-effect.d.ts"), join(root, "dist", "boot-effect.d.ts"));

mkdirSync(join(root, "site", "lib"), { recursive: true });
for (const file of readdirSync(join(root, "dist"))) {
  copyFileSync(join(root, "dist", file), join(root, "site", "lib", file));
}
console.log(`built boot-effect ${version}`);
