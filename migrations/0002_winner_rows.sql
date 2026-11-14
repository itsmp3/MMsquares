-- Grids now show the WINNING team's digit down the side (rows) and the LOSING team's digit
-- across the top (columns). Transpose pools that were already drawn so every box keeps the
-- same (winner, loser) digits; undrawn pools keep their box numbers.
CREATE TABLE boxes_transpose AS
  SELECT * FROM boxes WHERE pool_id IN (SELECT id FROM pools WHERE drawn_at IS NOT NULL);
DELETE FROM boxes WHERE pool_id IN (SELECT id FROM pools WHERE drawn_at IS NOT NULL);
INSERT INTO boxes (pool_id, num, name, status, requested_at, pay_method, collected_by, paid_at, note)
  SELECT pool_id, ((num - 1) % 10) * 10 + (num - 1) / 10 + 1, name, status, requested_at, pay_method, collected_by, paid_at, note
  FROM boxes_transpose;
DROP TABLE boxes_transpose;
UPDATE pools SET col_digits = row_digits, row_digits = col_digits WHERE drawn_at IS NOT NULL;
