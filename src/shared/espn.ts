import type { GameStatus } from "./types";

export const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

/** Scoreboard URL for one day of the men's NCAA tournament (groups=100). */
export function scoreboardUrl(yyyymmdd: string) {
  return `${ESPN_SCOREBOARD}?dates=${yyyymmdd}&groups=100&limit=100`;
}

export interface ParsedGame {
  espn_id: string;
  year: number;
  round: number;
  region: string | null;
  start_time: string;
  team_a: string;
  seed_a: number | null;
  score_a: number | null;
  team_b: string;
  seed_b: number | null;
  score_b: number | null;
  status: GameStatus;
  status_detail: string | null;
}

const ROUND_MAP: [RegExp, number][] = [
  [/1st round|first round/i, 1],
  [/2nd round|second round/i, 2],
  [/sweet 16|sweet sixteen|regional semifinal/i, 3],
  [/elite 8|elite eight|regional final/i, 4],
  [/final four|national semifinal/i, 5],
  [/national championship|championship game/i, 6],
];

/** Round number from an ESPN note like "Men's Basketball Championship - East Region - 1st Round". */
export function roundFromHeadline(headline: string): number | null {
  const last = headline.split(" - ").pop() ?? "";
  if (/first four/i.test(last)) return null;
  for (const [re, r] of ROUND_MAP) if (re.test(last)) return r;
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Parse an ESPN scoreboard response into tournament games (Round of 64 onward). */
export function parseScoreboard(json: any): ParsedGame[] {
  const out: ParsedGame[] = [];
  for (const e of json?.events ?? []) {
    const c = e?.competitions?.[0];
    if (!c) continue;
    const headline: string = c.notes?.[0]?.headline ?? "";
    if (!/championship/i.test(headline) || /women/i.test(headline)) continue;
    const round = roundFromHeadline(headline);
    if (round == null) continue;
    const region = headline.match(/- ([A-Za-z ]+) Region -/)?.[1] ?? null;
    const teams = (c.competitors ?? []).slice().sort((x: any, y: any) => (x.order ?? 0) - (y.order ?? 0));
    if (teams.length !== 2) continue;
    const [a, b] = teams;
    const state: string = e.status?.type?.state ?? c.status?.type?.state ?? "pre";
    const completed: boolean = e.status?.type?.completed ?? false;
    const status: GameStatus = completed ? "final" : state === "in" ? "live" : "scheduled";
    const num = (v: any) => (v == null || v === "" ? null : Number(v));
    const seed = (t: any) => num(t.curatedRank?.current) ?? num(t.seed);
    const name = (t: any) => t.team?.shortDisplayName ?? t.team?.displayName ?? "TBD";
    out.push({
      espn_id: String(e.id),
      year: Number(String(e.date).slice(0, 4)),
      round,
      region,
      start_time: e.date,
      team_a: name(a),
      seed_a: seed(a) && seed(a)! <= 16 ? seed(a) : null,
      score_a: status === "scheduled" ? null : num(a.score),
      team_b: name(b),
      seed_b: seed(b) && seed(b)! <= 16 ? seed(b) : null,
      score_b: status === "scheduled" ? null : num(b.score),
      status,
      status_detail: e.status?.type?.shortDetail ?? null,
    });
  }
  return out;
}

/** YYYYMMDD in US Eastern time for a Date, optionally offset by days. */
export function easternDate(d: Date, offsetDays = 0): string {
  const shifted = new Date(d.getTime() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Every date in the tournament window for a year (mid-March through ~April 10). */
export function tournamentDates(year: number): string[] {
  const out: string[] = [];
  for (let d = new Date(Date.UTC(year, 2, 15)); d <= new Date(Date.UTC(year, 3, 10)); d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return out;
}
