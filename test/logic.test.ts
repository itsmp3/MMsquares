import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseScoreboard, roundFromHeadline, tournamentDates } from "../src/shared/espn";
import {
  boxForCode,
  cleanName,
  computeWins,
  digitsForBox,
  fmtScore,
  leaderboard,
  nameKey,
  outcome,
  payoutAmounts,
  plannedTotal,
  settleUp,
  shuffleDigits,
} from "../src/shared/logic";
import type { AdminBox, Game, Pool } from "../src/shared/types";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/espn-2026.json", import.meta.url), "utf8"));
const PAYOUTS = { "1": 25, "2": 50, "3": 100, "4": 200, "5": 400, "6": 1000 };

function toGames(parsed: ReturnType<typeof parseScoreboard>): Game[] {
  return parsed.map((p, i) => ({
    ...p,
    id: i + 1,
    manual: 0,
    payout_to_game_id: null,
    updated_at: "",
  }));
}

/** 2026 codes from the imported history spreadsheet. */
function history2026(): string[] {
  const sql = readFileSync(new URL("../seed/history.sql", import.meta.url), "utf8");
  return [...sql.matchAll(/\(2026,\d+,\d+,'(\d\d)'\)/g)].map((m) => m[1]);
}

describe("names", () => {
  it("cleans stray whitespace and groups case-insensitively", () => {
    expect(cleanName("  Tina   Gatto ")).toBe("Tina Gatto");
    expect(nameKey("Dinelli ")).toBe(nameKey("dinelli"));
  });
});

describe("box codes", () => {
  it("is winning digit then losing digit, shown with a dash", () => {
    // 2025 title game: Florida 65, Houston 63 -> "53", shown "5-3"
    expect(outcome({ team_a: "Florida", score_a: 65, team_b: "Houston", score_b: 63 })!.code).toBe("53");
    expect(outcome({ team_a: "Purdue", score_a: 60, team_b: "UConn", score_b: 75 })!.code).toBe("50");
    expect(fmtScore("31")).toBe("3-1");
  });

  it("maps codes to box numbers using the drawn digits", () => {
    const pool = { col_digits: [7, 1, 5, 3, 9, 2, 8, 6, 4, 0], row_digits: [5, 1, 3, 6, 8, 2, 0, 4, 7, 9] };
    expect(boxForCode(pool, "75")).toBe(1); // top-left: winner 7, loser 5
    expect(boxForCode(pool, "15")).toBe(2);
    expect(boxForCode(pool, "09")).toBe(100);
    expect(digitsForBox(pool, 2)).toEqual({ loser: 5, winner: 1 });
    expect(boxForCode({ col_digits: null, row_digits: null }, "15")).toBeNull();
  });

  it("shuffles into a permutation of 0-9", () => {
    expect([...shuffleDigits()].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("ESPN parsing", () => {
  const games = parseScoreboard(fixture);

  it("finds all 63 games (no First Four) with the right round counts", () => {
    expect(games).toHaveLength(63);
    const counts = [1, 2, 3, 4, 5, 6].map((r) => games.filter((g) => g.round === r).length);
    expect(counts).toEqual([32, 16, 8, 4, 2, 1]);
    expect(games.every((g) => g.status === "final")).toBe(true);
  });

  it("produces the same box codes as the 2026 history sheet", () => {
    const codes = games.map((g) => outcome(g)!.code).sort();
    expect(codes).toEqual(history2026().sort());
  });

  it("reads round names", () => {
    expect(roundFromHeadline("Men's Basketball Championship - East Region - 1st Round")).toBe(1);
    expect(roundFromHeadline("Men's Basketball Championship - First Four")).toBeNull();
    expect(roundFromHeadline("Men's Basketball Championship - National Championship")).toBe(6);
    expect(tournamentDates(2027)[0]).toBe("20270315");
  });
});

describe("payouts", () => {
  it("pays out the full $5,000 pot", () => {
    expect(plannedTotal(PAYOUTS)).toBe(5000);
  });

  it("moves a void game's payout to the championship by default", () => {
    const games = toGames(parseScoreboard(fixture));
    games[0].status = "void";
    const champ = games.find((g) => g.round === 6)!;
    const { base, carried } = payoutAmounts({ payouts: PAYOUTS }, games);
    expect(base.get(games[0].id)).toBe(0);
    expect(carried.get(champ.id)).toBe(25);
    games[0].payout_to_game_id = games[1].id;
    expect(payoutAmounts({ payouts: PAYOUTS }, games).carried.get(games[1].id)).toBe(25);
  });
});

// Reproduces the 2026 Winnings tab from the real pool data. The data has people's names, so it
// is kept out of git (seed/private/); this test only runs where that file exists.
const privatePath = new URL("../seed/private/2026.json", import.meta.url);
describe.skipIf(!existsSync(privatePath))("2026 pool matches the spreadsheet", () => {
  const data = existsSync(privatePath) ? JSON.parse(readFileSync(privatePath, "utf8")) : null;
  const pool: Pool = {
    id: 1,
    year: 2026,
    name: "$50 Pool",
    buy_in: 50,
    payouts: PAYOUTS,
    col_digits: data?.pool.col,
    row_digits: data?.pool.row,
    drawn_at: "x",
    is_current: 1,
  };
  const boxes: AdminBox[] = (data?.pool.boxes ?? []).map((b: any) => ({
    num: b.num,
    name: b.name,
    status: "paid",
    requested_at: null,
    pay_method: b.method,
    collected_by: b.collector,
    paid_at: "x",
    note: null,
  }));
  const games = toGames(parseScoreboard(fixture));
  const wins = computeWins(pool, boxes, games);

  it("every person's winnings match", () => {
    const board = leaderboard(boxes, wins);
    for (const [name, exp] of Object.entries<any>(data.winnings)) {
      const row = board.find((r) => r.key === nameKey(name));
      expect({ name, total: row?.total ?? 0 }).toEqual({ name, total: exp.total });
      expect([1, 2, 3, 4, 5, 6].map((r) => row?.byRound[r] ?? 0)).toEqual(exp.rounds);
    }
    expect(wins.reduce((s, w) => s + w.amount, 0)).toBe(5000);
  });

  it("counts a name with a trailing space as the same person", () => {
    const tina = leaderboard(boxes, wins).find((r) => r.key === "tina gatto");
    expect(tina?.boxes).toBe(1); // the sheet showed 0 because of "Tina Gatto "
  });

  it("settles up: collections and payouts balance", () => {
    const s = settleUp(pool, boxes, wins, ["MP", "ATM"]);
    expect(s.totalCollected).toBe(5000);
    expect(s.totalAssigned).toBe(5000);
    const net = s.balances.reduce((acc, b) => acc + b.shortfall, 0);
    expect(net).toBe(0);
    const t = s.transfers.reduce((acc, x) => acc + x.amount, 0);
    expect(t).toBe(Math.abs(s.balances.find((b) => b.collector === "MP")!.shortfall));
  });
});
