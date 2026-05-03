import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = path.join(app.getPath('userData'), 'manyai.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  _db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_id      TEXT    NOT NULL,
      role        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      provider    TEXT,
      model       TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_tab ON messages(tab_id, created_at);

    CREATE TABLE IF NOT EXISTS routing_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      provider      TEXT    NOT NULL,
      model         TEXT    NOT NULL,
      workflow_type TEXT,
      success       INTEGER NOT NULL,
      latency_ms    INTEGER,
      error_msg     TEXT,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_routing ON routing_log(provider, model, created_at);

    CREATE TABLE IF NOT EXISTS agent_audit (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_id         TEXT,
      tool_name      TEXT    NOT NULL,
      args           TEXT    NOT NULL,
      result_preview TEXT,
      success        INTEGER NOT NULL,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent ON agent_audit(tab_id, created_at);
  `)

  return _db
}
