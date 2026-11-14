import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, boxLabel, fmtDate, getHistory, getPublicState, type PublicState } from "./api";
import { Grid } from "./components/Grid";
import { Results } from "./components/Results";
import { Winnings } from "./components/Winnings";
import { History } from "./components/History";
import { ScoreKey } from "./components/ScoreKey";
import { Header, Tabs, useHashTab, usePoolParam } from "./components/Layout";
import { boxForCode, computeWins, outcome } from "../shared/logic";
import type { HistoryYear } from "../shared/types";

const TABS = ["grid", "results", "winnings", "history"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { grid: "Grid", results: "Results", winnings: "Winnings", history: "History" };

export function PublicApp() {
  const [tab, setTab] = useHashTab(TABS, "grid");
  const [poolId, setPoolId] = usePoolParam();
  const [state, setState] = useState<PublicState | null>(null);
  const [history, setHistory] = useState<HistoryYear[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getPublicState(poolId)
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [poolId]);

  useEffect(() => {
    load();
    // Refresh every minute so live scores move along.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (tab === "history" && !history) getHistory().then((h) => setHistory(h.years)).catch((e) => setError(e.message));
  }, [tab, history]);

  const pool = state?.pool ?? null;
  const wins = useMemo(() => (pool && state ? computeWins(pool, state.boxes, state.games) : []), [pool, state]);
  const wonByBox = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of wins) if (w.box) m.set(w.box, (m.get(w.box) ?? 0) + w.amount);
    return m;
  }, [wins]);
  const liveBoxes = useMemo(() => {
    const s = new Set<number>();
    if (!pool || !state) return s;
    for (const g of state.games) {
      const o = g.status === "live" ? outcome(g) : null;
      const n = o ? boxForCode(pool, o.code) : null;
      if (n) s.add(n);
    }
    return s;
  }, [pool, state]);

  return (
    <div className="app">
      <Header
        title={pool ? `${pool.year} March Madness Squares` : "March Madness Squares"}
        subtitle={pool ? `${pool.name} · $${pool.buy_in} per box` : undefined}
        pools={state?.pools}
        poolId={pool?.id}
        onPool={(id) => setPoolId(id)}
      />
      <Tabs tabs={TABS} labels={LABELS} tab={tab} onTab={setTab} />
      <main>
        {error && <div className="alert">{error}</div>}
        {!state ? (
          <p className="empty">Loading…</p>
        ) : tab === "history" ? (
          history ? <History years={history} pool={pool} boxes={state.boxes} /> : <p className="empty">Loading…</p>
        ) : !pool ? (
          <p className="empty">No pool has been set up yet.</p>
        ) : tab === "grid" ? (
          <GridTab state={state} wonByBox={wonByBox} liveBoxes={liveBoxes} onChange={load} />
        ) : tab === "results" ? (
          <Results pool={pool} boxes={state.boxes} games={state.games} wins={wins} />
        ) : (
          <Winnings pool={pool} boxes={state.boxes} wins={wins} />
        )}
      </main>
    </div>
  );
}

function GridTab({
  state,
  wonByBox,
  liveBoxes,
  onChange,
}: {
  state: PublicState;
  wonByBox: Map<number, number>;
  liveBoxes: Set<number>;
  onChange: () => void;
}) {
  const pool = state.pool!;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canRequest = !!pool.is_current && !pool.drawn_at;
  const counts = { open: 0, pending: 0, claimed: 0, paid: 0 };
  for (const b of state.boxes) counts[b.status]++;

  const toggle = (n: number) => {
    setMsg(null);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ requested: number[] }>("/api/request", { body: { pool_id: pool.id, nums: [...selected], name } });
      setMsg({
        ok: true,
        text: `Requested ${r.requested.map(boxLabel).join(", ")} for ${name.trim()}. They'll show as pending until payment is confirmed.`,
      });
      setSelected(new Set());
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Something went wrong." });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="grid-bar">
        <div className="legend">
          <span className="lg st-open">Open {counts.open}</span>
          <span className="lg st-pending">Pending {counts.pending}</span>
          <span className="lg st-claimed">Unpaid {counts.claimed}</span>
          <span className="lg st-paid">Paid {counts.paid}</span>
        </div>
        <input
          className="search"
          type="search"
          placeholder="Find a name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Highlight a name"
        />
      </div>
      {!pool.drawn_at ? (
        <p className="note">
          Numbers are drawn once the grid is full. {canRequest && "Tap open boxes to pick yours, then enter your name below."}
        </p>
      ) : (
        <>
          <p className="note muted">Numbers drawn {fmtDate(pool.drawn_at)}.</p>
          <ScoreKey />
        </>
      )}
      <Grid
        pool={pool}
        boxes={state.boxes}
        wonByBox={wonByBox}
        liveBoxes={liveBoxes}
        selected={selected}
        highlight={search}
        onCellClick={canRequest ? toggle : undefined}
        clickable={(b) => b.status === "open"}
      />
      {canRequest && (
        <form className={`request card${selected.size ? " active" : ""}`} onSubmit={submit}>
          <div>
            <b>{selected.size ? `${selected.size} box${selected.size > 1 ? "es" : ""} selected` : "No boxes selected"}</b>
            {selected.size > 0 && <span className="muted"> · {[...selected].sort((a, b) => a - b).map(boxLabel).join(", ")}</span>}
          </div>
          <div className="row">
            <input
              placeholder="Your name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              aria-label="Your name"
            />
            <button className="btn" disabled={busy || !selected.size || !name.trim()}>
              Request {selected.size > 1 ? "boxes" : "box"}
            </button>
            {selected.size > 0 && (
              <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            )}
          </div>
          {msg && <div className={msg.ok ? "ok" : "alert"}>{msg.text}</div>}
        </form>
      )}
    </div>
  );
}
