export type BoxStatus = "open" | "pending" | "claimed" | "paid";
export type GameStatus = "scheduled" | "live" | "final" | "void";

export const ROUND_NAMES: Record<number, string> = {
  1: "Round of 64",
  2: "Round of 32",
  3: "Sweet 16",
  4: "Elite 8",
  5: "Final Four",
  6: "Championship",
};
export const ROUND_SHORT: Record<number, string> = {
  1: "R64",
  2: "R32",
  3: "S16",
  4: "E8",
  5: "F4",
  6: "NCG",
};
export const ROUNDS = [1, 2, 3, 4, 5, 6] as const;

export interface Pool {
  id: number;
  year: number;
  name: string;
  buy_in: number;
  payouts: Record<string, number>;
  col_digits: number[] | null; // winning team, across the top
  row_digits: number[] | null; // losing team, down the side
  drawn_at: string | null;
  is_current: number;
}

/** Box as the public sees it. */
export interface PublicBox {
  num: number;
  name: string | null;
  status: BoxStatus;
}

/** Box with admin-only payment fields. */
export interface AdminBox extends PublicBox {
  requested_at: string | null;
  pay_method: string | null;
  collected_by: string | null;
  paid_at: string | null;
  note: string | null;
}

export interface Game {
  id: number;
  year: number;
  espn_id: string | null;
  round: number;
  region: string | null;
  start_time: string | null;
  team_a: string;
  seed_a: number | null;
  score_a: number | null;
  team_b: string;
  seed_b: number | null;
  score_b: number | null;
  status: GameStatus;
  status_detail: string | null;
  manual: number;
  payout_to_game_id: number | null;
  updated_at: string;
}

export interface PayoutRow {
  pool_id: number;
  game_id: number;
  payer: string | null;
  paid_at: string | null;
  method: string | null;
  note: string | null;
}

export interface HistoryYear {
  year: number;
  /** Codes in game order; null for a no-contest. */
  games: { round: number; code: string | null }[];
  in_progress?: boolean;
}
