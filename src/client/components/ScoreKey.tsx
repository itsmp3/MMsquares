/** Short explainer for the "W-L" score format used across the site. */
export function ScoreKey({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`score-key${compact ? " compact" : ""}`}>
      <span className="code">9-3</span>
      <span>
        Scores use the last digit of each team's points, <b>winner first</b>; i.e. Michigan 69, UConn 63 will display as{" "}
        <b>9-3</b>
      </span>
    </p>
  );
}
