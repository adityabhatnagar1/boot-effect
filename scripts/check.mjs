// Builds, then verifies that the bundle parses and exposes the public API.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(process.execPath, [join(root, "scripts", "build.mjs")], { stdio: "inherit" });

const require = createRequire(import.meta.url);
const file = join(root, "dist", "boot-effect.js");
execFileSync(process.execPath, ["--check", file]);
const api = require(file);
const missing = ["VERSION", "FRAMES", "FPS", "DURATION", "supported"].filter((k) => !(k in api));
if (missing.length || typeof api !== "function") {
  console.error(`boot-effect.js: incomplete public API (${missing.join(", ") || "not a constructor"})`);
  process.exit(1);
}
console.log(`ok  boot-effect.js  v${api.VERSION}  ${api.FRAMES} frames @ ${api.FPS} fps`);
