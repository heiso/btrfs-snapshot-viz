import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.FILE_HISTORY_DB || path.join(process.cwd(), 'data', 'file-history.db');
let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // Better concurrent performance
    db.pragma('foreign_keys = ON');  // Enforce foreign key constraints
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  // Create tables if they don't exist
  db.exec(`
    -- Core file timeline tracking
    CREATE TABLE IF NOT EXISTS file_timelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subvolume_path TEXT NOT NULL,
      current_path TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'deleted')),
      first_seen DATETIME NOT NULL,
      last_seen DATETIME NOT NULL,
      UNIQUE(subvolume_path, current_path)
    );

    -- Track all paths a file has had (for rename tracking)
    CREATE TABLE IF NOT EXISTS file_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timeline_id INTEGER NOT NULL REFERENCES file_timelines(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      UNIQUE(timeline_id, path)
    );

    -- Individual change events at each snapshot
    CREATE TABLE IF NOT EXISTS file_history_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timeline_id INTEGER NOT NULL REFERENCES file_timelines(id) ON DELETE CASCADE,
      snapshot_path TEXT NOT NULL,
      snapshot_created_at DATETIME NOT NULL,
      path TEXT NOT NULL,
      change_type TEXT NOT NULL CHECK(change_type IN ('created', 'modified', 'deleted', 'renamed')),
      previous_path TEXT,
      size INTEGER,
      is_directory INTEGER DEFAULT 0
    );

    -- Track indexing progress per subvolume
    CREATE TABLE IF NOT EXISTS index_metadata (
      subvolume_path TEXT PRIMARY KEY,
      last_indexed_snapshot TEXT,
      total_snapshots INTEGER DEFAULT 0,
      indexed_snapshots INTEGER DEFAULT 0,
      status TEXT CHECK(status IN ('building', 'complete', 'error')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Performance indices
    CREATE INDEX IF NOT EXISTS idx_timeline_path ON file_timelines(current_path);
    CREATE INDEX IF NOT EXISTS idx_timeline_subvolume ON file_timelines(subvolume_path);
    CREATE INDEX IF NOT EXISTS idx_aliases_path ON file_aliases(path);
    CREATE INDEX IF NOT EXISTS idx_entries_timeline ON file_history_entries(timeline_id);
    CREATE INDEX IF NOT EXISTS idx_entries_snapshot ON file_history_entries(snapshot_path);
  `);
}

// Close database connection gracefully
export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

// Export for testing
export function resetDB() {
  if (db) {
    db.exec(`
      DELETE FROM file_history_entries;
      DELETE FROM file_aliases;
      DELETE FROM file_timelines;
      DELETE FROM index_metadata;
    `);
  }
}
