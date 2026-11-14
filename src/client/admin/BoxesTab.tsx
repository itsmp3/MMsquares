import { useMemo, useState } from "react";
import { api, boxLabel, fmtDate } from "../api";
import { Grid } from "../components/Grid";
import { cleanName, nameKey } from "../../shared/logic";
import type { AdminBox, BoxStatus } from "../../shared/types";
import type { TabProps } from "./AdminApp";

export function BoxesTab({ state, wins, reload }: TabProps) {
  const pool = state.pool!;
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const counts = { open: 0, pending: 0, claimed: 0, paid: 0 };
  for (const b of state.boxes) counts[b.status]++;
  const wonByBox = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of wins) if (w.box) m.set(w.box, (m.get(w.box) ?? 0) + w.amount);
    return m;
  }, [wins]);

  return (
    <div className="stack">
      <PendingRequests state={state} reload={reload} />
      <DrawCard state={state} counts={counts} reload={reload} />
      <section className="card">
        <div className="row-between">
          <h3>Grid</h3>
          <div className="legend">
            <span className="lg st-open">Open {counts.open}</span>
            <span className="lg st-pending">Pending {counts.pending}</span>
            <span className="lg st-claimed">Unpaid {counts.claimed}</span>
            <span className="lg st-paid">Paid {counts.paid}</span>
          </div>
          <input className="search" type="search" placeholder="Find a name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="muted small">Click any box to edit its name or payment.</p>
        <Grid
          pool={pool}
          boxes={state.boxes}
          wonByBox={wonByBox}
          highlight={search}
          selected={editing ? new Set([editing]) : undefined}
          onCellClick={(n) => setEditing(n)}
          sub={(b) => {
            const a = b as AdminBox;
            return a.status === "paid" ? [a.pay_method, a.collected_by].filter(Boolean).join(" · ") : null;
          }}
        />
      </section>
      {editing && (
        <BoxEditor
          key={editing}
          box={state.boxes[editing - 1]}
          state={state}
          onClose={() => setEditing(null)}
          reload={reload}
        />
      )}
      <NamesCard state={state} reload={reload} />
    </div>
  );
}

function PayFields({
  state,
  method,
  setMethod,
  collector,
  setCollector,
}: {
  state: TabProps["state"];
  method: string;
  setMethod: (s: string) => void;
  collector: string;
  setCollector: (s: string) => void;
}) {
  return (
    <>
      <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
        {state.payMethods.map((m) => <option key={m}>{m}</option>)}
      </select>
      <select value={collector} onChange={(e) => setCollector(e.target.value)} aria-label="Collected by">
        {state.collectors.map((c) => <option key={c} value={c}>to {c}</option>)}
      </select>
    </>
  );
}

function PendingRequests({ state, reload }: { state: TabProps["state"]; reload: () => Promise<void> }) {
  const pool = state.pool!;
  const pending = state.boxes.filter((b) => b.status === "pending");
  const [method, setMethod] = useState(state.payMethods[0] ?? "Venmo");
  const [collector, setCollector] = useState(state.me?.label ?? state.collectors[0] ?? "");
  const [busy, setBusy] = useState(false);
  if (!pending.length) return null;
  const groups = new Map<string, AdminBox[]>();
  for (const b of pending) {
    const k = nameKey(b.name);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const act = async (nums: number[], action: "approve" | "reject" | "paid") => {
    setBusy(true);
    try {
      await api(`/api/admin/boxes/${pool.id}/bulk`, { body: { nums, action, pay_method: method, collected_by: collector } });
      await reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card highlight">
      <div className="row-between">
        <h3>Requests waiting ({pending.length})</h3>
        <div className="row small">
          Mark paid as <PayFields state={state} method={method} setMethod={setMethod} collector={collector} setCollector={setCollector} />
        </div>
      </div>
      <ul className="requests">
        {[...groups.values()].map((bs) => (
          <li key={bs[0].num}>
            <div>
              <b>{cleanName(bs[0].name)}</b> · {bs.map((b) => boxLabel(b.num)).join(", ")}
              <span className="muted small"> · {fmtDate(bs[0].requested_at)}</span>
            </div>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => act(bs.map((b) => b.num), "paid")}>
                Paid ({method} to {collector})
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => act(bs.map((b) => b.num), "approve")}>
                Approve, unpaid
              </button>
              <button className="btn ghost danger" disabled={busy} onClick={() => act(bs.map((b) => b.num), "reject")}>
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DrawCard({ state, counts, reload }: { state: TabProps["state"]; counts: Record<BoxStatus, number>; reload: () => Promise<void> }) {
  const pool = state.pool!;
  const [busy, setBusy] = useState(false);
  const draw = async () => {
    const warn = [
      counts.open ? `${counts.open} boxes are still open` : "",
      counts.pending ? `${counts.pending} requests are pending` : "",
      counts.claimed ? `${counts.claimed} boxes are unpaid` : "",
    ].filter(Boolean);
    const msg = `Draw the numbers now? This locks the grid for requests and shows the digits to everyone.${
      warn.length ? `\n\nHeads up: ${warn.join(", ")}.` : ""
    }`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await api(`/api/admin/pools/${pool.id}/draw`, { body: {} });
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    if (prompt('This clears the drawn numbers. Type "undo" to confirm.') !== "undo") return;
    await api(`/api/admin/pools/${pool.id}/undraw`, { body: {} });
    await reload();
  };
  if (pool.drawn_at)
    return (
      <section className="card">
        <div className="row-between">
          <div>
            <h3>Numbers drawn</h3>
            <p className="muted small">
              {fmtDate(pool.drawn_at)} · Winning (side): {pool.row_digits!.join(" ")} · Losing (top): {pool.col_digits!.join(" ")}
            </p>
          </div>
          <button className="btn ghost danger" onClick={undo}>Undo draw</button>
        </div>
      </section>
    );
  return (
    <section className="card">
      <div className="row-between">
        <div>
          <h3>Draw numbers</h3>
          <p className="muted small">
            {counts.paid} paid · {counts.claimed} unpaid · {counts.pending} pending · {counts.open} open. Draw when the grid is full and paid.
          </p>
        </div>
        <button className="btn" disabled={busy} onClick={draw}>Draw numbers</button>
      </div>
    </section>
  );
}

function BoxEditor({ box, state, onClose, reload }: { box: AdminBox; state: TabProps["state"]; onClose: () => void; reload: () => Promise<void> }) {
  const pool = state.pool!;
  const [name, setName] = useState(box.name ?? "");
  const [status, setStatus] = useState<BoxStatus>(box.status === "open" ? "claimed" : box.status);
  const [method, setMethod] = useState(box.pay_method ?? state.payMethods[0] ?? "");
  const [collector, setCollector] = useState(box.collected_by ?? state.me?.label ?? state.collectors[0] ?? "");
  const [note, setNote] = useState(box.note ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (clear = false) => {
    if (pool.drawn_at && !confirm("Numbers are already drawn. Change this box anyway?")) return;
    setBusy(true);
    try {
      await api(`/api/admin/boxes/${pool.id}/${box.num}`, {
        method: "PUT",
        body: clear ? { name: null } : { name, status, pay_method: method, collected_by: collector, note },
      });
      await reload();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card editor">
      <div className="row-between">
        <h3>{boxLabel(box.num)}</h3>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Name
          <input list="known-names" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
          <datalist id="known-names">
            {state.knownNames.map((n) => <option key={n} value={n} />)}
          </datalist>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as BoxStatus)}>
            <option value="pending">Pending</option>
            <option value="claimed">Claimed, unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        {status === "paid" && (
          <div className="row">
            <PayFields state={state} method={method} setMethod={setMethod} collector={collector} setCollector={setCollector} />
          </div>
        )}
        <label>
          Note (admins only)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {box.paid_at && <p className="muted small">Paid {fmtDate(box.paid_at)}</p>}
        <div className="row">
          <button className="btn" disabled={busy || !cleanName(name)}>Save</button>
          {box.status !== "open" && (
            <button type="button" className="btn ghost danger" disabled={busy} onClick={() => confirm("Clear this box?") && save(true)}>
              Clear box
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function NamesCard({ state, reload }: { state: TabProps["state"]; reload: () => Promise<void> }) {
  const pool = state.pool!;
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; spellings: Set<string>; boxes: number[]; paid: number }>();
    for (const b of state.boxes) {
      if (!b.name) continue;
      const k = nameKey(b.name);
      const r = m.get(k) ?? { name: cleanName(b.name), spellings: new Set<string>(), boxes: [], paid: 0 };
      r.spellings.add(b.name);
      r.boxes.push(b.num);
      if (b.status === "paid") r.paid++;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [state.boxes]);
  const rename = async (from: string) => {
    const to = prompt(`Rename "${from}" on all of their boxes to:`, from);
    if (!to || cleanName(to) === from) return;
    await api("/api/admin/rename", { body: { pool_id: pool.id, from, to } });
    await reload();
  };
  return (
    <section className="card">
      <h3>People ({rows.length})</h3>
      <p className="muted small">
        Names are grouped ignoring capitals and extra spaces. Rename someone here to update all of their boxes at once.
      </p>
      <div className="table-scroll">
        <table className="table compact">
          <thead>
            <tr><th>Name</th><th className="r">Boxes</th><th className="r">Paid</th><th>Box numbers</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>
                  {r.name}
                  {r.spellings.size > 1 && <span className="muted small"> ({r.spellings.size} spellings)</span>}
                </td>
                <td className="r">{r.boxes.length}</td>
                <td className={`r${r.paid < r.boxes.length ? " warn" : ""}`}>{r.paid}</td>
                <td className="small">{r.boxes.join(", ")}</td>
                <td className="r"><button className="link" onClick={() => rename(r.name)}>Rename</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
