import { easternDate, parseScoreboard, scoreboardUrl, tournamentDates, type ParsedGame } from "../shared/espn";
import { setSetting } from "./db";

export interface SyncResult {
  dates: string[];
  found: number;
  updated: number;
  errors: string[];
}

async function fetchDay(date: string): Promise<ParsedGame[]> {
  const res = await fetch(scoreboardUrl(date), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${date}: HTTP ${res.status}`);
  return parseScoreboard(await res.json());
}

/**
 * Pull tournament scores from ESPN and upsert them. Games an admin has edited (manual = 1)
 * are left alone. With `full`, every date in the tournament window is fetched; otherwise
 * yesterday and today (US Eastern).
 */
export async function syncScores(db: D1Database, year: number, full = false): Promise<SyncResult> {
  const now = new Date();
  const dates = full
    ? tournamentDates(year)
    : [easternDate(now, -1), easternDate(now, 0)].filter((d) => d.startsWith(String(year)));
  const result: SyncResult = { dates, found: 0, updated: 0, errors: [] };
  const games: ParsedGame[] = [];
  for (const d of dates) {
    try {
      games.push(...(await fetchDay(d)));
    } catch (e) {
      result.errors.push(String(e instanceof Error ? e.message : e));
    }
  }
  const relevant = games.filter((g) => g.year === year);
  result.found = relevant.length;
  if (relevant.length) {
    const stmt = db.prepare(
      `INSERT INTO games (year, espn_id, round, region, start_time, team_a, seed_a, score_a, team_b, seed_b, score_b, status, status_detail, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(espn_id) DO UPDATE SET
         round = excluded.round, region = excluded.region, start_time = excluded.start_time,
         team_a = excluded.team_a, seed_a = excluded.seed_a, score_a = excluded.score_a,
         team_b = excluded.team_b, seed_b = excluded.seed_b, score_b = excluded.score_b,
         status = excluded.status, status_detail = excluded.status_detail, updated_at = datetime('now')
       WHERE games.manual = 0`,
    );
    const res = await db.batch(
      relevant.map((g) =>
        stmt.bind(
          g.year, g.espn_id, g.round, g.region, g.start_time, g.team_a, g.seed_a, g.score_a,
          g.team_b, g.seed_b, g.score_b, g.status, g.status_detail,
        ),
      ),
    );
    result.updated = res.reduce((s, r) => s + (r.meta.changes ?? 0), 0);
  }
  await setSetting(db, "last_sync", { at: now.toISOString(), ...result });
  return result;
}
