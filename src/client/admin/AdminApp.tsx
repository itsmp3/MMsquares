import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getAdminState, type AdminState } from "../api";
import { Header, Tabs, useHashTab, usePoolParam } from "../components/Layout";
import { computeWins } from "../../shared/logic";
import { BoxesTab } from "./BoxesTab";
import { GamesTab } from "./GamesTab";
import { PayoutsTab } from "./PayoutsTab";
import { SettleTab } from "./SettleTab";
import { SetupTab } from "./SetupTab";

const TABS = ["boxes", "games", "payouts", "settle", "setup"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = {
  boxes: "Boxes",
  games: "Scores",
  payouts: "Payouts",
  settle: "Settle up",
  setup: "Setup",
};

export function AdminApp() {
  const [tab, setTab] = useHashTab(TABS, "boxes");
  const [poolId, setPoolId] = usePoolParam();
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<{ status?: number; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setState(await getAdminState(poolId));
      setError(null);
    } catch (e) {
      setError({ status: e instanceof ApiError ? e.status : undefined, text: (e as Error).message });
    }
  }, [poolId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const wins = useMemo(
    () => (state?.pool ? computeWins(state.pool, state.boxes, state.games, state.payouts) : []),
    [state],
  );

  if (error?.status === 403)
    return (
      <div className="app">
        <Header title="Squares admin" />
        <main>
          <div className="card">
            <h3>Admins only</h3>
            <p>You're not signed in with an admin account. <a href="/">Back to the pool</a></p>
          </div>
        </main>
      </div>
    );

  const pool = state?.pool ?? null;
  const ctx = { state: state!, wins, reload };
  return (
    <div className="app admin">
      <Header
        title={pool ? `${pool.year} ${pool.name} · Admin` : "Squares admin"}
        subtitle={state?.me ? `Signed in as ${state.me.email}${state.me.label ? ` (${state.me.label})` : ""}` : undefined}
        pools={state?.pools}
        poolId={pool?.id}
        onPool={(id) => setPoolId(id)}
        right={<a className="btn ghost" href={`/${location.search}`}>Public view</a>}
      />
      <Tabs tabs={TABS} labels={LABELS} tab={tab} onTab={setTab} />
      <main>
        {error && <div className="alert">{error.text}</div>}
        {!state ? (
          <p className="empty">Loading…</p>
        ) : !pool && tab !== "setup" ? (
          <div className="card">
            <h3>No pool yet</h3>
            <p>
              Create this year's pool on the <a href="#setup">Setup</a> tab.
            </p>
          </div>
        ) : tab === "boxes" ? (
          <BoxesTab {...ctx} />
        ) : tab === "games" ? (
          <GamesTab {...ctx} />
        ) : tab === "payouts" ? (
          <PayoutsTab {...ctx} />
        ) : tab === "settle" ? (
          <SettleTab {...ctx} />
        ) : (
          <SetupTab {...ctx} />
        )}
      </main>
    </div>
  );
}

export interface TabProps {
  state: AdminState;
  wins: ReturnType<typeof computeWins>;
  reload: () => Promise<void>;
}
