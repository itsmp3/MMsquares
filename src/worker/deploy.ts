// Production entry: serves the client bundle inlined by scripts/inline-assets.mjs,
// and hands /api/* to the app. Local dev uses index.ts with Vite instead.
import app from "./index";
import type { Env } from "./auth";
// @ts-ignore generated at build time by scripts/inline-assets.mjs
import files from "../../dist/inline-assets.js";

type File = { type: string; body: string };
const assets = files as Record<string, File>;

function serve(path: string): Response | null {
  const f = assets[path];
  if (!f) return null;
  const immutable = path.startsWith("/assets/");
  return new Response(f.body, {
    headers: {
      "content-type": f.type,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(req, env, ctx);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    // Single-page app: unknown paths (/, /admin, ...) get index.html.
    return serve(url.pathname) ?? serve("/index.html")!;
  },
  scheduled: app.scheduled,
} satisfies ExportedHandler<Env>;
