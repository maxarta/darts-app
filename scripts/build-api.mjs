import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiDir = path.join(root, "api");

for (const name of fs.readdirSync(apiDir)) {
  if (name.endsWith(".js") || name.endsWith(".js.map")) {
    fs.unlinkSync(path.join(apiDir, name));
  }
}

// Single-segment function — Vercel hybrid static builds match nested
// catch-alls unreliably, so vercel.json rewrites /api/* → /api/gateway.
const outfile = path.join(apiDir, "gateway.js");

await esbuild.build({
  entryPoints: [path.join(root, "server/vercel-entry.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
  alias: {
    "@": root,
  },
  logLevel: "info",
});

console.log(`Bundled API → ${path.relative(root, outfile)}`);
