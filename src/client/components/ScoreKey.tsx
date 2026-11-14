/** Short explainer for the "W-L" score format used across the site. */
export function ScoreKey({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`score-key${compact ? " compact" : ""}`}>
      <span className="code">9-3</span>
      <span>
        Scores use the last digit of each team's points, <b>winner first</b>: Michigan 69, UConn 63 is <b>9-3</b>.
        {!compact && <> A square wins when the winning digit across the top and the losing digit down the side both match.</>}
      </span>
    </p>
  );
}
