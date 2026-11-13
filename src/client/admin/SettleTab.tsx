import { boxLabel, money } from "../api";
import { cleanName, settleUp } from "../../shared/logic";
import type { TabProps } from "./AdminApp";

export function SettleTab({ state, wins }: TabProps) {
  const pool = state.pool!;
  const s = settleUp(pool, state.boxes, wins, state.collectors);
  const unpaidBoxes = state.boxes.filter((b) => b.status === "claimed" || b.status === "pending");
  const methods = new Map<string, number>();
  for (const b of state.boxes) {
    if (b.status !== "paid") continue;
    const k = `${b.pay_method ?? "?"} to ${b.collected_by ?? "?"}`;
    methods.set(k, (methods.get(k) ?? 0) + 1);
  }
  const remaining = s.totalPayoutsPlanned - s.totalAssigned;

  return (
    <div className="stack">
      <section className="card highlight">
        <h3>Money to move between you</h3>
        {s.transfers.length ? (
          s.transfers.map((t) => (
            <p key={`${t.from}-${t.to}`} className="big">
              <b>{t.from}</b> sends <b>{t.to}</b> {money(t.amount)}
            </p>
          ))
        ) : (
          <p className="big">No transfer needed right now.</p>
        )}
        <p className="muted small">
          Based on the {wins.length} games decided so far. Each of you pays the winners of the boxes you collected for, and this is
          what one of you needs to send the other to cover it. {remaining > 0 && <>{money(remaining)} in payouts is still to be decided, so this will change.</>}
        </p>
      </section>

      <div className="tiles">
        {s.balances.map((b) => (
          <div className="tile wide" key={b.collector}>
            <div className="label">{b.collector}</div>
            <table className="table compact plain">
              <tbody>
                <tr><td>Collected ({b.boxesCollected} boxes)</td><td className="r">{money(b.collected)}</td></tr>
                <tr><td>Winnings to pay so far</td><td className="r">{money(b.assigned)}</td></tr>
                <tr><td>Already paid out</td><td className="r">{money(b.paidOut)}</td></tr>
                <tr><td>Still to pay</td><td className="r">{money(b.stillOwed)}</td></tr>
                <tr><td><b>Cash on hand</b></td><td className="r"><b>{money(b.holding)}</b></td></tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <section className="card">
        <h3>Pot check</h3>
        <table className="table compact plain">
          <tbody>
            <tr><td>Full pot (100 × {money(pool.buy_in)})</td><td className="r">{money(s.pot)}</td></tr>
            <tr><td>Collected</td><td className="r">{money(s.totalCollected)}</td></tr>
            <tr><td>Total payouts if all 63 games are played</td><td className={`r${s.totalPayoutsPlanned !== s.pot ? " warn" : ""}`}>{money(s.totalPayoutsPlanned)}</td></tr>
            <tr><td>Won so far</td><td className="r">{money(s.totalAssigned)}</td></tr>
            {s.unassignedCollected > 0 && <tr><td className="warn">Paid boxes with no collector set</td><td className="r warn">{money(s.unassignedCollected)}</td></tr>}
            {s.unassignedPayouts > 0 && <tr><td className="warn">Winnings with no payer (open boxes or missing collector)</td><td className="r warn">{money(s.unassignedPayouts)}</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>How people paid</h3>
        <ul className="plain">
          {[...methods].sort((a, b) => b[1] - a[1]).map(([k, n]) => <li key={k}>{k}: {n}</li>)}
        </ul>
      </section>

      {unpaidBoxes.length > 0 && (
        <section className="card">
          <h3>Still owe their buy-in ({unpaidBoxes.length})</h3>
          <ul className="plain">
            {unpaidBoxes.map((b) => (
              <li key={b.num}>{boxLabel(b.num)} · {cleanName(b.name)} {b.status === "pending" && <span className="muted">(pending)</span>}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
