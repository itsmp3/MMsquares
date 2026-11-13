import { useMemo, useState } from "react";
import type { Pool, PublicBox } from "../../shared/types";
import { ROUNDS, ROUND_NAMES, ROUND_SHORT } from "../../shared/types";
import { leaderboard, plannedTotal, type Win } from "../../shared/logic";
import { money } from "../api";

export function Winnings({ pool, boxes, wins }: { pool: Pool; boxes: PublicBox[]; wins: Win[] }) {
  const [showAll, setShowAll] = useState(false);
  const board = useMemo(() => leaderboard(boxes, wins), [boxes, wins]);
  const paidOut = wins.reduce((s, w) => s + w.amount, 0);
  const total = plannedTotal(pool.payouts);
  const shown = showAll ? board : board.filter((r) => r.total > 0);
  const counts: Record<number, number> = { 1: 32, 2: 16, 3: 8, 4: 4, 5: 2, 6: 1 };
  return (
    <div className="stack">
      <div className="tiles">
        <div className="tile">
          <div className="label">Pot</div>
          <div className="value">{money(pool.buy_in * 100)}</div>
          <div className="muted">{money(pool.buy_in)} per box</div>
        </div>
        <div className="tile">
          <div className="label">Won so far</div>
          <div className="value">{money(paidOut)}</div>
          <div className="muted">of {money(total)}</div>
        </div>
        <div className="tile">
          <div className="label">Games decided</div>
          <div className="value">{wins.length}</div>
          <div className="muted">of 63</div>
        </div>
      </div>

      <section className="card">
        <h3>Payouts</h3>
        <table className="table compact">
          <thead>
            <tr><th>Round</th><th className="r">Per game</th><th className="r">Games</th><th className="r">Round total</th></tr>
          </thead>
          <tbody>
            {ROUNDS.map((r) => (
              <tr key={r}>
                <td>{ROUND_NAMES[r]}</td>
                <td className="r">{money(Number(pool.payouts[String(r)] ?? 0))}</td>
                <td className="r">{counts[r]}</td>
                <td className="r">{money(Number(pool.payouts[String(r)] ?? 0) * counts[r])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>Leaderboard</h3>
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show everyone
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="empty">No winners yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="r">Boxes</th>
                  {ROUNDS.map((r) => <th key={r} className="r">{ROUND_SHORT[r]}</th>)}
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key}>
                    <td>{r.name}</td>
                    <td className="r">{r.boxes}</td>
                    {ROUNDS.map((rd) => (
                      <td key={rd} className="r muted-zero">{r.byRound[rd] ? money(r.byRound[rd]) : "–"}</td>
                    ))}
                    <td className="r"><b>{money(r.total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
