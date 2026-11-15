// Bundle the built client (dist/client) into a JS module the Worker serves directly.
// Used by `npm run deploy`, so deploying needs only an API token (no separate asset upload).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = "dist/client";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};
const binary = new Set([".png"]);
const files = {};
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!name.startsWith(".")) {
      const type = types[extname(name)];
      if (!type) throw new Error(`No content type for ${p}; add it to scripts/inline-assets.mjs`);
      const key = "/" + relative(root, p).split("\\").join("/");
      files[key] = binary.has(extname(name))
        ? { type, body: readFileSync(p).toString("base64"), base64: true }
        : { type, body: readFileSync(p, "utf8") };
    }
  }
}
walk(root);
writeFileSync("dist/inline-assets.js", `export default ${JSON.stringify(files)};\n`);
console.log(`Inlined ${Object.keys(files).length} files: ${Object.keys(files).join(", ")}`);
