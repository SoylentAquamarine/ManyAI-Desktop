import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

let _db: Database.Database | null = null

// Reserved for future configuration storage only — no usage logs.
export function getDb(): Database.Database {
  if (_db) return _db
  const dbPath = path.join(app.getPath('userData'), 'manyai.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  return _db
}
