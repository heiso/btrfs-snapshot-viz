import { spawn } from "child_process";
import { createInterface } from "readline";
import type { FileChange, ChangeType } from "~/types";

const BTRFS_ROOT = process.env.BTRFS_ROOT || "/";

// Cache for streaming results
interface CachedResult {
  changes: FileChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
  };
  timestamp: number;
}

const streamCache = new Map<string, CachedResult>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour TTL

function getCacheKey(oldPath: string, newPath: string): string {
  return `${oldPath}:${newPath}`;
}

function getCachedResult(oldPath: string, newPath: string): CachedResult | null {
  const key = getCacheKey(oldPath, newPath);
  const cached = streamCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }
  if (cached) {
    streamCache.delete(key); // Expired
  }
  return null;
}

function setCachedResult(oldPath: string, newPath: string, changes: FileChange[], summary: CachedResult["summary"]): void {
  const key = getCacheKey(oldPath, newPath);
  streamCache.set(key, { changes, summary, timestamp: Date.now() });
}

export function clearCache(oldPath: string, newPath: string): void {
  const key = getCacheKey(oldPath, newPath);
  streamCache.delete(key);
}

// Valid change types (excluding utimes/chmod/chown - too noisy)
const VALID_TYPES: ChangeType[] = [
  "write",
  "rename",
  "unlink",
  "rmdir",
  "mkdir",
  "link",
  "symlink",
  "truncate",
  "clone",
];

/**
 * Extract path from btrfs dump output, handling escaped characters
 */
function extractPath(str: string): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      const octalMatch = str.slice(i + 1).match(/^([0-7]{1,3})/);
      if (octalMatch) {
        const octalValue = parseInt(octalMatch[1], 8);
        bytes.push(octalValue);
        i += 1 + octalMatch[1].length;
      } else {
        bytes.push(str.charCodeAt(i + 1));
        i += 2;
      }
    } else if (str[i] === " ") {
      if (str.slice(i).startsWith(" -> ")) {
        break;
      }
      const remaining = str.slice(i + 1);
      if (remaining.match(/^(offset|len|atime|mtime|ctime|mode|uid|gid|dest|uuid|transid|parent_uuid|parent_transid|name)=/)) {
        break;
      }
      bytes.push(str.charCodeAt(i));
      i++;
    } else {
      bytes.push(str.charCodeAt(i));
      i++;
    }
  }
  return Buffer.from(bytes).toString("utf-8");
}

/**
 * Strip the snapshot prefix from paths
 */
function stripSnapshotPrefix(path: string): string {
  if (path.startsWith("./")) {
    path = path.slice(2);
  }
  const slashIndex = path.indexOf("/");
  if (slashIndex !== -1) {
    return path.slice(slashIndex + 1);
  }
  return path;
}

/**
 * Check if a path is an orphan object
 */
function isOrphanPath(path: string): boolean {
  return /^o\d+-\d+-\d+(\/|$)/.test(path);
}

/**
 * Parse a single line from btrfs receive --dump output
 */
function parseLine(line: string): { type: string; rest: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\w+)\s+(.+)$/);
  if (!match) return null;

  return { type: match[1].toLowerCase(), rest: match[2] };
}

export interface StreamEvent {
  type: "change" | "progress" | "done" | "error";
  data?: FileChange;
  message?: string;
  summary?: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
  };
}

/**
 * Stream changes between two snapshots
 * Yields FileChange objects as they are parsed
 * Uses cache if available for instant results
 */
export async function* streamChanges(
  oldSnapshotPath: string,
  newSnapshotPath: string
): AsyncGenerator<StreamEvent> {
  // Check cache first
  const cached = getCachedResult(oldSnapshotPath, newSnapshotPath);
  if (cached) {
    // Emit all cached changes immediately (filter orphans for safety with old cache data)
    for (const change of cached.changes) {
      if (!isOrphanPath(change.path)) {
        yield { type: "change", data: change };
      }
    }
    yield { type: "done", message: "Loaded from cache", summary: cached.summary };
    return;
  }

  const fullOldPath = `${BTRFS_ROOT}${oldSnapshotPath}`;
  const fullNewPath = `${BTRFS_ROOT}${newSnapshotPath}`;

  const cmd = `btrfs send -p "${fullOldPath}" "${fullNewPath}" 2>/dev/null | btrfs receive --dump 2>/dev/null | grep -vE "^(utimes|chmod|chown|update_extent|set_xattr|snapshot|At subvol) "`;

  const proc = spawn("sh", ["-c", cmd], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const rl = createInterface({
    input: proc.stdout,
    crlfDelay: Infinity,
  });

  // Track orphan state for proper classification
  const orphanToSource = new Map<string, string>(); // orphan path -> original source path
  const pendingOrphanDeletes = new Map<string, FileChange>(); // orphan path -> pending delete change

  // Track newly created files - skip write events for these
  const newlyCreatedFiles = new Set<string>();

  // Track changes for deduplication
  const changeMap = new Map<string, FileChange>();
  let lineCount = 0;

  // Returns true if change was added (not an orphan), false otherwise
  const emitChange = (change: FileChange): boolean => {
    // Final safeguard: skip any orphan paths that slipped through
    if (isOrphanPath(change.path)) {
      return false;
    }
    const key = `${change.type}:${change.path}`;
    const existing = changeMap.get(key);
    if (existing) {
      // Accumulate sizes for writes
      if (change.size) {
        existing.size = (existing.size || 0) + change.size;
      }
    } else {
      changeMap.set(key, change);
    }
    return true;
  };

  try {
    for await (const line of rl) {
      lineCount++;

      // Emit progress every 100 lines
      if (lineCount % 100 === 0) {
        yield { type: "progress", message: `Processed ${lineCount} lines...` };
      }

      const parsed = parseLine(line);
      if (!parsed) continue;

      const { type, rest } = parsed;

      // Handle rename operations specially for orphan tracking
      if (type === "rename") {
        const destMatch = rest.match(/^(.+?)\s+dest=(.+)$/);
        if (destMatch) {
          const sourcePath = extractPath(destMatch[1]);
          const destPath = extractPath(destMatch[2]);
          const strippedSource = stripSnapshotPrefix(sourcePath);
          const strippedDest = stripSnapshotPrefix(destPath);

          // Rename TO orphan = pending delete (wait for rmdir to determine type)
          if (isOrphanPath(strippedDest)) {
            orphanToSource.set(strippedDest, strippedSource);
            // Create pending delete - default to unlink, will change to rmdir if we see rmdir
            pendingOrphanDeletes.set(strippedDest, {
              type: "unlink",
              path: strippedSource,
            });
            continue;
          }

          // Rename FROM orphan = file creation
          if (isOrphanPath(strippedSource)) {
            newlyCreatedFiles.add(strippedDest);
            const linkChange: FileChange = { type: "link", path: strippedDest };
            if (emitChange(linkChange)) {
              yield { type: "change", data: linkChange };
            }
            continue;
          }

          // Normal rename
          if (!isOrphanPath(strippedSource) && !isOrphanPath(strippedDest)) {
            const change: FileChange = {
              type: "rename",
              path: strippedDest,
              oldPath: strippedSource,
            };
            if (emitChange(change)) {
              yield { type: "change", data: change };
            }
          }
        }
        continue;
      }

      // Handle rmdir on orphan - marks it as a directory deletion
      if (type === "rmdir") {
        const rawPath = extractPath(rest);
        const strippedPath = stripSnapshotPrefix(rawPath);

        // Check for orphan in BOTH raw and stripped paths
        // Raw catches: o123-456-0/subfolder (direct orphan cleanup)
        // Stripped catches: ./snapshot/o123-456-0 (orphan with snapshot prefix)
        if (isOrphanPath(rawPath) || isOrphanPath(strippedPath)) {
          const pending = pendingOrphanDeletes.get(strippedPath);
          if (pending) {
            // Update to rmdir and emit
            pending.type = "rmdir";
            if (emitChange(pending)) {
              yield { type: "change", data: pending };
            }
            pendingOrphanDeletes.delete(strippedPath);
          }
          // Skip all orphan paths (including sub-folders being cleaned up)
          continue;
        }

        // Normal rmdir
        const change: FileChange = { type: "rmdir", path: strippedPath };
        if (emitChange(change)) {
          yield { type: "change", data: change };
        }
        continue;
      }

      // Handle unlink on orphan - emit the pending delete
      if (type === "unlink") {
        const rawPath = extractPath(rest);
        const strippedPath = stripSnapshotPrefix(rawPath);

        // Check for orphan in BOTH raw and stripped paths
        // Raw catches: o123-456-0/file (direct orphan cleanup)
        // Stripped catches: ./snapshot/o123-456-0 (orphan with snapshot prefix)
        if (isOrphanPath(rawPath) || isOrphanPath(strippedPath)) {
          const pending = pendingOrphanDeletes.get(strippedPath);
          if (pending) {
            if (emitChange(pending)) {
              yield { type: "change", data: pending };
            }
            pendingOrphanDeletes.delete(strippedPath);
          }
          // Skip all orphan paths (including files being cleaned up)
          continue;
        }

        // Normal unlink
        const change: FileChange = { type: "unlink", path: strippedPath };
        if (emitChange(change)) {
          yield { type: "change", data: change };
        }
        continue;
      }

      // Skip invalid types
      if (!VALID_TYPES.includes(type as ChangeType)) continue;

      // Handle other change types
      const rawPath = extractPath(rest);
      const strippedPath = stripSnapshotPrefix(rawPath);

      // Skip orphan paths (check BOTH raw and stripped)
      if (isOrphanPath(rawPath) || isOrphanPath(strippedPath)) continue;

      // Skip write events for newly created files (they're already tracked as "link"/created)
      if (type === "write" && newlyCreatedFiles.has(strippedPath)) continue;

      const change: FileChange = { type: type as ChangeType, path: strippedPath };

      // Extract size for write operations
      if (type === "write") {
        const lenMatch = rest.match(/len=(\d+)/);
        if (lenMatch) {
          change.size = parseInt(lenMatch[1], 10);
        }
      }

      if (emitChange(change)) {
        yield { type: "change", data: change };
      }
    }

    // Emit any remaining pending orphan deletes
    for (const [, pending] of pendingOrphanDeletes) {
      if (emitChange(pending)) {
        yield { type: "change", data: pending };
      }
    }

    // Calculate summary from deduplicated changes
    const allChanges = Array.from(changeMap.values());
    const summary = {
      added: allChanges.filter(
        (c) => c.type === "mkdir" || c.type === "link" || c.type === "symlink"
      ).length,
      modified: allChanges.filter(
        (c) => c.type === "write" || c.type === "truncate"
      ).length,
      deleted: allChanges.filter(
        (c) => c.type === "unlink" || c.type === "rmdir"
      ).length,
      renamed: allChanges.filter((c) => c.type === "rename").length,
    };

    // Cache the results for future requests
    setCachedResult(oldSnapshotPath, newSnapshotPath, allChanges, summary);

    yield { type: "done", message: `Completed. Processed ${lineCount} lines.`, summary };
  } catch (error) {
    yield { type: "error", message: String(error) };
  } finally {
    proc.kill();
  }
}

/**
 * Get all changes at once (non-streaming, for backward compatibility)
 */
export async function getChangesFromStream(
  oldSnapshotPath: string,
  newSnapshotPath: string
): Promise<{ changes: FileChange[]; summary: { added: number; modified: number; deleted: number; renamed: number } }> {
  const changeMap = new Map<string, FileChange>();
  let summary = { added: 0, modified: 0, deleted: 0, renamed: 0 };

  for await (const event of streamChanges(oldSnapshotPath, newSnapshotPath)) {
    if (event.type === "change" && event.data) {
      const key = `${event.data.type}:${event.data.path}`;
      const existing = changeMap.get(key);
      if (existing && event.data.size) {
        existing.size = (existing.size || 0) + event.data.size;
      } else if (!existing) {
        changeMap.set(key, event.data);
      }
    } else if (event.type === "done" && event.summary) {
      summary = event.summary;
    }
  }

  return { changes: Array.from(changeMap.values()), summary };
}
