import type { AdminBox, Game, Pool, PayoutRow, PublicBox } from "./types";

/** Trim and collapse internal whitespace, so "Tina Gatto " and "Tina  Gatto" match "Tina Gatto". */
export function cleanName(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Key used to group the same person's boxes: cleaned and case-insensitive. */
export function nameKey(s: string | null | undefined): string {
  return cleanName(s).toLowerCase();
}

/**
 * Two-digit code: winning team's last digit, then losing team's. A 73-71 win is "31".
 * Shown to people with a dash ("3-1") via fmtScore so it isn't confused with box numbers.
 */
export function codeFor(winnerScore: number, loserScore: number): string {
  return `${winnerScore % 10}${loserScore % 10}`;
}

/** "31" -> "3-1" (winner-loser). */
export function fmtScore(code: string): string {
  return `${code[0]}-${code[1]}`;
}

export interface Outcome {
  winnerScore: number;
  loserScore: number;
  winnerTeam: string;
  loserTeam: string;
  code: string;
}

/** Winner/loser for a game that has scores. Ties (live games only) treat team A as "winner". */
export function outcome(g: Pick<Game, "score_a" | "score_b" | "team_a" | "team_b">): Outcome | null {
  if (g.score_a == null || g.score_b == null) return null;
  const aWins = g.score_a >= g.score_b;
  const winnerScore = aWins ? g.score_a : g.score_b;
  const loserScore = aWins ? g.score_b : g.score_a;
  return {
    winnerScore,
    loserScore,
    winnerTeam: aWins ? g.team_a : g.team_b,
    loserTeam: aWins ? g.team_b : g.team_a,
    code: codeFor(winnerScore, loserScore),
  };
}

/** Box number (1-100) that a code lands on in a drawn pool, or null if not drawn. */
export function boxForCode(pool: Pick<Pool, "col_digits" | "row_digits">, code: string): number | null {
  if (!pool.col_digits || !pool.row_digits) return null;
  const winner = Number(code[0]);
  const loser = Number(code[1]);
  const r = pool.row_digits.indexOf(winner);
  const c = pool.col_digits.indexOf(loser);
  if (r < 0 || c < 0) return null;
  return r * 10 + c + 1;
}

/** Row/column digits for a box number in a drawn pool. */
export function digitsForBox(pool: Pick<Pool, "col_digits" | "row_digits">, num: number) {
  if (!pool.col_digits || !pool.row_digits) return null;
  const r = Math.floor((num - 1) / 10);
  const c = (num - 1) % 10;
  return { winner: pool.row_digits[r], loser: pool.col_digits[c] };
}

/** Uniform random permutation of 0-9 (Fisher-Yates). */
export function shuffleDigits(random: () => number = Math.random): number[] {
  const d = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export interface Win {
  game: Game;
  code: string;
  box: number | null;
  name: string | null;
  /** Round payout plus any payouts redirected here from void games. */
  amount: number;
  /** Amount included from void games. */
  carried: number;
  /** Who pays: explicit override, else the box's collector. Admin-only. */
  payer?: string | null;
  paid_at?: string | null;
  method?: string | null;
  note?: string | null;
}

/**
 * Payout amount per game id for a pool. Void games pay nothing themselves; their payout
 * moves to payout_to_game_id, or to the championship game when that is unset.
 */
export function payoutAmounts(pool: Pick<Pool, "payouts">, games: Game[]) {
  const base = new Map<number, number>();
  const carried = new Map<number, number>();
  const champ = games.find((g) => g.round === 6 && g.status !== "void");
  for (const g of games) base.set(g.id, g.status === "void" ? 0 : Number(pool.payouts[String(g.round)] ?? 0));
  for (const g of games) {
    if (g.status !== "void") continue;
    const targetId = g.payout_to_game_id ?? champ?.id;
    if (targetId == null) continue;
    carried.set(targetId, (carried.get(targetId) ?? 0) + Number(pool.payouts[String(g.round)] ?? 0));
  }
  return { base, carried };
}

/** Wins for every final game in a pool (requires a drawn grid). */
export function computeWins(
  pool: Pool,
  boxes: (PublicBox | AdminBox)[],
  games: Game[],
  payoutRows: PayoutRow[] = [],
): Win[] {
  const byNum = new Map(boxes.map((b) => [b.num, b]));
  const rows = new Map(payoutRows.map((p) => [p.game_id, p]));
  const { base, carried } = payoutAmounts(pool, games);
  const wins: Win[] = [];
  for (const g of games) {
    if (g.status !== "final") continue;
    const o = outcome(g);
    if (!o) continue;
    const box = boxForCode(pool, o.code);
    const b = box != null ? byNum.get(box) : undefined;
    const c = carried.get(g.id) ?? 0;
    const w: Win = {
      game: g,
      code: o.code,
      box,
      name: b?.name ? cleanName(b.name) : null,
      amount: (base.get(g.id) ?? 0) + c,
      carried: c,
    };
    if (b && "collected_by" in b) {
      const row = rows.get(g.id);
      w.payer = row?.payer ?? (b as AdminBox).collected_by ?? null;
      w.paid_at = row?.paid_at ?? null;
      w.method = row?.method ?? null;
      w.note = row?.note ?? null;
    }
    wins.push(w);
  }
  return wins;
}

export interface LeaderRow {
  key: string;
  name: string;
  boxes: number;
  byRound: Record<number, number>;
  total: number;
}

/** Winnings per person, grouped by cleaned, case-insensitive name. */
export function leaderboard(boxes: PublicBox[], wins: Win[]): LeaderRow[] {
  const rows = new Map<string, LeaderRow>();
  const get = (raw: string) => {
    const key = nameKey(raw);
    let r = rows.get(key);
    if (!r) {
      r = { key, name: cleanName(raw), boxes: 0, byRound: {}, total: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const b of boxes) if (b.name && b.status !== "open") get(b.name).boxes++;
  for (const w of wins) {
    if (!w.name) continue;
    const r = get(w.name);
    const round = w.game.round;
    r.byRound[round] = (r.byRound[round] ?? 0) + w.amount;
    r.total += w.amount;
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export interface CollectorBalance {
  collector: string;
  boxesCollected: number;
  collected: number;
  assigned: number; // winnings this collector is responsible for paying, so far
  paidOut: number;
  stillOwed: number; // assigned but not yet marked paid
  holding: number; // cash on hand = collected - paidOut
  /** Positive: this collector must receive this much to cover what they owe. Negative: surplus. */
  shortfall: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Settle-up: who has collected what, who owes which payouts, and the transfers between
 * collectors needed so each can pay the winners assigned to them.
 */
export function settleUp(pool: Pool, boxes: AdminBox[], wins: Win[], collectors: string[]) {
  const names = [...new Set([...collectors, ...boxes.map((b) => b.collected_by).filter(Boolean) as string[]])];
  const bal = new Map<string, CollectorBalance>(
    names.map((c) => [
      c,
      { collector: c, boxesCollected: 0, collected: 0, assigned: 0, paidOut: 0, stillOwed: 0, holding: 0, shortfall: 0 },
    ]),
  );
  let unassignedCollected = 0;
  for (const b of boxes) {
    if (b.status !== "paid") continue;
    const r = b.collected_by ? bal.get(b.collected_by) : undefined;
    if (r) {
      r.boxesCollected++;
      r.collected += pool.buy_in;
    } else unassignedCollected += pool.buy_in;
  }
  let unassignedPayouts = 0;
  for (const w of wins) {
    const r = w.payer ? bal.get(w.payer) : undefined;
    if (!r) {
      unassignedPayouts += w.amount;
      continue;
    }
    r.assigned += w.amount;
    if (w.paid_at) r.paidOut += w.amount;
    else r.stillOwed += w.amount;
  }
  for (const r of bal.values()) {
    r.holding = r.collected - r.paidOut;
    r.shortfall = r.assigned - r.collected;
  }
  // Greedy transfers from collectors with surplus to those short.
  const transfers: Transfer[] = [];
  const short = [...bal.values()].filter((r) => r.shortfall > 0).map((r) => ({ c: r.collector, amt: r.shortfall }));
  const surplus = [...bal.values()].filter((r) => r.shortfall < 0).map((r) => ({ c: r.collector, amt: -r.shortfall }));
  for (const s of short) {
    for (const p of surplus) {
      if (s.amt <= 0) break;
      const amt = Math.min(s.amt, p.amt);
      if (amt <= 0) continue;
      transfers.push({ from: p.c, to: s.c, amount: amt });
      s.amt -= amt;
      p.amt -= amt;
    }
  }
  const totalCollected = [...bal.values()].reduce((s, r) => s + r.collected, 0) + unassignedCollected;
  const totalAssigned = wins.reduce((s, w) => s + w.amount, 0);
  return {
    balances: [...bal.values()],
    transfers,
    totalCollected,
    totalAssigned,
    unassignedCollected,
    unassignedPayouts,
    pot: pool.buy_in * 100,
    totalPayoutsPlanned: plannedTotal(pool.payouts),
  };
}

/** Total paid out over a full tournament for a payout table. */
export function plannedTotal(payouts: Record<string, number>) {
  const counts: Record<string, number> = { "1": 32, "2": 16, "3": 8, "4": 4, "5": 2, "6": 1 };
  return Object.entries(counts).reduce((s, [r, n]) => s + Number(payouts[r] ?? 0) * n, 0);
}
