-- Verifiche: una riga per verifica. Il contenuto completo sta in `body` (JSON);
-- le altre colonne servono all'elenco e ai filtri. `revision` evita che due
-- persone si sovrascrivano senza accorgersene.
CREATE TABLE tests (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  subject      TEXT NOT NULL DEFAULT '',
  track        TEXT NOT NULL DEFAULT '',
  year         INTEGER,
  item_count   INTEGER NOT NULL DEFAULT 0,
  total_points REAL NOT NULL DEFAULT 0,
  revision     INTEGER NOT NULL DEFAULT 1,
  body         TEXT NOT NULL,
  created_by   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX idx_tests_updated ON tests (updated_at DESC);
