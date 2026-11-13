import type { Game, Pool, PublicBox } from "../../shared/types";
import { ROUND_NAMES } from "../../shared/types";
import { boxForCode, outcome, type Win } from "../../shared/logic";
import { boxLabel, money } from "../api";

/** Games by round, newest round first, with the box each one landed on. */
export function Results({ pool, boxes, games, wins }: { pool: Pool; boxes: PublicBox[]; games: Game[]; wins: Win[] }) {
  if (!games.length)
    return <p className="empty">No games yet. Scores show up here automatically once the tournament starts.</p>;
  const winByGame = new Map(wins.map((w) => [w.game.id, w]));
  const byId = new Map(games.map((g) => [g.id, g]));
  const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => b - a);
  return (
    <div className="results">
      {rounds.map((r) => {
        const rg = games.filter((g) => g.round === r);
        const done = rg.filter((g) => g.status === "final" || g.status === "void").length;
        return (
          <section key={r} className="card">
            <h3>
              {ROUND_NAMES[r]} <span className="muted">· {money(Number(pool.payouts[String(r)] ?? 0))} per game · {done}/{rg.length} final</span>
            </h3>
            <ul className="games">
              {rg.map((g) => (
                <GameRow key={g.id} g={g} pool={pool} boxes={boxes} win={winByGame.get(g.id)} target={g.payout_to_game_id ? byId.get(g.payout_to_game_id) : undefined} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function team(name: string, seed: number | null, score: number | null, bold: boolean) {
  return (
    <span className={bold ? "team w" : "team"}>
      {seed != null && <span className="seed">{seed}</span>}
      {name}
      <span className="score">{score ?? ""}</span>
    </span>
  );
}

function GameRow({ g, pool, boxes, win, target }: { g: Game; pool: Pool; boxes: PublicBox[]; win?: Win; target?: Game }) {
  const o = outcome(g);
  const aWin = o && g.status === "final" && g.score_a! > g.score_b!;
  const bWin = o && g.status === "final" && g.score_b! > g.score_a!;
  let right: React.ReactNode = <span className="muted">{g.status_detail ?? "Scheduled"}</span>;
  if (g.status === "void") {
    right = (
      <span className="muted">
        No contest · payout moved to {target ? `${target.team_a} vs ${target.team_b}` : "the championship"}
      </span>
    );
  } else if (g.status === "live" && o) {
    const box = boxForCode(pool, o.code);
    right = (
      <span>
        <span className="pill live">Live</span> {g.status_detail} · currently{" "}
        {box ? `${boxLabel(box)} (${boxes[box - 1]?.name ?? "open"})` : `code ${o.code}`}
      </span>
    );
  } else if (g.status === "final" && win) {
    right = (
      <span>
        <span className="code" title="Losing digit, winning digit">{win.code}</span>{" "}
        {win.box ? <>{boxLabel(win.box)} · <b>{win.name ?? "Open box"}</b></> : "Digits not drawn"}{" "}
        <span className="amt">{money(win.amount)}</span>
        {win.carried > 0 && <span className="muted"> (includes {money(win.carried)} carried over)</span>}
      </span>
    );
  }
  return (
    <li className={`game st-${g.status}`}>
      <span className="teams">
        {team(g.team_a, g.seed_a, g.score_a, !!aWin)}
        {team(g.team_b, g.seed_b, g.score_b, !!bWin)}
      </span>
      <span className="outcome">{right}</span>
    </li>
  );
}
