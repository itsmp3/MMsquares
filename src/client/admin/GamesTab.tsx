import { useState } from "react";
import { api, fmtDate } from "../api";
import { ROUNDS, ROUND_NAMES, type Game } from "../../shared/types";
import { outcome } from "../../shared/logic";
import type { TabProps } from "./AdminApp";

export function GamesTab({ state, reload }: TabProps) {
  const pool = state.pool!;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const sync = async (full: boolean) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ found: number; updated: number; errors: string[]; dates: string[] }>("/api/admin/sync", {
        body: { year: pool.year, full },
      });
      setResult(
        `Checked ${r.dates.length} day${r.dates.length === 1 ? "" : "s"}: ${r.found} games found, ${r.updated} saved.` +
          (r.errors.length ? ` Errors: ${r.errors.join("; ")}` : ""),
      );
      await reload();
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rounds = ROUNDS.filter((r) => state.games.some((g) => g.round === r));
  const finals = state.games.filter((g) => g.status === "final").length;

  return (
    <div className="stack">
      <section className="card">
        <div className="row-between">
          <div>
            <h3>Score updates</h3>
            <p className="muted small">
              Scores come from ESPN automatically every 10 minutes during the tournament. Games you edit by hand are locked so the automatic update won't overwrite them.
              {state.lastSync && <> Last update: {fmtDate(state.lastSync.at)}.</>}
            </p>
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => sync(false)}>Update now</button>
            <button className="btn ghost" disabled={busy} onClick={() => sync(true)}>Reload whole tournament</button>
          </div>
        </div>
        {result && <p className="note">{result}</p>}
        <p className="small">{state.games.length} games loaded · {finals} final</p>
      </section>

      {rounds.map((r) => (
        <section className="card" key={r}>
          <h3>{ROUND_NAMES[r]}</h3>
          <ul className="games admin-games">
            {state.games
              .filter((g) => g.round === r)
              .map((g) =>
                editing === g.id ? (
                  <GameEditor key={g.id} g={g} games={state.games} onDone={async () => { setEditing(null); await reload(); }} />
                ) : (
                  <li key={g.id} className={`game st-${g.status}`}>
                    <span className="teams">
                      <span className="team">{g.seed_a != null && <span className="seed">{g.seed_a}</span>}{g.team_a}<span className="score">{g.score_a ?? ""}</span></span>
                      <span className="team">{g.seed_b != null && <span className="seed">{g.seed_b}</span>}{g.team_b}<span className="score">{g.score_b ?? ""}</span></span>
                    </span>
                    <span className="outcome">
                      <span className={`pill ${g.status}`}>{g.status === "void" ? "no contest" : g.status}</span>
                      {g.status === "final" && <span className="code">{outcome(g)?.code}</span>}
                      {g.manual ? <span className="pill" title="Edited by hand; automatic updates skip this game">🔒 manual</span> : null}
                      <button className="link" onClick={() => setEditing(g.id)}>Edit</button>
                    </span>
                  </li>
                ),
              )}
          </ul>
        </section>
      ))}

      <section className="card">
        {adding ? (
          <AddGame year={pool.year} onDone={async () => { setAdding(false); await reload(); }} />
        ) : (
          <button className="btn ghost" onClick={() => setAdding(true)}>Add a game by hand</button>
        )}
      </section>
    </div>
  );
}

function GameEditor({ g, games, onDone }: { g: Game; games: Game[]; onDone: () => Promise<void> }) {
  const [a, setA] = useState(g.score_a?.toString() ?? "");
  const [b, setB] = useState(g.score_b?.toString() ?? "");
  const [status, setStatus] = useState(g.status);
  const [target, setTarget] = useState<string>(g.payout_to_game_id?.toString() ?? "");
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const save = async (unlock = false) => {
    await api(`/api/admin/games/${g.id}`, {
      method: "PUT",
      body: unlock
        ? { manual: false }
        : { score_a: num(a), score_b: num(b), status, payout_to_game_id: target ? Number(target) : null, manual: true },
    });
    await onDone();
  };
  const remove = async () => {
    if (!confirm("Delete this game?")) return;
    await api(`/api/admin/games/${g.id}`, { method: "DELETE" });
    await onDone();
  };
  return (
    <li className="game editing">
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="row">
          <label>{g.team_a}<input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} size={4} /></label>
          <label>{g.team_b}<input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} size={4} /></label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as Game["status"])}>
              <option value="scheduled">Scheduled</option>
              <option value="live">Live</option>
              <option value="final">Final</option>
              <option value="void">No contest</option>
            </select>
          </label>
          {status === "void" && (
            <label>
              Move payout to
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Championship game</option>
                {games.filter((x) => x.id !== g.id && x.status !== "void").map((x) => (
                  <option key={x.id} value={x.id}>{ROUND_NAMES[x.round]}: {x.team_a} vs {x.team_b}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="row">
          <button className="btn">Save</button>
          {g.manual ? <button type="button" className="btn ghost" onClick={() => save(true)}>Unlock (let ESPN update it)</button> : null}
          <button type="button" className="btn ghost" onClick={() => onDone()}>Cancel</button>
          <button type="button" className="btn ghost danger" onClick={remove}>Delete</button>
        </div>
      </form>
    </li>
  );
}

function AddGame({ year, onDone }: { year: number; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ round: "1", team_a: "", team_b: "", score_a: "", score_b: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/admin/games", {
      body: {
        year,
        round: Number(f.round),
        team_a: f.team_a,
        team_b: f.team_b,
        score_a: f.score_a ? Number(f.score_a) : null,
        score_b: f.score_b ? Number(f.score_b) : null,
      },
    });
    await onDone();
  };
  return (
    <form className="form" onSubmit={save}>
      <h3>Add a game</h3>
      <div className="row">
        <label>Round<select value={f.round} onChange={set("round")}>{ROUNDS.map((r) => <option key={r} value={r}>{ROUND_NAMES[r]}</option>)}</select></label>
        <label>Team<input value={f.team_a} onChange={set("team_a")} /></label>
        <label>Score<input inputMode="numeric" size={4} value={f.score_a} onChange={set("score_a")} /></label>
        <label>Team<input value={f.team_b} onChange={set("team_b")} /></label>
        <label>Score<input inputMode="numeric" size={4} value={f.score_b} onChange={set("score_b")} /></label>
      </div>
      <div className="row">
        <button className="btn" disabled={!f.team_a || !f.team_b}>Add</button>
        <button type="button" className="btn ghost" onClick={() => onDone()}>Cancel</button>
      </div>
    </form>
  );
}
