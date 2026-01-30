import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || "./data/snapshots.db";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure the directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    -- snapshots: Core snapshot metadata
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      btrfs_id INTEGER,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT,
      uuid TEXT UNIQUE,
      parent_uuid TEXT,
      indexed_at TEXT,
      total_files INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0
    );

    -- files: Indexed file tree for each snapshot
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      is_directory INTEGER NOT NULL,
      size INTEGER DEFAULT 0,
      mtime TEXT,
      checksum TEXT,
      UNIQUE(snapshot_id, path)
    );

    -- snapshot_tags: Custom tags on snapshots
    CREATE TABLE IF NOT EXISTS snapshot_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- snapshot_notes: User notes on snapshots
    CREATE TABLE IF NOT EXISTS snapshot_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      note TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_files_snapshot_id ON files(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
    CREATE INDEX IF NOT EXISTS idx_files_checksum ON files(checksum);
    CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at);
  `);
}

// Snapshot queries
export function getAllSnapshots() {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT * FROM snapshots
    ORDER BY created_at DESC
  `
    )
    .all() as Snapshot[];
}

export function getSnapshot(id: number) {
  const db = getDb();
  return db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id) as
    | Snapshot
    | undefined;
}

export function getSnapshotByPath(path: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM snapshots WHERE path = ?").get(path) as
    | Snapshot
    | undefined;
}

export function getLatestSnapshot() {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT * FROM snapshots
    ORDER BY created_at DESC
    LIMIT 1
  `
    )
    .get() as Snapshot | undefined;
}

export function upsertSnapshot(snapshot: Omit<Snapshot, "id">) {
  const db = getDb();
  const existing = getSnapshotByPath(snapshot.path);

  if (existing) {
    db.prepare(
      `
      UPDATE snapshots SET
        btrfs_id = ?,
        name = ?,
        created_at = ?,
        uuid = ?,
        parent_uuid = ?,
        indexed_at = ?,
        total_files = ?,
        total_size = ?
      WHERE id = ?
    `
    ).run(
      snapshot.btrfs_id,
      snapshot.name,
      snapshot.created_at,
      snapshot.uuid,
      snapshot.parent_uuid,
      snapshot.indexed_at,
      snapshot.total_files,
      snapshot.total_size,
      existing.id
    );
    return existing.id;
  } else {
    const result = db
      .prepare(
        `
      INSERT INTO snapshots (btrfs_id, name, path, created_at, uuid, parent_uuid, indexed_at, total_files, total_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        snapshot.btrfs_id,
        snapshot.name,
        snapshot.path,
        snapshot.created_at,
        snapshot.uuid,
        snapshot.parent_uuid,
        snapshot.indexed_at,
        snapshot.total_files,
        snapshot.total_size
      );
    return result.lastInsertRowid as number;
  }
}

// File queries
export function getFilesForSnapshot(snapshotId: number, dirPath: string = "") {
  const db = getDb();
  const normalizedPath = dirPath.replace(/^\/+|\/+$/g, "");

  if (!normalizedPath) {
    // Root directory - get top-level items
    return db
      .prepare(
        `
      SELECT * FROM files
      WHERE snapshot_id = ? AND path NOT LIKE '%/%'
      ORDER BY is_directory DESC, name ASC
    `
      )
      .all(snapshotId) as FileEntry[];
  }

  // Get items in specific directory
  const pattern = `${normalizedPath}/%`;
  const depth = normalizedPath.split("/").length + 1;

  return db
    .prepare(
      `
    SELECT * FROM files
    WHERE snapshot_id = ?
      AND path LIKE ?
      AND (LENGTH(path) - LENGTH(REPLACE(path, '/', ''))) = ?
    ORDER BY is_directory DESC, name ASC
  `
    )
    .all(snapshotId, pattern, depth) as FileEntry[];
}

export function getFile(snapshotId: number, filePath: string) {
  const db = getDb();
  const normalizedPath = filePath.replace(/^\/+|\/+$/g, "");
  return db
    .prepare(
      `
    SELECT * FROM files
    WHERE snapshot_id = ? AND path = ?
  `
    )
    .get(snapshotId, normalizedPath) as FileEntry | undefined;
}

export function searchFiles(query: string, snapshotId?: number) {
  const db = getDb();
  const pattern = `%${query}%`;

  if (snapshotId) {
    return db
      .prepare(
        `
      SELECT f.*, s.name as snapshot_name
      FROM files f
      JOIN snapshots s ON f.snapshot_id = s.id
      WHERE f.snapshot_id = ? AND f.name LIKE ?
      ORDER BY f.is_directory DESC, f.name ASC
      LIMIT 100
    `
      )
      .all(snapshotId, pattern) as (FileEntry & { snapshot_name: string })[];
  }

  return db
    .prepare(
      `
    SELECT f.*, s.name as snapshot_name
    FROM files f
    JOIN snapshots s ON f.snapshot_id = s.id
    WHERE f.name LIKE ?
    ORDER BY s.created_at DESC, f.is_directory DESC, f.name ASC
    LIMIT 100
  `
    )
    .all(pattern) as (FileEntry & { snapshot_name: string })[];
}

// File history
export function getFileHistory(filePath: string) {
  const db = getDb();
  const normalizedPath = filePath.replace(/^\/+|\/+$/g, "");

  return db
    .prepare(
      `
    SELECT f.*, s.name as snapshot_name, s.created_at as snapshot_created_at
    FROM files f
    JOIN snapshots s ON f.snapshot_id = s.id
    WHERE f.path = ?
    ORDER BY s.created_at DESC
  `
    )
    .all(normalizedPath) as (FileEntry & {
    snapshot_name: string;
    snapshot_created_at: string;
  })[];
}

// Diff helpers
export function getChangeSummary(baseSnapshotId: number, compareSnapshotId: number) {
  const db = getDb();

  const added = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM files c
    LEFT JOIN files b ON b.snapshot_id = ? AND b.path = c.path
    WHERE c.snapshot_id = ? AND c.is_directory = 0 AND b.id IS NULL
  `
    )
    .get(baseSnapshotId, compareSnapshotId) as { count: number };

  const deleted = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM files b
    LEFT JOIN files c ON c.snapshot_id = ? AND c.path = b.path
    WHERE b.snapshot_id = ? AND b.is_directory = 0 AND c.id IS NULL
  `
    )
    .get(compareSnapshotId, baseSnapshotId) as { count: number };

  const modified = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM files b
    JOIN files c ON c.snapshot_id = ? AND c.path = b.path
    WHERE b.snapshot_id = ? AND b.is_directory = 0
      AND b.checksum IS NOT NULL AND c.checksum IS NOT NULL
      AND b.checksum != c.checksum
  `
    )
    .get(compareSnapshotId, baseSnapshotId) as { count: number };

  return {
    added: added.count,
    deleted: deleted.count,
    modified: modified.count,
  };
}

// Types
export interface Snapshot {
  id: number;
  btrfs_id: number | null;
  name: string;
  path: string;
  created_at: string | null;
  uuid: string | null;
  parent_uuid: string | null;
  indexed_at: string | null;
  total_files: number;
  total_size: number;
}

export interface FileEntry {
  id: number;
  snapshot_id: number;
  path: string;
  name: string;
  is_directory: number;
  size: number;
  mtime: string | null;
  checksum: string | null;
}
