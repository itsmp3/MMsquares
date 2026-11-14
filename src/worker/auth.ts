import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Zero Trust team name: <team>.cloudflareaccess.com */
  ACCESS_TEAM: string;
  /** Audience tag of the Cloudflare Access application protecting /admin and /api/admin. */
  ACCESS_AUD: string;
  /** JSON object mapping admin email -> collector label, e.g. {"me@x.com":"MP"} */
  ADMINS: string;
  /** Local development only: act as this admin without Cloudflare Access. */
  DEV_ADMIN_EMAIL?: string;
}

export interface Admin {
  email: string;
  label: string | null;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeam = "";

function adminMap(env: Env): Record<string, string> {
  try {
    const m = JSON.parse(env.ADMINS || "{}");
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k.toLowerCase(), String(v)]));
  } catch {
    return {};
  }
}

/**
 * Identify an admin from the Cloudflare Access JWT. Access sits in front of /admin and
 * /api/admin, but the token is still verified here and the email must be in ADMINS.
 */
export async function getAdmin(req: Request, env: Env): Promise<Admin | null> {
  const admins = adminMap(env);
  const host = new URL(req.url).hostname;
  if (env.DEV_ADMIN_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    const email = env.DEV_ADMIN_EMAIL.toLowerCase();
    return { email, label: admins[email] ?? null };
  }
  // Access adds this header on protected paths (/admin, /api/admin). Elsewhere (e.g. /api/me on the
  // public page) fall back to the Access session cookie; it is verified the same way below.
  const cookie = req.headers.get("Cookie")?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  const token = req.headers.get("Cf-Access-Jwt-Assertion") ?? cookie ?? null;
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
  const issuer = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
  if (!jwks || jwksTeam !== env.ACCESS_TEAM) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksTeam = env.ACCESS_TEAM;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    const email = String(payload.email ?? "").toLowerCase();
    if (!email || !(email in admins)) return null;
    return { email, label: admins[email] };
  } catch {
    return null;
  }
}
