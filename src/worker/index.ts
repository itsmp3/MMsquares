import { Hono } from "hono";
import type { Context } from "hono";
import { getAdmin, type Admin, type Env } from "./auth";
import {
  audit,
  getBoxes,
  getGames,
  getHistory,
  getPayoutRows,
  getPool,
  getSetting,
  listPools,
  publicBoxes,
  setSetting,
} from "./db";
import { syncScores } from "./sync";
import { cleanName, nameKey, shuffleDigits } from "../shared/logic";
import type { BoxStatus } from "../shared/types";

type AppEnv = { Bindings: Env; Variables: { admin: Admin } };
const app = new Hono<AppEnv>();

const MAX_NAME = 40;
const STATUSES: BoxStatus[] = ["open", "pending", "claimed", "paid"];

function bad(c: Context, msg: string, status: 400 | 404 | 409 = 400) {
  return c.json({ error: msg }, status);
}

/** Reuse an existing spelling from this pool when the name matches ignoring case/spaces. */
async function canonicalName(db: D1Database, poolId: number, name: string): Promise<string> {
  const { results } = await db
    .prepare("SELECT name, COUNT(*) AS n FROM boxes WHERE pool_id = ? AND name IS NOT NULL GROUP BY name ORDER BY n DESC")
    .bind(poolId)
    .all<{ name: string }>();
  return results.map((r) => cleanName(r.name)).find((n) => nameKey(n) === nameKey(name)) ?? name;
}

function cryptoRandom() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// ---------- public ----------

app.get("/api/me", async (c) => {
  const admin = await getAdmin(c.req.raw, c.env);
  return c.json({ admin: !!admin, email: admin?.email ?? null, label: admin?.label ?? null });
});

app.get("/api/state", async (c) => {
  const pool = await getPool(c.env.DB, Number(c.req.query("pool")) || null);
  const pools = await listPools(c.env.DB);
  if (!pool) return c.json({ pool: null, pools, boxes: [], games: [] });
  const [boxes, games] = await Promise.all([getBoxes(c.env.DB, pool.id), getGames(c.env.DB, pool.year)]);
  return c.json({ pool, pools, boxes: publicBoxes(boxes), games });
});

app.get("/api/history", async (c) => c.json({ years: await getHistory(c.env.DB) }));

/** Anyone can request open boxes before the draw; they show as pending until an admin approves. */
app.post("/api/request", async (c) => {
  const body = await c.req.json<{ pool_id: number; nums: number[]; name: string }>().catch(() => null);
  const name = cleanName(body?.name);
  if (!body || !name) return bad(c, "Please enter a name.");
  if (name.length > MAX_NAME) return bad(c, `Names can be at most ${MAX_NAME} characters.`);
  const nums = [...new Set((body.nums ?? []).map(Number))].filter((n) => n >= 1 && n <= 100);
  if (!nums.length) return bad(c, "Pick at least one box.");
  const pool = await getPool(c.env.DB, Number(body.pool_id));
  if (!pool || !pool.is_current) return bad(c, "This pool isn't taking requests.", 404);
  if (pool.drawn_at) return bad(c, "Numbers have been drawn, so the grid is locked.", 409);
  const boxes = await getBoxes(c.env.DB, pool.id);
  const taken = nums.filter((n) => boxes[n - 1].status !== "open");
  if (taken.length) return bad(c, `Already taken: ${taken.map((n) => `Box ${String(n).padStart(2, "0")}`).join(", ")}`, 409);
  const stmt = c.env.DB.prepare(
    `INSERT INTO boxes (pool_id, num, name, status, requested_at) VALUES (?, ?, ?, 'pending', datetime('now'))
     ON CONFLICT(pool_id, num) DO UPDATE SET name = excluded.name, status = 'pending', requested_at = excluded.requested_at
     WHERE boxes.status = 'open'`,
  );
  const canon = await canonicalName(c.env.DB, pool.id, name);
  const res = await c.env.DB.batch(nums.map((n) => stmt.bind(pool.id, n, canon)));
  const ok = nums.filter((_, i) => (res[i].meta.changes ?? 0) > 0);
  return c.json({ requested: ok });
});

// ---------- admin ----------

app.use("/api/admin/*", async (c, next) => {
  const admin = await getAdmin(c.req.raw, c.env);
  if (!admin) return c.json({ error: "Not signed in as an admin." }, 403);
  c.set("admin", admin);
  await next();
});

app.get("/api/admin/state", async (c) => {
  const db = c.env.DB;
  const pool = await getPool(db, Number(c.req.query("pool")) || null);
  const [pools, collectors, payMethods, lastSync] = await Promise.all([
    listPools(db),
    getSetting<string[]>(db, "collectors", ["MP", "ATM"]),
    getSetting<string[]>(db, "pay_methods", ["Venmo", "Zelle", "PayPal", "Cash"]),
    getSetting(db, "last_sync", null),
  ]);
  if (!pool) return c.json({ pool: null, pools, boxes: [], games: [], payouts: [], collectors, payMethods, lastSync, knownNames: [] });
  const [boxes, games, payouts, names] = await Promise.all([
    getBoxes(db, pool.id),
    getGames(db, pool.year),
    getPayoutRows(db, pool.id),
    db.prepare("SELECT DISTINCT name FROM boxes WHERE name IS NOT NULL ORDER BY name").all<{ name: string }>(),
  ]);
  const knownNames = [...new Map(names.results.map((r) => [nameKey(r.name), cleanName(r.name)])).values()];
  return c.json({ pool, pools, boxes, games, payouts, collectors, payMethods, lastSync, knownNames, me: c.get("admin") });
});

app.put("/api/admin/boxes/:pool/:num", async (c) => {
  const poolId = Number(c.req.param("pool"));
  const num = Number(c.req.param("num"));
  const b = await c.req.json<{
    name?: string | null;
    status?: BoxStatus;
    pay_method?: string | null;
    collected_by?: string | null;
    note?: string | null;
  }>();
  if (!(num >= 1 && num <= 100)) return bad(c, "Bad box number.");
  const name = b.name && cleanName(b.name) ? await canonicalName(c.env.DB, poolId, cleanName(b.name)) : null;
  let status: BoxStatus = b.status && STATUSES.includes(b.status) ? b.status : name ? "claimed" : "open";
  if (!name) status = "open";
  if (name && status === "open") status = "claimed";
  const paid = status === "paid";
  await c.env.DB.prepare(
    `INSERT INTO boxes (pool_id, num, name, status, pay_method, collected_by, paid_at, note)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, CASE WHEN ?7 THEN datetime('now') END, ?8)
     ON CONFLICT(pool_id, num) DO UPDATE SET
       name = excluded.name, status = excluded.status, pay_method = excluded.pay_method,
       collected_by = excluded.collected_by, note = excluded.note,
       paid_at = CASE WHEN ?7 THEN COALESCE(boxes.paid_at, datetime('now')) END`,
  )
    .bind(poolId, num, name, status, paid ? b.pay_method ?? null : null, paid ? b.collected_by ?? null : null, paid ? 1 : 0, b.note ?? null)
    .run();
  await audit(c.env.DB, c.get("admin").email, "box", { poolId, num, name, status });
  return c.json({ ok: true });
});

/** Approve / reject / mark paid for several boxes at once. */
app.post("/api/admin/boxes/:pool/bulk", async (c) => {
  const poolId = Number(c.req.param("pool"));
  const b = await c.req.json<{ nums: number[]; action: "approve" | "reject" | "paid" | "unpaid"; pay_method?: string; collected_by?: string }>();
  const nums = (b.nums ?? []).map(Number).filter((n) => n >= 1 && n <= 100);
  const db = c.env.DB;
  let stmt: D1PreparedStatement;
  switch (b.action) {
    case "approve":
      stmt = db.prepare("UPDATE boxes SET status = 'claimed' WHERE pool_id = ? AND num = ? AND status = 'pending'");
      break;
    case "reject":
      stmt = db.prepare("UPDATE boxes SET status = 'open', name = NULL, requested_at = NULL WHERE pool_id = ? AND num = ? AND status = 'pending'");
      break;
    case "paid":
      stmt = db
        .prepare(
          "UPDATE boxes SET status = 'paid', pay_method = ?3, collected_by = ?4, paid_at = COALESCE(paid_at, datetime('now')) WHERE pool_id = ?1 AND num = ?2 AND name IS NOT NULL",
        );
      break;
    case "unpaid":
      stmt = db.prepare("UPDATE boxes SET status = 'claimed', pay_method = NULL, collected_by = NULL, paid_at = NULL WHERE pool_id = ? AND num = ? AND status = 'paid'");
      break;
    default:
      return bad(c, "Unknown action.");
  }
  await db.batch(
    nums.map((n) => (b.action === "paid" ? stmt.bind(poolId, n, b.pay_method ?? null, b.collected_by ?? null) : stmt.bind(poolId, n))),
  );
  await audit(db, c.get("admin").email, `bulk:${b.action}`, { poolId, nums });
  return c.json({ ok: true });
});

/** Rename a person everywhere in a pool (fixes typos and stray spaces in one go). */
app.post("/api/admin/rename", async (c) => {
  const b = await c.req.json<{ pool_id: number; from: string; to: string }>();
  const to = cleanName(b.to);
  if (!to) return bad(c, "New name is empty.");
  const { results } = await c.env.DB.prepare("SELECT num, name FROM boxes WHERE pool_id = ? AND name IS NOT NULL")
    .bind(b.pool_id)
    .all<{ num: number; name: string }>();
  const targets = results.filter((r) => nameKey(r.name) === nameKey(b.from));
  if (targets.length) {
    const stmt = c.env.DB.prepare("UPDATE boxes SET name = ? WHERE pool_id = ? AND num = ?");
    await c.env.DB.batch(targets.map((t) => stmt.bind(to, b.pool_id, t.num)));
  }
  await audit(c.env.DB, c.get("admin").email, "rename", { pool: b.pool_id, from: b.from, to, boxes: targets.length });
  return c.json({ renamed: targets.length });
});

app.post("/api/admin/pools/:id/draw", async (c) => {
  const pool = await getPool(c.env.DB, Number(c.req.param("id")));
  if (!pool) return bad(c, "Pool not found.", 404);
  if (pool.drawn_at) return bad(c, "Numbers were already drawn.", 409);
  const col = shuffleDigits(cryptoRandom);
  const row = shuffleDigits(cryptoRandom);
  await c.env.DB.prepare("UPDATE pools SET col_digits = ?, row_digits = ?, drawn_at = datetime('now') WHERE id = ? AND drawn_at IS NULL")
    .bind(JSON.stringify(col), JSON.stringify(row), pool.id)
    .run();
  await audit(c.env.DB, c.get("admin").email, "draw", { pool: pool.id, col, row });
  return c.json({ col, row });
});

app.post("/api/admin/pools/:id/undraw", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE pools SET col_digits = NULL, row_digits = NULL, drawn_at = NULL WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("admin").email, "undraw", { pool: id });
  return c.json({ ok: true });
});

app.post("/api/admin/pools", async (c) => {
  const b = await c.req.json<{ year: number; name: string; buy_in: number; payouts: Record<string, number>; make_current?: boolean }>();
  if (!b.year || !cleanName(b.name) || !(b.buy_in > 0)) return bad(c, "Year, name and buy-in are required.");
  const db = c.env.DB;
  const stmts = [];
  if (b.make_current) stmts.push(db.prepare("UPDATE pools SET is_current = 0"));
  stmts.push(
    db.prepare("INSERT INTO pools (year, name, buy_in, payouts, is_current) VALUES (?, ?, ?, ?, ?)")
      .bind(b.year, cleanName(b.name), b.buy_in, JSON.stringify(b.payouts ?? {}), b.make_current ? 1 : 0),
  );
  const res = await db.batch(stmts);
  const id = res[res.length - 1].meta.last_row_id;
  await audit(db, c.get("admin").email, "pool:create", { id, ...b });
  return c.json({ id });
});

app.put("/api/admin/pools/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ name?: string; buy_in?: number; payouts?: Record<string, number>; make_current?: boolean }>();
  const pool = await getPool(c.env.DB, id);
  if (!pool) return bad(c, "Pool not found.", 404);
  const db = c.env.DB;
  const stmts = [
    db.prepare("UPDATE pools SET name = ?, buy_in = ?, payouts = ? WHERE id = ?").bind(
      cleanName(b.name) || pool.name,
      b.buy_in && b.buy_in > 0 ? b.buy_in : pool.buy_in,
      JSON.stringify(b.payouts ?? pool.payouts),
      id,
    ),
  ];
  if (b.make_current) stmts.push(db.prepare("UPDATE pools SET is_current = (id = ?)").bind(id));
  await db.batch(stmts);
  await audit(db, c.get("admin").email, "pool:update", { id, ...b });
  return c.json({ ok: true });
});

app.post("/api/admin/sync", async (c) => {
  const b = await c.req.json<{ year: number; full?: boolean }>();
  const result = await syncScores(c.env.DB, Number(b.year), !!b.full);
  await audit(c.env.DB, c.get("admin").email, "sync", { year: b.year, full: !!b.full, found: result.found, errors: result.errors });
  return c.json(result);
});

app.post("/api/admin/games", async (c) => {
  const g = await c.req.json<{ year: number; round: number; team_a: string; team_b: string; score_a?: number | null; score_b?: number | null; status?: string }>();
  if (!g.year || !(g.round >= 1 && g.round <= 6) || !cleanName(g.team_a) || !cleanName(g.team_b)) return bad(c, "Year, round and both teams are required.");
  const status = g.score_a != null && g.score_b != null ? g.status ?? "final" : "scheduled";
  const r = await c.env.DB.prepare(
    "INSERT INTO games (year, round, team_a, team_b, score_a, score_b, status, manual, start_time) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))",
  )
    .bind(g.year, g.round, cleanName(g.team_a), cleanName(g.team_b), g.score_a ?? null, g.score_b ?? null, status)
    .run();
  await audit(c.env.DB, c.get("admin").email, "game:add", g);
  return c.json({ id: r.meta.last_row_id });
});

app.put("/api/admin/games/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const g = await c.req.json<{
    team_a?: string; team_b?: string; score_a?: number | null; score_b?: number | null;
    status?: string; manual?: boolean; payout_to_game_id?: number | null; round?: number;
  }>();
  const cur = await c.env.DB.prepare("SELECT * FROM games WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!cur) return bad(c, "Game not found.", 404);
  const status = g.status && ["scheduled", "live", "final", "void"].includes(g.status) ? g.status : cur.status;
  await c.env.DB.prepare(
    `UPDATE games SET team_a = ?, team_b = ?, score_a = ?, score_b = ?, status = ?, round = ?, manual = ?,
       payout_to_game_id = ?, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(
      cleanName(g.team_a) || cur.team_a,
      cleanName(g.team_b) || cur.team_b,
      g.score_a !== undefined ? g.score_a : cur.score_a,
      g.score_b !== undefined ? g.score_b : cur.score_b,
      status,
      g.round ?? cur.round,
      g.manual === undefined ? 1 : g.manual ? 1 : 0,
      status === "void" ? g.payout_to_game_id ?? null : null,
      id,
    )
    .run();
  await audit(c.env.DB, c.get("admin").email, "game:edit", { id, ...g });
  return c.json({ ok: true });
});

app.delete("/api/admin/games/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE games SET payout_to_game_id = NULL WHERE payout_to_game_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM payouts WHERE game_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM games WHERE id = ?").bind(id),
  ]);
  await audit(c.env.DB, c.get("admin").email, "game:delete", { id });
  return c.json({ ok: true });
});

app.put("/api/admin/payouts/:pool/:game", async (c) => {
  const poolId = Number(c.req.param("pool"));
  const gameId = Number(c.req.param("game"));
  const b = await c.req.json<{ payer?: string | null; paid?: boolean; method?: string | null; note?: string | null }>();
  await c.env.DB.prepare(
    `INSERT INTO payouts (pool_id, game_id, payer, paid_at, method, note)
     VALUES (?1, ?2, ?3, CASE WHEN ?4 THEN datetime('now') END, ?5, ?6)
     ON CONFLICT(pool_id, game_id) DO UPDATE SET payer = excluded.payer, method = excluded.method, note = excluded.note,
       paid_at = CASE WHEN ?4 THEN COALESCE(payouts.paid_at, datetime('now')) END`,
  )
    .bind(poolId, gameId, b.payer ?? null, b.paid ? 1 : 0, b.method ?? null, b.note ?? null)
    .run();
  await audit(c.env.DB, c.get("admin").email, "payout", { poolId, gameId, ...b });
  return c.json({ ok: true });
});

app.put("/api/admin/settings", async (c) => {
  const b = await c.req.json<{ collectors?: string[]; pay_methods?: string[] }>();
  const clean = (a?: string[]) => [...new Set((a ?? []).map(cleanName).filter(Boolean))];
  if (b.collectors) await setSetting(c.env.DB, "collectors", clean(b.collectors));
  if (b.pay_methods) await setSetting(c.env.DB, "pay_methods", clean(b.pay_methods));
  return c.json({ ok: true });
});

app.get("/api/admin/audit", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 200").all();
  return c.json({ entries: results });
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  /** Cron: refresh yesterday's and today's scores for the current pool's year. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const pool = await getPool(env.DB, null);
    if (!pool) return;
    ctx.waitUntil(syncScores(env.DB, pool.year).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
