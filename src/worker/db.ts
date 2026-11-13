import type { AdminBox, Game, HistoryYear, Pool, PayoutRow, PublicBox } from "../shared/types";
import { outcome } from "../shared/logic";

type Row = Record<string, unknown>;

export function toPool(r: Row): Pool {
  return {
    id: Number(r.id),
    year: Number(r.year),
    name: String(r.name),
    buy_in: Number(r.buy_in),
    payouts: JSON.parse(String(r.payouts)),
    col_digits: r.col_digits ? JSON.parse(String(r.col_digits)) : null,
    row_digits: r.row_digits ? JSON.parse(String(r.row_digits)) : null,
    drawn_at: (r.drawn_at as string) ?? null,
    is_current: Number(r.is_current),
  };
}

export async function listPools(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, year, name, is_current, drawn_at FROM pools ORDER BY year DESC, id")
    .all();
  return results;
}

/** The requested pool, else the current one, else the newest. */
export async function getPool(db: D1Database, id?: number | null): Promise<Pool | null> {
  const r = id
    ? await db.prepare("SELECT * FROM pools WHERE id = ?").bind(id).first()
    : await db.prepare("SELECT * FROM pools ORDER BY is_current DESC, year DESC, id DESC LIMIT 1").first();
  return r ? toPool(r) : null;
}

/** All 100 boxes, filling in open ones that have no row yet. */
export async function getBoxes(db: D1Database, poolId: number): Promise<AdminBox[]> {
  const { results } = await db.prepare("SELECT * FROM boxes WHERE pool_id = ?").bind(poolId).all<AdminBox>();
  const byNum = new Map(results.map((b) => [Number(b.num), b]));
  return Array.from({ length: 100 }, (_, i) => {
    const b = byNum.get(i + 1);
    return {
      num: i + 1,
      name: b?.name ?? null,
      status: b?.status ?? "open",
      requested_at: b?.requested_at ?? null,
      pay_method: b?.pay_method ?? null,
      collected_by: b?.collected_by ?? null,
      paid_at: b?.paid_at ?? null,
      note: b?.note ?? null,
    };
  });
}

export function publicBoxes(boxes: AdminBox[]): PublicBox[] {
  return boxes.map(({ num, name, status }) => ({ num, name, status }));
}

export async function getGames(db: D1Database, year: number): Promise<Game[]> {
  const { results } = await db
    .prepare("SELECT * FROM games WHERE year = ? ORDER BY round, start_time, id")
    .bind(year)
    .all<Game>();
  return results;
}

export async function getPayoutRows(db: D1Database, poolId: number): Promise<PayoutRow[]> {
  const { results } = await db.prepare("SELECT * FROM payouts WHERE pool_id = ?").bind(poolId).all<PayoutRow>();
  return results;
}

export async function getSetting<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const r = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  if (!r) return fallback;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(db: D1Database, key: string, value: unknown) {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, JSON.stringify(value))
    .run();
}

export async function audit(db: D1Database, actor: string | null, action: string, detail?: unknown) {
  await db
    .prepare("INSERT INTO audit_log (actor, action, detail) VALUES (?, ?, ?)")
    .bind(actor, action, detail == null ? null : JSON.stringify(detail))
    .run();
}

/**
 * History by year: imported spreadsheet years, plus any later year built from the games table
 * (final games only; void games count as a no-contest).
 */
export async function getHistory(db: D1Database): Promise<HistoryYear[]> {
  const { results: hist } = await db
    .prepare("SELECT year, idx, round, code FROM history_scores ORDER BY year, idx")
    .all<{ year: number; idx: number; round: number; code: string | null }>();
  const years = new Map<number, HistoryYear>();
  for (const h of hist) {
    let y = years.get(h.year);
    if (!y) years.set(h.year, (y = { year: h.year, games: [] }));
    y.games.push({ round: h.round, code: h.code });
  }
  const { results: games } = await db
    .prepare("SELECT * FROM games WHERE status IN ('final','void','live','scheduled') ORDER BY year, round, start_time, id")
    .all<Game>();
  const fromGames = new Map<number, HistoryYear>();
  for (const g of games) {
    if (years.has(g.year)) continue;
    let y = fromGames.get(g.year);
    if (!y) fromGames.set(g.year, (y = { year: g.year, games: [] }));
    if (g.status === "final") y.games.push({ round: g.round, code: outcome(g)?.code ?? null });
    else if (g.status === "void") y.games.push({ round: g.round, code: null });
    else y.in_progress = true;
  }
  for (const [year, y] of fromGames) {
    if (y.games.length < 63) y.in_progress = true;
    if (y.games.length) years.set(year, y);
  }
  return [...years.values()].sort((a, b) => a.year - b.year);
}
