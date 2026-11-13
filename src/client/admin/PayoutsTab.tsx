import { useMemo, useState } from "react";
import { api, boxLabel, fmtDate, money } from "../api";
import { ROUND_SHORT } from "../../shared/types";
import { nameKey, type Win } from "../../shared/logic";
import type { TabProps } from "./AdminApp";

export function PayoutsTab({ state, wins, reload }: TabProps) {
  const pool = state.pool!;
  const [filter, setFilter] = useState<"unpaid" | "all">("unpaid");
  const [payer, setPayer] = useState<string>("");
  const [view, setView] = useState<"person" | "game">("person");

  const list = wins.filter((w) => (filter === "all" || !w.paid_at) && (!payer || w.payer === payer));
  const owed = wins.filter((w) => !w.paid_at).reduce((s, w) => s + w.amount, 0);
  const paid = wins.filter((w) => w.paid_at).reduce((s, w) => s + w.amount, 0);

  const save = async (w: Win, patch: Partial<{ payer: string | null; paid: boolean; method: string | null; note: string | null }>) => {
    await api(`/api/admin/payouts/${pool.id}/${w.game.id}`, {
      method: "PUT",
      body: { payer: w.payer ?? null, paid: !!w.paid_at, method: w.method ?? null, note: w.note ?? null, ...patch },
    });
    await reload();
  };

  return (
    <div className="stack">
      <div className="tiles">
        <div className="tile"><div className="label">Still to pay</div><div className="value">{money(owed)}</div></div>
        <div className="tile"><div className="label">Paid out</div><div className="value">{money(paid)}</div></div>
        <div className="tile"><div className="label">Winning games</div><div className="value">{wins.length}</div></div>
      </div>
      <div className="filters">
        <label>Show <select value={filter} onChange={(e) => setFilter(e.target.value as "unpaid" | "all")}><option value="unpaid">Not paid yet</option><option value="all">Everything</option></select></label>
        <label>Paid by <select value={payer} onChange={(e) => setPayer(e.target.value)}><option value="">Anyone</option>{state.collectors.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Group by <select value={view} onChange={(e) => setView(e.target.value as "person" | "game")}><option value="person">Person</option><option value="game">Game</option></select></label>
      </div>
      <p className="muted small">Each win is paid by whoever collected that box's buy-in, unless you change it here.</p>
      {list.length === 0 ? (
        <p className="empty">Nothing to show.</p>
      ) : view === "person" ? (
        <ByPerson list={list} state={state} save={save} />
      ) : (
        <section className="card">
          <WinTable list={list} state={state} save={save} showName />
        </section>
      )}
    </div>
  );
}

type Save = (w: Win, patch: Partial<{ payer: string | null; paid: boolean; method: string | null; note: string | null }>) => Promise<void>;

function ByPerson({ list, state, save }: { list: Win[]; state: TabProps["state"]; save: Save }) {
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; wins: Win[] }>();
    for (const w of list) {
      const k = nameKey(w.name) || "(open box)";
      const g = m.get(k) ?? { name: w.name ?? "(open box)", wins: [] };
      g.wins.push(w);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => sum(b.wins) - sum(a.wins));
  }, [list]);
  return (
    <>
      {groups.map((g) => {
        const byPayer = new Map<string, number>();
        for (const w of g.wins) byPayer.set(w.payer ?? "?", (byPayer.get(w.payer ?? "?") ?? 0) + w.amount);
        return (
          <section className="card" key={g.name}>
            <div className="row-between">
              <h3>{g.name} · {money(sum(g.wins))}</h3>
              <span className="muted small">{[...byPayer].map(([p, a]) => `${p} pays ${money(a)}`).join(" · ")}</span>
            </div>
            <WinTable list={g.wins} state={state} save={save} />
          </section>
        );
      })}
    </>
  );
}

const sum = (ws: Win[]) => ws.reduce((s, w) => s + w.amount, 0);

function WinTable({ list, state, save, showName }: { list: Win[]; state: TabProps["state"]; save: Save; showName?: boolean }) {
  return (
    <div className="table-scroll">
      <table className="table compact">
        <thead>
          <tr>
            <th>Rd</th><th>Game</th><th>Box</th>{showName && <th>Winner</th>}<th className="r">Amount</th><th>Paid by</th><th>Method</th><th>Paid</th>
          </tr>
        </thead>
        <tbody>
          {list.map((w) => (
            <tr key={w.game.id}>
              <td>{ROUND_SHORT[w.game.round]}</td>
              <td className="small">{w.game.team_a} {w.game.score_a}, {w.game.team_b} {w.game.score_b}</td>
              <td className="small"><span className="code">{w.code}</span> {w.box ? boxLabel(w.box) : ""}</td>
              {showName && <td>{w.name}</td>}
              <td className="r">{money(w.amount)}</td>
              <td>
                <select value={w.payer ?? ""} onChange={(e) => save(w, { payer: e.target.value || null })} aria-label="Paid by">
                  <option value="">?</option>
                  {state.collectors.map((c) => <option key={c}>{c}</option>)}
                </select>
              </td>
              <td>
                <select value={w.method ?? ""} onChange={(e) => save(w, { method: e.target.value || null })} aria-label="Payout method">
                  <option value="">–</option>
                  {state.payMethods.map((m) => <option key={m}>{m}</option>)}
                </select>
              </td>
              <td>
                <label className="check">
                  <input type="checkbox" checked={!!w.paid_at} onChange={(e) => save(w, { paid: e.target.checked })} />
                  <span className="small muted">{w.paid_at ? fmtDate(w.paid_at) : ""}</span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
