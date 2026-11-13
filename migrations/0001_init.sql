-- A pool is one 10x10 grid for one tournament year. A year can hold several pools
-- (e.g. the $50 pool and a $25 pool); games are shared by every pool in a year.
CREATE TABLE pools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  buy_in      INTEGER NOT NULL,             -- dollars per box
  payouts     TEXT    NOT NULL,             -- JSON: {"1":25,"2":50,"3":100,"4":200,"5":400,"6":1000}
  col_digits  TEXT,                         -- JSON array of 10 digits, winning team (across the top); NULL until drawn
  row_digits  TEXT,                         -- JSON array of 10 digits, losing team (down the side)
  drawn_at    TEXT,
  is_current  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Box numbers run 1-100, left to right, top to bottom.
CREATE TABLE boxes (
  pool_id       INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  num           INTEGER NOT NULL CHECK (num BETWEEN 1 AND 100),
  name          TEXT,
  status        TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','claimed','paid')),
  requested_at  TEXT,
  pay_method    TEXT,                       -- Venmo / Zelle / PayPal / Cash
  collected_by  TEXT,                       -- collector label, e.g. MP / ATM
  paid_at       TEXT,
  note          TEXT,
  PRIMARY KEY (pool_id, num)
);

-- Tournament games (Round of 64 through the title game). First Four games are not stored.
-- round: 1=Round of 64, 2=Round of 32, 3=Sweet 16, 4=Elite 8, 5=Final Four, 6=Championship
CREATE TABLE games (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  year               INTEGER NOT NULL,
  espn_id            TEXT UNIQUE,
  round              INTEGER NOT NULL CHECK (round BETWEEN 1 AND 6),
  region             TEXT,
  start_time         TEXT,
  team_a             TEXT NOT NULL,
  seed_a             INTEGER,
  score_a            INTEGER,
  team_b             TEXT NOT NULL,
  seed_b             INTEGER,
  score_b            INTEGER,
  status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','final','void')),
  status_detail      TEXT,
  manual             INTEGER NOT NULL DEFAULT 0, -- 1 = edited by an admin; automatic sync leaves it alone
  payout_to_game_id  INTEGER REFERENCES games(id), -- void games: where the payout goes (NULL = championship game)
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX games_year ON games(year, round);

-- Admin tracking of who pays each winning box and whether it has been paid.
CREATE TABLE payouts (
  pool_id   INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  game_id   INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  payer     TEXT,              -- NULL = whoever collected the winning box's buy-in
  paid_at   TEXT,
  method    TEXT,
  note      TEXT,
  PRIMARY KEY (pool_id, game_id)
);

-- Box-code history imported from the old spreadsheet (2018-2026).
-- code = losing team's last digit followed by the winning team's last digit, e.g. '35'.
-- Years not in this table are derived from the games table.
CREATE TABLE history_scores (
  year   INTEGER NOT NULL,
  idx    INTEGER NOT NULL,
  round  INTEGER NOT NULL,
  code   TEXT,                -- NULL for a no-contest
  PRIMARY KEY (year, idx)
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('collectors', '["MP","ATM"]');
INSERT INTO settings (key, value) VALUES ('pay_methods', '["Venmo","Zelle","PayPal","Cash"]');

CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  actor   TEXT,
  action  TEXT NOT NULL,
  detail  TEXT
);
