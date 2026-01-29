import { exec } from "child_process";
import { promisify } from "util";
import type {
  Subvolume,
  Snapshot,
  FileChange,
  SnapshotComparison,
  ChangeType,
} from "~/types";

const execAsync = promisify(exec);

// Configuration - can be overridden via environment
const BTRFS_ROOT = process.env.BTRFS_ROOT || "/";

/**
 * Safely escape a string for use in shell commands
 * Wraps string in single quotes and escapes any single quotes
 */
function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

// In-memory cache for comparison results
const comparisonCache = new Map<string, { data: SnapshotComparison; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour TTL

function getCacheKey(oldPath: string, newPath: string): string {
  return `${oldPath}:${newPath}`;
}

function getCachedComparison(oldPath: string, newPath: string): SnapshotComparison | null {
  const key = getCacheKey(oldPath, newPath);
  const cached = comparisonCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  if (cached) {
    comparisonCache.delete(key); // Expired
  }
  return null;
}

function setCachedComparison(oldPath: string, newPath: string, data: SnapshotComparison): void {
  const key = getCacheKey(oldPath, newPath);
  comparisonCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Execute a btrfs command and return stdout
 */
async function runBtrfs(args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`btrfs ${args}`, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return stdout;
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    throw new Error(`btrfs command failed: ${err.stderr || err.message}`);
  }
}

/**
 * List all subvolumes on the filesystem
 */
export async function getSubvolumes(): Promise<Subvolume[]> {
  const output = await runBtrfs(`subvolume list -t ${shellEscape(BTRFS_ROOT)}`);
  const lines = output.trim().split("\n");

  // Skip header lines
  const dataLines = lines.slice(2);
  const subvolumes: Subvolume[] = [];

  for (const line of dataLines) {
    // Format: ID gen top level path
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4) {
      const id = parseInt(parts[0], 10);
      const parentId = parseInt(parts[2], 10);
      const path = parts.slice(3).join(" ");

      // Get more details
      const info = await getSubvolumeInfo(path);

      subvolumes.push({
        id,
        path: `/${path}`,
        parentId: parentId === 5 ? null : parentId,
        uuid: info.uuid,
        parentUuid: info.parentUuid,
        createdAt: info.createdAt,
        isSnapshot: info.parentUuid !== null,
      });
    }
  }

  return subvolumes;
}

/**
 * Get detailed info about a subvolume
 */
async function getSubvolumeInfo(path: string): Promise<{
  uuid: string;
  parentUuid: string | null;
  createdAt: Date;
}> {
  try {
    const output = await runBtrfs(`subvolume show ${shellEscape(`${BTRFS_ROOT}/${path}`)}`);
    const lines = output.split("\n");

    let uuid = "";
    let parentUuid: string | null = null;
    let createdAt = new Date();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("UUID:")) {
        uuid = trimmed.split(/\s+/)[1] || "";
      } else if (trimmed.startsWith("Parent UUID:")) {
        const val = trimmed.split(/\s+/)[2];
        parentUuid = val && val !== "-" ? val : null;
      } else if (trimmed.startsWith("Creation time:")) {
        const dateStr = trimmed.replace("Creation time:", "").trim();
        createdAt = new Date(dateStr);
      }
    }

    return { uuid, parentUuid, createdAt };
  } catch {
    return {
      uuid: "",
      parentUuid: null,
      createdAt: new Date(),
    };
  }
}

/**
 * Get snapshots for a specific subvolume
 */
export async function getSnapshots(subvolumePath: string): Promise<Snapshot[]> {
  const allSubvolumes = await getSubvolumes();

  // Find snapshots that have this subvolume as their source
  // This is determined by checking parent UUID or path patterns
  const snapshots: Snapshot[] = [];

  for (const sv of allSubvolumes) {
    if (sv.isSnapshot) {
      // Check if this snapshot is related to the target subvolume
      // This heuristic can be improved based on your snapshot naming convention
      if (
        sv.path.includes(subvolumePath.replace(/^\//, "")) ||
        sv.path.includes(".snapshots")
      ) {
        snapshots.push({
          ...sv,
          isSnapshot: true,
          sourceSubvolume: subvolumePath,
        });
      }
    }
  }

  // Sort by creation date
  snapshots.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  return snapshots;
}

/**
 * Get changes between two snapshots using btrfs send --dump
 */
export async function getChanges(
  oldSnapshotPath: string,
  newSnapshotPath: string
): Promise<SnapshotComparison> {
  // Check cache first
  const cached = getCachedComparison(oldSnapshotPath, newSnapshotPath);
  if (cached) {
    return cached;
  }

  // Get snapshot info
  const allSubvolumes = await getSubvolumes();
  const oldSnapshot = allSubvolumes.find(
    (s) => s.path === oldSnapshotPath
  ) as Snapshot;
  const newSnapshot = allSubvolumes.find(
    (s) => s.path === newSnapshotPath
  ) as Snapshot;

  if (!oldSnapshot || !newSnapshot) {
    throw new Error("Snapshot not found");
  }

  // Use btrfs send to get changes
  const changes = await getIncrementalChanges(oldSnapshotPath, newSnapshotPath);

  const summary = {
    added: changes.filter(
      (c) => c.type === "mkdir" || c.type === "link" || c.type === "symlink"
    ).length,
    modified: changes.filter(
      (c) => c.type === "write" || c.type === "truncate"
    ).length,
    deleted: changes.filter((c) => c.type === "unlink" || c.type === "rmdir")
      .length,
    renamed: changes.filter((c) => c.type === "rename").length,
  };

  const result: SnapshotComparison = {
    oldSnapshot,
    newSnapshot,
    changes,
    summary,
  };

  // Cache the result
  setCachedComparison(oldSnapshotPath, newSnapshotPath, result);

  return result;
}

/**
 * Parse btrfs send --dump output to get file changes
 */
async function getIncrementalChanges(
  oldPath: string,
  newPath: string
): Promise<FileChange[]> {
  // Prepend BTRFS_ROOT to paths
  const fullOldPath = `${BTRFS_ROOT}${oldPath}`;
  const fullNewPath = `${BTRFS_ROOT}${newPath}`;

  try {
    // btrfs send piped to btrfs receive --dump to get human-readable output
    // We need file data to get write operations that show actual file changes
    // Filter out noisy changes (timestamps, permissions) at shell level to reduce output size
    const { stdout } = await execAsync(
      `btrfs send -p ${shellEscape(fullOldPath)} ${shellEscape(fullNewPath)} 2>/dev/null | btrfs receive --dump 2>/dev/null | grep -vE "^(utimes|chmod|chown|update_extent) "`,
      { maxBuffer: 200 * 1024 * 1024 }
    );

    return parseSendDump(stdout);
  } catch (error) {
    console.error("Failed to get incremental changes:", error);
    return [];
  }
}

/**
 * Extract path from btrfs dump output, handling escaped characters
 * - Escaped spaces: path/to/save\ ff8\ ps1/file
 * - Octal escapes for UTF-8: \303\251 = é
 */
function extractPath(str: string): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      // Check for octal escape (e.g., \303)
      const octalMatch = str.slice(i + 1).match(/^([0-7]{1,3})/);
      if (octalMatch) {
        const octalValue = parseInt(octalMatch[1], 8);
        bytes.push(octalValue);
        i += 1 + octalMatch[1].length;
      } else {
        // Simple escape (e.g., \  for space)
        bytes.push(str.charCodeAt(i + 1));
        i += 2;
      }
    } else if (str[i] === " ") {
      // Check if this is the " -> " rename separator
      if (str.slice(i).startsWith(" -> ")) {
        break;
      }
      // Check if followed by known attributes (offset=, len=, etc.)
      const remaining = str.slice(i + 1);
      if (remaining.match(/^(offset|len|atime|mtime|ctime|mode|uid|gid|dest|uuid|transid|parent_uuid|parent_transid)=/)) {
        break;
      }
      // Otherwise continue (shouldn't normally happen)
      bytes.push(str.charCodeAt(i));
      i++;
    } else {
      bytes.push(str.charCodeAt(i));
      i++;
    }
  }
  // Decode bytes as UTF-8
  return Buffer.from(bytes).toString("utf-8");
}

/**
 * Strip the snapshot prefix from paths (e.g., "./2026-01-28_00:00:01/storage/..." -> "storage/...")
 */
function stripSnapshotPrefix(path: string): string {
  // Remove leading ./ if present
  if (path.startsWith("./")) {
    path = path.slice(2);
  }
  // Remove the snapshot folder name (first path component)
  const slashIndex = path.indexOf("/");
  if (slashIndex !== -1) {
    return path.slice(slashIndex + 1);
  }
  return path;
}

/**
 * Parse the output of btrfs receive --dump
 */
function parseSendDump(output: string): FileChange[] {
  const changes: FileChange[] = [];
  const lines = output.split("\n");

  // Track orphan objects: orphan path -> original path
  // This helps us determine if a deletion was a file or folder
  const orphanToOriginal = new Map<string, string>();
  // Track rmdir operations on orphan objects
  const orphanRmdirs = new Set<string>();

  // First pass: collect all orphan mappings and rmdir operations on orphans
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\w+)\s+(.+)$/);
    if (!match) continue;

    const [, operation, rest] = match;
    const type = operation.toLowerCase();

    if (type === "rename") {
      const destMatch = rest.match(/^(.+?)\s+dest=(.+)$/);
      if (destMatch) {
        const sourcePath = extractPath(destMatch[1]);
        const destPath = extractPath(destMatch[2]);
        const strippedSource = stripSnapshotPrefix(sourcePath);
        const strippedDest = stripSnapshotPrefix(destPath);

        // Track renames TO orphan objects
        if (strippedDest.match(/^o\d+-\d+-\d+(\/|$)/)) {
          orphanToOriginal.set(strippedDest, strippedSource);
        }
      }
    } else if (type === "rmdir") {
      const rawPath = extractPath(rest);
      const strippedPath = stripSnapshotPrefix(rawPath);
      // Track rmdir on orphan objects
      if (strippedPath.match(/^o\d+-\d+-\d+(\/|$)/)) {
        orphanRmdirs.add(strippedPath);
      }
    }
  }

  // Second pass: process all changes with orphan knowledge
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Parse lines like: "write        ./snapshot/path/to/file offset=0 len=1234"
    // or "rename       ./snapshot/old/path -> ./snapshot/new/path"
    const match = trimmed.match(/^(\w+)\s+(.+)$/);
    if (!match) continue;

    const [, operation, rest] = match;
    const type = operation.toLowerCase() as ChangeType;

    // Valid change types (excluding utimes/chmod/chown - too noisy)
    const validTypes: ChangeType[] = [
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

    if (!validTypes.includes(type)) continue;

    const change: FileChange = { type, path: "" };

    if (type === "rename") {
      // Parse rename: ./snapshot/path dest=./snapshot/newpath
      const destMatch = rest.match(/^(.+?)\s+dest=(.+)$/);
      if (destMatch) {
        const sourcePath = extractPath(destMatch[1]);
        const destPath = extractPath(destMatch[2]);
        const strippedSource = stripSnapshotPrefix(sourcePath);
        const strippedDest = stripSnapshotPrefix(destPath);

        // If renamed TO an orphan object, treat as delete
        // Check if this orphan later receives rmdir (it's a folder) or unlink (it's a file)
        if (strippedDest.match(/^o\d+-\d+-\d+(\/|$)/)) {
          // If this orphan gets rmdir'd later, it's a folder deletion
          if (orphanRmdirs.has(strippedDest)) {
            change.type = "rmdir";
          } else {
            change.type = "unlink";
          }
          change.path = strippedSource;
        }
        // If renamed FROM an orphan object, treat as create (use link for files)
        else if (strippedSource.match(/^o\d+-\d+-\d+(\/|$)/)) {
          change.type = "link";
          change.path = strippedDest;
        }
        // Normal rename
        else {
          change.oldPath = strippedSource;
          change.path = strippedDest;
        }
      }
    } else {
      // Extract path (handles escaped spaces)
      const rawPath = extractPath(rest);
      change.path = stripSnapshotPrefix(rawPath);

      // Try to extract size for write operations
      if (type === "write") {
        const lenMatch = rest.match(/len=(\d+)/);
        if (lenMatch) {
          change.size = parseInt(lenMatch[1], 10);
        }
      }
    }

    if (change.path) {
      // Skip btrfs internal orphan objects (o123456-789-0 pattern)
      // These are temporary/cleanup artifacts, not user data
      if (change.path.match(/^o\d+-\d+-\d+(\/|$)/)) {
        continue;
      }
      changes.push(change);
    }
  }

  // Deduplicate and merge multiple writes to same file
  const pathMap = new Map<string, FileChange>();
  for (const change of changes) {
    const key = `${change.type}:${change.path}`;
    if (!pathMap.has(key)) {
      pathMap.set(key, change);
    } else if (change.size) {
      // Accumulate sizes for writes
      const existing = pathMap.get(key)!;
      existing.size = (existing.size || 0) + change.size;
    }
  }

  return Array.from(pathMap.values());
}
