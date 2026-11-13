import { useEffect, useState } from "react";
import { api, fmtDate, money } from "../api";
import { ROUNDS, ROUND_NAMES } from "../../shared/types";
import { plannedTotal } from "../../shared/logic";
import type { TabProps } from "./AdminApp";

const DEFAULT_PAYOUTS = { "1": 25, "2": 50, "3": 100, "4": 200, "5": 400, "6": 1000 };

function PayoutInputs({ value, onChange }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  return (
    <div className="payout-inputs">
      {ROUNDS.map((r) => (
        <label key={r}>
          {ROUND_NAMES[r]}
          <input
            inputMode="numeric"
            value={value[String(r)] ?? 0}
            onChange={(e) => onChange({ ...value, [String(r)]: Number(e.target.value.replace(/\D/g, "")) || 0 })}
          />
        </label>
      ))}
    </div>
  );
}

export function SetupTab({ state, reload }: TabProps) {
  const pool = state.pool;
  return (
    <div className="stack">
      {pool && <EditPool key={pool.id} state={state} reload={reload} />}
      <NewPool state={state} reload={reload} />
      <Lists state={state} reload={reload} />
      <AuditLog />
    </div>
  );
}

function EditPool({ state, reload }: { state: TabProps["state"]; reload: () => Promise<void> }) {
  const pool = state.pool!;
  const [name, setName] = useState(pool.name);
  const [buyIn, setBuyIn] = useState(pool.buy_in);
  const [payouts, setPayouts] = useState<Record<string, number>>(pool.payouts);
  const [saved, setSaved] = useState(false);
  const total = plannedTotal(payouts);
  const save = async (makeCurrent = false) => {
    await api(`/api/admin/pools/${pool.id}`, { method: "PUT", body: { name, buy_in: buyIn, payouts, make_current: makeCurrent } });
    setSaved(true);
    await reload();
  };
  return (
    <section className="card">
      <div className="row-between">
        <h3>{pool.year} · {pool.name}</h3>
        {pool.is_current ? <span className="pill final">Current pool</span> : <button className="btn ghost" onClick={() => save(true)}>Make this the current pool</button>}
      </div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="row">
          <label>Name<input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></label>
          <label>Buy-in per box<input inputMode="numeric" value={buyIn} onChange={(e) => { setBuyIn(Number(e.target.value.replace(/\D/g, "")) || 0); setSaved(false); }} /></label>
        </div>
        <h4>Payout per game</h4>
        <PayoutInputs value={payouts} onChange={(v) => { setPayouts(v); setSaved(false); }} />
        <p className={total === buyIn * 100 ? "muted small" : "warn small"}>
          All 63 games pay {money(total)}; a full grid collects {money(buyIn * 100)}.
          {total !== buyIn * 100 && " These don't match."}
        </p>
        <div className="row">
          <button className="btn">Save</button>
          {saved && <span className="ok small">Saved</span>}
        </div>
      </form>
    </section>
  );
}

function NewPool({ state, reload }: { state: TabProps["state"]; reload: () => Promise<void> }) {
  const last = state.pool;
  const [open, setOpen] = useState(!last);
  const [year, setYear] = useState((last?.year ?? new Date().getFullYear() - 1) + 1);
  const [name, setName] = useState(last?.name ?? "$50 Pool");
  const [buyIn, setBuyIn] = useState(last?.buy_in ?? 50);
  const [payouts, setPayouts] = useState<Record<string, number>>(last?.payouts ?? DEFAULT_PAYOUTS);
  const [current, setCurrent] = useState(true);
  if (!open)
    return (
      <section className="card">
        <button className="btn ghost" onClick={() => setOpen(true)}>Start a new pool…</button>
      </section>
    );
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api<{ id: number }>("/api/admin/pools", { body: { year, name, buy_in: buyIn, payouts, make_current: current } });
    const u = new URL(location.href);
    u.searchParams.set("pool", String(r.id));
    u.hash = "boxes";
    location.href = u.toString();
  };
  return (
    <section className="card">
      <h3>New pool</h3>
      <p className="muted small">For next year's grid, or a second grid (like the $25 pool) in the same year. Scores are shared by every pool in a year.</p>
      <form className="form" onSubmit={create}>
        <div className="row">
          <label>Year<input inputMode="numeric" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} /></label>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Buy-in per box<input inputMode="numeric" value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value.replace(/\D/g, "")) || 0)} /></label>
        </div>
        <h4>Payout per game</h4>
        <PayoutInputs value={payouts} onChange={setPayouts} />
        <p className="muted small">All 63 games pay {money(plannedTotal(payouts))}; a full grid collects {money(buyIn * 100)}.</p>
        <label className="check"><input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} /> Make it the current pool (what the public page shows)</label>
        <div className="row">
          <button className="btn">Create pool</button>
          {last && <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}

function Lists({ state, reload }: { state: TabProps["state"]; reload: () => Promise<void> }) {
  const [collectors, setCollectors] = useState(state.collectors.join(", "));
  const [methods, setMethods] = useState(state.payMethods.join(", "));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    await api("/api/admin/settings", { method: "PUT", body: { collectors: split(collectors), pay_methods: split(methods) } });
    await reload();
  };
  return (
    <section className="card">
      <h3>Lists</h3>
      <form className="form" onSubmit={save}>
        <label>Who collects money (comma separated)<input value={collectors} onChange={(e) => setCollectors(e.target.value)} /></label>
        <label>Payment methods<input value={methods} onChange={(e) => setMethods(e.target.value)} /></label>
        <div className="row"><button className="btn">Save lists</button></div>
      </form>
    </section>
  );
}

function AuditLog() {
  const [entries, setEntries] = useState<{ id: number; at: string; actor: string; action: string; detail: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !entries) api<{ entries: typeof entries }>("/api/admin/audit").then((r) => setEntries(r.entries));
  }, [open, entries]);
  return (
    <section className="card">
      <div className="row-between">
        <h3>Activity log</h3>
        <button className="btn ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>
      </div>
      {open && (
        <div className="table-scroll">
          <table className="table compact">
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="small">{fmtDate(e.at)}</td>
                  <td className="small">{e.actor}</td>
                  <td>{e.action}</td>
                  <td className="small mono">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
