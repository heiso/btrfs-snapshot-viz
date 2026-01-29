import { getDB } from './db.server';
import { getSnapshots } from './index.server';
import { streamChanges } from './btrfs-stream.server';
import type { FileTimeline, FileHistoryEntry, IndexStatus } from '~/types';

// Index metadata management

export async function getIndexMetadata(subvolumePath: string) {
  const db = getDB();
  const row = db.prepare('SELECT * FROM index_metadata WHERE subvolume_path = ?').get(subvolumePath);
  return row as {
    subvolume_path: string;
    last_indexed_snapshot: string | null;
    total_snapshots: number;
    indexed_snapshots: number;
    status: 'building' | 'complete' | 'error';
    created_at: string;
    updated_at: string;
  } | undefined;
}

export async function needsInitialBuild(subvolumePath: string): Promise<boolean> {
  const metadata = await getIndexMetadata(subvolumePath);
  return !metadata || metadata.indexed_snapshots === 0;
}

export async function getIndexStatus(subvolumePath: string): Promise<IndexStatus> {
  const metadata = await getIndexMetadata(subvolumePath);
  const snapshots = await getSnapshots(subvolumePath);

  return {
    exists: !!metadata,
    complete: metadata?.status === 'complete',
    progress: {
      current: metadata?.indexed_snapshots || 0,
      total: snapshots.length
    }
  };
}

function updateIndexMetadata(
  subvolumePath: string,
  lastIndexedSnapshot: string,
  indexed: number,
  total: number,
  status: 'building' | 'complete' | 'error' = 'building'
) {
  const db = getDB();
  db.prepare(`
    INSERT INTO index_metadata (subvolume_path, last_indexed_snapshot, indexed_snapshots, total_snapshots, status, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(subvolume_path) DO UPDATE SET
      last_indexed_snapshot = excluded.last_indexed_snapshot,
      indexed_snapshots = excluded.indexed_snapshots,
      total_snapshots = excluded.total_snapshots,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `).run(subvolumePath, lastIndexedSnapshot, indexed, total, status);
}

// File timeline management

function createOrUpdateFileTimeline(
  subvolumePath: string,
  filePath: string,
  status: 'active' | 'deleted',
  firstSeen: Date,
  lastSeen: Date
): number {
  const db = getDB();

  // Try to insert, or update if exists
  const result = db.prepare(`
    INSERT INTO file_timelines (subvolume_path, current_path, status, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(subvolume_path, current_path) DO UPDATE SET
      status = excluded.status,
      last_seen = excluded.last_seen
    RETURNING id
  `).get(subvolumePath, filePath, status, firstSeen.toISOString(), lastSeen.toISOString());

  return (result as { id: number }).id;
}

function addFileAlias(timelineId: number, path: string) {
  const db = getDB();
  db.prepare(`
    INSERT OR IGNORE INTO file_aliases (timeline_id, path)
    VALUES (?, ?)
  `).run(timelineId, path);
}

function addHistoryEntry(
  timelineId: number,
  snapshotPath: string,
  snapshotCreatedAt: Date,
  path: string,
  changeType: 'created' | 'modified' | 'deleted' | 'renamed',
  previousPath?: string,
  size?: number,
  isDirectory?: boolean
) {
  const db = getDB();
  db.prepare(`
    INSERT INTO file_history_entries (
      timeline_id, snapshot_path, snapshot_created_at, path,
      change_type, previous_path, size, is_directory
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    timelineId,
    snapshotPath,
    snapshotCreatedAt.toISOString(),
    path,
    changeType,
    previousPath || null,
    size || null,
    isDirectory ? 1 : 0
  );
}

// Index building

export async function buildFileIndex(
  subvolumePath: string,
  options?: { force?: boolean; onProgress?: (current: number, total: number) => void }
): Promise<void> {
  const snapshots = await getSnapshots(subvolumePath);
  const metadata = options?.force ? null : await getIndexMetadata(subvolumePath);

  // Find where to start indexing
  let startIndex = 0;
  if (metadata?.last_indexed_snapshot && !options?.force) {
    startIndex = snapshots.findIndex(s => s.path === metadata.last_indexed_snapshot) + 1;
  }

  // Process each new snapshot
  for (let i = startIndex; i < snapshots.length; i++) {
    const current = snapshots[i];
    const previous = i > 0 ? snapshots[i - 1] : null;

    console.log(`Indexing snapshot ${i + 1}/${snapshots.length}: ${current.path}`);

    if (previous) {
      // Get incremental changes between snapshots
      for await (const event of streamChanges(previous.path, current.path)) {
        if (event.type === 'change' && event.data) {
          await processFileChange(subvolumePath, event.data, current);
        }
      }
    } else {
      // First snapshot - would need to index all files
      // For now, skip this as it's expensive. Files will be tracked from their first change.
      console.log('First snapshot - skipping initial full index');
    }

    // Mark snapshot as indexed
    const status = i === snapshots.length - 1 ? 'complete' : 'building';
    updateIndexMetadata(subvolumePath, current.path, i + 1, snapshots.length, status);

    // Call progress callback
    if (options?.onProgress) {
      options.onProgress(i + 1, snapshots.length);
    }
  }
}

async function processFileChange(
  subvolumePath: string,
  change: { type: string; path: string; oldPath?: string; size?: number },
  snapshot: { path: string; createdAt: Date }
) {
  const db = getDB();

  // Determine change type for history
  let historyChangeType: 'created' | 'modified' | 'deleted' | 'renamed';
  let targetPath = change.path;
  let previousPath: string | undefined;

  switch (change.type) {
    case 'mkdir':
    case 'link':
    case 'symlink':
      historyChangeType = 'created';
      break;
    case 'write':
    case 'truncate':
    case 'clone':
      historyChangeType = 'modified';
      break;
    case 'unlink':
    case 'rmdir':
      historyChangeType = 'deleted';
      break;
    case 'rename':
      historyChangeType = 'renamed';
      previousPath = change.oldPath;
      break;
    default:
      return; // Skip unknown types
  }

  const isDirectory = change.type === 'mkdir' || change.type === 'rmdir';

  // Find or create timeline for this file
  const status = historyChangeType === 'deleted' ? 'deleted' : 'active';

  // For renames, we need to update the timeline's current_path
  if (historyChangeType === 'renamed' && previousPath) {
    // Find existing timeline by old path or any alias
    const existingTimeline = db.prepare(`
      SELECT ft.* FROM file_timelines ft
      LEFT JOIN file_aliases fa ON fa.timeline_id = ft.id
      WHERE ft.subvolume_path = ? AND (ft.current_path = ? OR fa.path = ?)
      LIMIT 1
    `).get(subvolumePath, previousPath, previousPath) as { id: number; current_path: string } | undefined;

    if (existingTimeline) {
      // Update existing timeline with new path
      db.prepare(`
        UPDATE file_timelines
        SET current_path = ?, last_seen = ?
        WHERE id = ?
      `).run(targetPath, snapshot.createdAt.toISOString(), existingTimeline.id);

      // Add old path as alias
      addFileAlias(existingTimeline.id, previousPath);

      // Add history entry
      addHistoryEntry(
        existingTimeline.id,
        snapshot.path,
        snapshot.createdAt,
        targetPath,
        historyChangeType,
        previousPath,
        change.size,
        isDirectory
      );
      return;
    }
  }

  // Create or update timeline
  const timelineId = createOrUpdateFileTimeline(
    subvolumePath,
    targetPath,
    status,
    snapshot.createdAt,
    snapshot.createdAt
  );

  // Add history entry
  addHistoryEntry(
    timelineId,
    snapshot.path,
    snapshot.createdAt,
    targetPath,
    historyChangeType,
    previousPath,
    change.size,
    isDirectory
  );
}

// Force rebuild

export async function rebuildIndex(subvolumePath: string): Promise<void> {
  const db = getDB();

  // Clear existing data for this subvolume
  db.prepare(`
    DELETE FROM file_history_entries
    WHERE timeline_id IN (SELECT id FROM file_timelines WHERE subvolume_path = ?)
  `).run(subvolumePath);

  db.prepare(`
    DELETE FROM file_aliases
    WHERE timeline_id IN (SELECT id FROM file_timelines WHERE subvolume_path = ?)
  `).run(subvolumePath);

  db.prepare('DELETE FROM file_timelines WHERE subvolume_path = ?').run(subvolumePath);
  db.prepare('DELETE FROM index_metadata WHERE subvolume_path = ?').run(subvolumePath);

  // Rebuild from scratch
  await buildFileIndex(subvolumePath, { force: true });
}

// Auto-index latest snapshot

export async function indexLatestSnapshot(subvolumePath: string): Promise<void> {
  const snapshots = await getSnapshots(subvolumePath);
  if (snapshots.length === 0) return;

  const latest = snapshots[snapshots.length - 1];
  const metadata = await getIndexMetadata(subvolumePath);

  // Only index if this snapshot isn't already indexed
  if (!metadata || metadata.last_indexed_snapshot !== latest.path) {
    await buildFileIndex(subvolumePath);
  }
}

// Query file history

export async function getFileHistory(
  subvolumePath: string,
  filePath: string
): Promise<FileTimeline | null> {
  const db = getDB();

  // Find timeline by current path or any alias
  const timeline = db.prepare(`
    SELECT DISTINCT ft.* FROM file_timelines ft
    LEFT JOIN file_aliases fa ON fa.timeline_id = ft.id
    WHERE ft.subvolume_path = ? AND (ft.current_path = ? OR fa.path = ?)
    LIMIT 1
  `).get(subvolumePath, filePath, filePath) as {
    id: number;
    current_path: string;
    status: 'active' | 'deleted';
    first_seen: string;
    last_seen: string;
  } | undefined;

  if (!timeline) {
    return null;
  }

  // Get all aliases
  const aliases = db.prepare(`
    SELECT path FROM file_aliases WHERE timeline_id = ?
  `).all(timeline.id) as { path: string }[];

  // Get history entries
  const entries = db.prepare(`
    SELECT * FROM file_history_entries
    WHERE timeline_id = ?
    ORDER BY snapshot_created_at ASC
  `).all(timeline.id) as Array<{
    snapshot_path: string;
    snapshot_created_at: string;
    path: string;
    change_type: 'created' | 'modified' | 'deleted' | 'renamed';
    previous_path: string | null;
    size: number | null;
    is_directory: number;
  }>;

  return {
    currentPath: timeline.current_path,
    aliases: [timeline.current_path, ...aliases.map(a => a.path)],
    history: entries.map(e => ({
      snapshotPath: e.snapshot_path,
      snapshotCreatedAt: new Date(e.snapshot_created_at),
      path: e.path,
      changeType: e.change_type,
      previousPath: e.previous_path || undefined,
      size: e.size || undefined,
      isDirectory: e.is_directory === 1
    })),
    firstSeen: new Date(timeline.first_seen),
    lastSeen: new Date(timeline.last_seen),
    status: timeline.status
  };
}
