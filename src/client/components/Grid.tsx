import type { Pool, PublicBox } from "../../shared/types";
import { nameKey } from "../../shared/logic";
import { boxLabel, money } from "../api";

interface Props {
  pool: Pool;
  boxes: PublicBox[];
  /** Winnings per box number. */
  wonByBox?: Map<number, number>;
  /** Box numbers currently "on" in live games. */
  liveBoxes?: Set<number>;
  selected?: Set<number>;
  highlight?: string;
  onCellClick?: (num: number) => void;
  /** Can this cell be clicked? */
  clickable?: (b: PublicBox) => boolean;
  /** Extra text under the name (admin: payment info). */
  sub?: (b: PublicBox) => string | null;
}

export function Grid({ pool, boxes, wonByBox, liveBoxes, selected, highlight, onCellClick, clickable, sub }: Props) {
  const drawn = !!(pool.col_digits && pool.row_digits);
  const hk = nameKey(highlight);
  return (
    <div className="grid-scroll">
      <div className="grid-wrap">
        <div className="axis-top">Losing team →</div>
        <div className="axis-side">Winning team →</div>
        <div className="grid" role="grid" aria-label="Squares grid">
          <div className="corner" />
          {Array.from({ length: 10 }, (_, c) => (
            <div key={`c${c}`} className="digit col">
              {drawn ? pool.col_digits![c] : "?"}
            </div>
          ))}
          {Array.from({ length: 10 }, (_, r) => (
            <Row
              key={r}
              r={r}
              pool={pool}
              drawn={drawn}
              boxes={boxes}
              wonByBox={wonByBox}
              liveBoxes={liveBoxes}
              selected={selected}
              hk={hk}
              onCellClick={onCellClick}
              clickable={clickable}
              sub={sub}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  r, pool, drawn, boxes, wonByBox, liveBoxes, selected, hk, onCellClick, clickable, sub,
}: Omit<Props, "highlight"> & { r: number; drawn: boolean; hk: string }) {
  return (
    <>
      <div className="digit row">{drawn ? pool.row_digits![r] : "?"}</div>
      {Array.from({ length: 10 }, (_, c) => {
        const num = r * 10 + c + 1;
        const b = boxes[num - 1] ?? { num, name: null, status: "open" as const };
        const won = wonByBox?.get(num) ?? 0;
        const canClick = !!onCellClick && (clickable ? clickable(b) : true);
        const cls = [
          "cell",
          `st-${b.status}`,
          selected?.has(num) ? "selected" : "",
          hk && b.name && nameKey(b.name) === hk ? "match" : "",
          hk && !(b.name && nameKey(b.name) === hk) ? "dim" : "",
          liveBoxes?.has(num) ? "live" : "",
          canClick ? "clickable" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const s = sub?.(b);
        const title = [
          boxLabel(num),
          b.name ?? "Open",
          b.status === "pending" ? "pending approval" : b.status === "claimed" ? "not paid yet" : b.status === "paid" ? "paid" : "",
          drawn ? `winning digit ${pool.row_digits![r]}, losing digit ${pool.col_digits![c]}` : "",
          won ? `won ${money(won)}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={num}
            type="button"
            className={cls}
            title={title}
            aria-label={title}
            disabled={!canClick}
            onClick={canClick ? () => onCellClick!(num) : undefined}
          >
            <span className="num">{String(num).padStart(2, "0")}</span>
            <span className="name">{b.name ?? boxLabel(num)}</span>
            {b.status === "pending" && <span className="tag">pending</span>}
            {s && <span className="sub">{s}</span>}
            {won > 0 && <span className="won">{money(won)}</span>}
          </button>
        );
      })}
    </>
  );
}
