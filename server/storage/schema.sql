-- D1 schema: full-market catalog (staged + published), resumable scan runs,
-- published research scores, and the market bar cache (replaces KV to avoid
-- KV daily operation limits).

CREATE TABLE IF NOT EXISTS market_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  stale_until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_cache_expiry ON market_cache(stale_until);

-- Latest published catalog header. Only one current version is promoted.
CREATE TABLE IF NOT EXISTS catalog_meta (
  version TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  complete INTEGER NOT NULL DEFAULT 0,
  sources_json TEXT NOT NULL
);

-- Published instruments for the current catalog version.
CREATE TABLE IF NOT EXISTS instrument (
  version TEXT NOT NULL,
  id TEXT NOT NULL,
  market TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL,
  listing_status TEXT NOT NULL DEFAULT 'listed',
  listed_at TEXT,
  providers_json TEXT NOT NULL,
  catalog_source TEXT NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'ready',
  PRIMARY KEY (version, id)
);
CREATE INDEX IF NOT EXISTS idx_instrument_market ON instrument(version, market, name);

-- Rows staged during chunked catalog sync (JSON sources fetched by the server,
-- HKEX workbook parsed in the browser). Promoted into `instrument` by commit.
CREATE TABLE IF NOT EXISTS stage_row (
  source TEXT NOT NULL,
  id TEXT NOT NULL,
  market TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL,
  listing_status TEXT NOT NULL DEFAULT 'listed',
  listed_at TEXT,
  providers_json TEXT NOT NULL,
  catalog_source TEXT NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'ready',
  PRIMARY KEY (source, id)
);

-- Pagination/completeness ledger per catalog source during one sync attempt.
CREATE TABLE IF NOT EXISTS sync_log (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  declared_total INTEGER,
  page_count INTEGER,
  pages_done INTEGER NOT NULL DEFAULT 0,
  staged_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_run (
  id TEXT PRIMARY KEY,
  catalog_version TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  driver TEXT NOT NULL DEFAULT 'server',
  published INTEGER NOT NULL DEFAULT 0,
  counts_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS scan_item (
  run_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  record_json TEXT,
  chan_score REAL,
  momentum_raw REAL,
  stale INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_scan_item_status ON scan_item(run_id, status);

-- Published cross-section scores for a completed run (the snapshot itself).
CREATE TABLE IF NOT EXISTS score (
  run_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  kind TEXT NOT NULL,
  momentum_score REAL NOT NULL,
  resonance REAL NOT NULL,
  quadrant TEXT NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY (run_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_score_rank ON score(run_id, rank);
