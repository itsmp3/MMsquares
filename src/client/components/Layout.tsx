import { useEffect, useState, type ReactNode } from "react";
import type { PoolSummary } from "../api";

/** Tab state kept in the URL hash so links and refreshes land on the same tab. */
export function useHashTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const read = () => {
    const h = location.hash.slice(1) as T;
    return tabs.includes(h) ? h : fallback;
  };
  const [tab, setTab] = useState<T>(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  });
  return [tab, (t: T) => (location.hash = t)];
}

/** Selected pool id kept in ?pool= */
export function usePoolParam(): [number | null, (id: number | null) => void] {
  const read = () => Number(new URLSearchParams(location.search).get("pool")) || null;
  const [id, setId] = useState<number | null>(read);
  return [
    id,
    (next) => {
      const u = new URL(location.href);
      if (next) u.searchParams.set("pool", String(next));
      else u.searchParams.delete("pool");
      history.replaceState(null, "", u);
      setId(next);
    },
  ];
}

export function Header({
  title,
  subtitle,
  pools,
  poolId,
  onPool,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  pools?: PoolSummary[];
  poolId?: number | null;
  onPool?: (id: number) => void;
  right?: ReactNode;
}) {
  return (
    <header className="top">
      <div className="brand">
        <span className="ball" aria-hidden>🏀</span>
        <div>
          <h1>{title}</h1>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
      </div>
      <div className="top-right">
        {pools && pools.length > 1 && onPool && (
          <select aria-label="Pool" value={poolId ?? ""} onChange={(e) => onPool(Number(e.target.value))}>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.year} · {p.name}
                {p.is_current ? " (current)" : ""}
              </option>
            ))}
          </select>
        )}
        {right}
      </div>
    </header>
  );
}

export function Tabs<T extends string>({ tabs, labels, tab, onTab }: { tabs: readonly T[]; labels: Record<T, string>; tab: T; onTab: (t: T) => void }) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => onTab(t)}>
          {labels[t]}
        </button>
      ))}
    </nav>
  );
}
