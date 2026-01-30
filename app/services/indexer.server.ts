import path from "path";
import crypto from "crypto";
import { getDb, upsertSnapshot } from "./db.server";
import { listSubvolumes, getSubvolumeInfo, readDirectory, getFileStat, readFile } from "./btrfs.server";

export interface IndexingProgress {
  snapshotId: number;
  snapshotName: string;
  totalFiles: number;
  processedFiles: number;
  currentPath: string;
  status: "running" | "completed" | "error";
  error?: string;
}

/**
 * Compute SHA256 checksum of a file (first 16 chars)
 */
function computeChecksum(filePath: string): string | null {
  try {
    const content = readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Index a single snapshot
 */
export async function indexSnapshot(
  snapshotPath: string,
  onProgress?: (progress: IndexingProgress) => void
): Promise<{ snapshotId: number; totalFiles: number; totalSize: number }> {
  const db = getDb();
  const info = getSubvolumeInfo(snapshotPath);

  if (!info) {
    throw new Error(`Failed to get info for snapshot: ${snapshotPath}`);
  }

  const snapshotName = info.name;

  // Upsert snapshot record
  const snapshotId = upsertSnapshot({
    btrfs_id: info.id,
    name: info.name,
    path: snapshotPath,
    created_at: info.createdAt || new Date().toISOString(),
    uuid: info.uuid || null,
    parent_uuid: info.parentUuid || null,
    indexed_at: new Date().toISOString(),
    total_files: 0,
    total_size: 0,
  });

  // Clear existing files for this snapshot
  db.prepare("DELETE FROM files WHERE snapshot_id = ?").run(snapshotId);

  // Prepare insert statement
  const insertFile = db.prepare(`
    INSERT INTO files (snapshot_id, path, name, is_directory, size, mtime, checksum)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let totalFiles = 0;
  let totalSize = 0;
  const MAX_CHECKSUM_SIZE = 50 * 1024 * 1024; // 50MB max for checksum

  // Walk directory tree
  function walkDir(dirPath: string, relativePath: string) {
    let entries;
    try {
      entries = readDirectory(dirPath);
    } catch (error) {
      console.error(`Failed to read directory: ${dirPath}`, error);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      let stat;
      try {
        stat = getFileStat(fullPath);
      } catch {
        continue; // Skip files we can't stat
      }

      let checksum: string | null = null;
      if (!entry.isDirectory() && stat.size > 0 && stat.size < MAX_CHECKSUM_SIZE) {
        checksum = computeChecksum(fullPath);
      }

      insertFile.run(
        snapshotId,
        relPath,
        entry.name,
        entry.isDirectory() ? 1 : 0,
        stat.size,
        stat.mtime.toISOString(),
        checksum
      );

      totalFiles++;
      if (!entry.isDirectory()) {
        totalSize += stat.size;
      }

      if (onProgress && totalFiles % 500 === 0) {
        onProgress({
          snapshotId,
          snapshotName,
          totalFiles,
          processedFiles: totalFiles,
          currentPath: relPath,
          status: "running",
        });
      }

      if (entry.isDirectory()) {
        walkDir(fullPath, relPath);
      }
    }
  }

  // Start indexing
  if (onProgress) {
    onProgress({
      snapshotId,
      snapshotName,
      totalFiles: 0,
      processedFiles: 0,
      currentPath: "",
      status: "running",
    });
  }

  // Use transaction for faster inserts
  const indexTransaction = db.transaction(() => {
    walkDir(snapshotPath, "");
  });
  indexTransaction();

  // Update snapshot stats
  db.prepare(`
    UPDATE snapshots SET total_files = ?, total_size = ?, indexed_at = ?
    WHERE id = ?
  `).run(totalFiles, totalSize, new Date().toISOString(), snapshotId);

  if (onProgress) {
    onProgress({
      snapshotId,
      snapshotName,
      totalFiles,
      processedFiles: totalFiles,
      currentPath: "",
      status: "completed",
    });
  }

  return { snapshotId, totalFiles, totalSize };
}

/**
 * Discover and index all snapshots
 */
export async function indexAllSnapshots(
  onProgress?: (progress: IndexingProgress & { currentSnapshot: number; totalSnapshots: number }) => void
): Promise<{ indexed: number; errors: string[] }> {
  const subvolumes = listSubvolumes();
  const errors: string[] = [];
  let indexed = 0;

  for (let i = 0; i < subvolumes.length; i++) {
    const subvolume = subvolumes[i];

    try {
      await indexSnapshot(subvolume.path, (progress) => {
        if (onProgress) {
          onProgress({
            ...progress,
            currentSnapshot: i + 1,
            totalSnapshots: subvolumes.length,
          });
        }
      });
      indexed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${subvolume.name}: ${message}`);
      console.error(`Failed to index ${subvolume.name}:`, error);
    }
  }

  return { indexed, errors };
}
