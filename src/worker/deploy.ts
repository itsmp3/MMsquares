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

type DeployEnv = Env & { ADMIN_HOST?: string; PUBLIC_HOST?: string };

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

export default {
  async fetch(req, env: DeployEnv, ctx) {
    const url = new URL(req.url);
    const onAdmin = !!env.ADMIN_HOST && url.hostname === env.ADMIN_HOST;
    if (env.ADMIN_HOST && env.PUBLIC_HOST) {
      if (onAdmin && url.pathname === "/public-site") return redirect(`https://${env.PUBLIC_HOST}/${url.search}`);
      if (!onAdmin) {
        // The admin side only exists on its own host.
        if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return redirect(`https://${env.ADMIN_HOST}/${url.search}`);
        if (url.pathname.startsWith("/api/admin")) return Response.json({ error: "Not found" }, { status: 404 });
      }
    }
    if (url.pathname.startsWith("/api/")) return app.fetch(req, env, ctx);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    // Single-page app: unknown paths (/, /admin, ...) get index.html.
    return serve(url.pathname) ?? serve("/index.html")!;
  },
  scheduled: app.scheduled,
} satisfies ExportedHandler<DeployEnv>;
