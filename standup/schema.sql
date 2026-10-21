-- Standup history. Lets a later /standup know where the previous one stopped,
-- so it reports work since that watermark rather than work "today".

PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS standups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL,          -- ISO8601 with offset, when generated
  covers_from TEXT,                      -- previous standup's covers_to; NULL on the first
  covers_to   TEXT    NOT NULL,          -- cutoff, becomes the next one's covers_from
  project     TEXT    NOT NULL,          -- repo directory name
  body        TEXT    NOT NULL           -- the update exactly as delivered
);

CREATE TABLE IF NOT EXISTS points (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  standup_id INTEGER NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  text       TEXT    NOT NULL
);

-- Commits already spoken for. Deduping on sha survives rebases of *other*
-- branches and repeated runs on the same day; the timestamp watermark alone
-- does not.
CREATE TABLE IF NOT EXISTS reported_commits (
  standup_id INTEGER NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  sha        TEXT    NOT NULL,
  PRIMARY KEY (standup_id, sha)
);

CREATE TABLE IF NOT EXISTS reported_prs (
  standup_id INTEGER NOT NULL REFERENCES standups(id) ON DELETE CASCADE,
  repo       TEXT    NOT NULL,
  number     INTEGER NOT NULL,
  PRIMARY KEY (standup_id, repo, number)
);

CREATE INDEX IF NOT EXISTS idx_standups_project ON standups(project, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reported_commits_sha ON reported_commits(sha);
