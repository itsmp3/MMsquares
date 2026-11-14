import { useMemo, useState } from "react";
import type { HistoryYear, Pool, PublicBox } from "../../shared/types";
import { ROUND_NAMES } from "../../shared/types";
import { boxForCode, fmtScore } from "../../shared/logic";
import { ScoreKey } from "./ScoreKey";

// Blue sequential ramp (light -> dark); 0 hits stays on the plain surface.
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const codes = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));

function rampColor(v: number, max: number) {
  if (v <= 0 || max <= 0) return undefined;
  if (max === 1) return RAMP[3];
  return RAMP[Math.round(((v - 1) / (max - 1)) * (RAMP.length - 1))];
}

export function History({ years, pool, boxes }: { years: HistoryYear[]; pool?: Pool | null; boxes?: PublicBox[] }) {
  const [sel, setSel] = useState<"all" | number>("all");
  const [round, setRound] = useState<number | 0>(0);
  const [sort, setSort] = useState<"hits" | "code">("hits");
  const [hover, setHover] = useState<string | null>(null);

  const perYear = useMemo(() => {
    const m = new Map<number, Map<string, number>>();
    for (const y of years) {
      const c = new Map<string, number>();
      for (const g of y.games) if (g.code && (!round || g.round === round)) c.set(g.code, (c.get(g.code) ?? 0) + 1);
      m.set(y.year, c);
    }
    return m;
  }, [years, round]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const [y, yc] of perYear) {
      if (sel !== "all" && y !== sel) continue;
      for (const [k, v] of yc) c.set(k, (c.get(k) ?? 0) + v);
    }
    return c;
  }, [perYear, sel]);

  if (!years.length) return <p className="empty">No history yet.</p>;

  const max = Math.max(0, ...counts.values());
  const nYears = sel === "all" ? years.filter((y) => y.games.length).length : 1;
  const totals = codes.map((code) => ({ code, hits: counts.get(code) ?? 0 }));
  const sorted = [...totals].sort((a, b) => (sort === "hits" ? b.hits - a.hits || a.code.localeCompare(b.code) : a.code.localeCompare(b.code)));
  const never = totals.filter((t) => t.hits === 0).map((t) => t.code);
  const top = [...totals].sort((a, b) => b.hits - a.hits).slice(0, 5);
  const drawn = !!pool?.col_digits;
  const owner = (code: string) => {
    if (!drawn || !pool) return null;
    const n = boxForCode(pool, code);
    return n ? { n, name: boxes?.[n - 1]?.name ?? null } : null;
  };
  const hoverOwner = hover ? owner(hover) : null;

  return (
    <div className="stack">
      <div className="filters">
        <label>
          Years{" "}
          <select value={sel} onChange={(e) => setSel(e.target.value === "all" ? "all" : Number(e.target.value))}>
            <option value="all">All years ({years.length})</option>
            {[...years].reverse().map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
                {y.in_progress ? " (in progress)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Round{" "}
          <select value={round} onChange={(e) => setRound(Number(e.target.value))}>
            <option value={0}>All rounds</option>
            {[1, 2, 3, 4, 5, 6].map((r) => <option key={r} value={r}>{ROUND_NAMES[r]}</option>)}
          </select>
        </label>
      </div>

      <div className="history-top">
        <section className="card">
          <h3>
            How often each score hit{" "}
            <span className="muted">· {sel === "all" ? `${years[0].year}–${years[years.length - 1].year}` : sel}</span>
          </h3>
          <ScoreKey compact />
          <div className="heat-wrap">
            <div className="axis-top">Losing digit →</div>
            <div className="axis-side">Winning digit →</div>
            <div className="heat" onMouseLeave={() => setHover(null)}>
              <div className="corner" />
              {Array.from({ length: 10 }, (_, c) => <div key={c} className="digit col">{c}</div>)}
              {Array.from({ length: 10 }, (_, r) => (
                <HeatRow key={r} r={r} counts={counts} max={max} hover={hover} setHover={setHover} />
              ))}
            </div>
          </div>
          <div className="heat-legend" aria-hidden>
            <span>0</span>
            <span className="swatch zero" />
            {RAMP.map((c) => <span key={c} className="swatch" style={{ background: c }} />)}
            <span>{max}</span>
          </div>
          <p className="hover-line">
            {hover ? (
              <>
                <b>{fmtScore(hover)}</b>: winner ends in {hover[0]}, loser ends in {hover[1]} · {counts.get(hover) ?? 0} hit
                {(counts.get(hover) ?? 0) === 1 ? "" : "s"}
                {sel === "all" && <> · {((counts.get(hover) ?? 0) / nYears).toFixed(1)} per year</>}
                {hoverOwner && <> · this year: {hoverOwner.name ?? "open box"}</>}
              </>
            ) : (
              <span className="muted">&nbsp;</span>
            )}
          </p>
        </section>

        <section className="card">
          <h3>Highlights</h3>
          <h4>Most frequent</h4>
          <ol className="plain">
            {top.map((t) => (
              <li key={t.code}>
                <span className="code">{fmtScore(t.code)}</span> {t.hits} hits
                {sel === "all" && <span className="muted"> · {(t.hits / nYears).toFixed(1)}/yr</span>}
              </li>
            ))}
          </ol>
          <h4>Never hit ({never.length})</h4>
          <p className="codes">{never.length ? never.map((c) => <span key={c} className="code">{fmtScore(c)}</span>) : "Every box has hit."}</p>
        </section>
      </div>

      <section className="card">
        <div className="row-between">
          <h3>Every score, by year</h3>
          <label>
            Sort{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value as "hits" | "code")}>
              <option value="hits">Most hits</option>
              <option value="code">Score</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="table compact">
            <thead>
              <tr>
                <th>Score</th>
                {drawn && <th>This year</th>}
                <th className="r">Total</th>
                <th className="r">Per yr</th>
                {years.map((y) => <th key={y.year} className="r">{String(y.year).slice(2)}</th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const o = owner(t.code);
                return (
                  <tr key={t.code}>
                    <td><span className="code">{fmtScore(t.code)}</span></td>
                    {drawn && <td className="small">{o ? `${o.name ?? "open"}` : ""}</td>}
                    <td className="r"><b>{t.hits}</b></td>
                    <td className="r">{(t.hits / nYears).toFixed(1)}</td>
                    {years.map((y) => {
                      const v = perYear.get(y.year)?.get(t.code) ?? 0;
                      return <td key={y.year} className="r muted-zero">{v || "·"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HeatRow({ r, counts, max, hover, setHover }: { r: number; counts: Map<string, number>; max: number; hover: string | null; setHover: (c: string) => void }) {
  return (
    <>
      <div className="digit row">{r}</div>
      {Array.from({ length: 10 }, (_, c) => {
        const code = `${r}${c}`; // winner digit (row), loser digit (column)
        const v = counts.get(code) ?? 0;
        const bg = rampColor(v, max);
        const dark = bg && RAMP.indexOf(bg) >= 3;
        return (
          <div
            key={c}
            className={`hcell${hover === code ? " hov" : ""}${dark ? " dark" : ""}${v === 0 ? " zero" : ""}`}
            style={bg ? { background: bg } : undefined}
            title={`${fmtScore(code)}: ${v} hit${v === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(code)}
            onClick={() => setHover(code)}
          >
            {v || ""}
          </div>
        );
      })}
    </>
  );
}
