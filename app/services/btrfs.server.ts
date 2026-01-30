import { execSync, execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import {
  isMockEnabled,
  mockSubvolumeList,
  mockSubvolumeShow,
  mockReadDir,
  mockStat,
  mockReadFile,
} from "./mock-btrfs.server";

const SNAPSHOTS_ROOT = process.env.SNAPSHOTS_ROOT || "/mnt/snapshots";

export interface BtrfsSubvolume {
  id: number;
  gen: number;
  path: string;
  name: string;
  uuid?: string;
  parentUuid?: string;
  createdAt?: string;
  isReadonly: boolean;
}

/**
 * Escape a string for safe use in shell commands
 */
function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Validate that a path is within the snapshots root (security)
 */
export function validatePath(requestedPath: string): string {
  const resolved = path.resolve(requestedPath);
  const root = path.resolve(SNAPSHOTS_ROOT);

  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Path outside snapshots root");
  }
  return resolved;
}

/**
 * Get the snapshots root path
 */
export function getSnapshotsRoot(): string {
  return SNAPSHOTS_ROOT;
}

/**
 * List all btrfs subvolumes (snapshots) under the root
 */
export function listSubvolumes(): BtrfsSubvolume[] {
  try {
    let output: string;

    if (isMockEnabled()) {
      output = mockSubvolumeList();
    } else {
      output = execSync(
        `btrfs subvolume list -s -o ${shellEscape(SNAPSHOTS_ROOT)}`,
        { encoding: "utf-8", timeout: 30000 }
      );
    }

    return parseSubvolumeList(output);
  } catch (error) {
    console.error("Failed to list btrfs subvolumes:", error);
    return [];
  }
}

/**
 * Parse the output of `btrfs subvolume list`
 */
function parseSubvolumeList(output: string): BtrfsSubvolume[] {
  const subvolumes: BtrfsSubvolume[] = [];
  const lines = output.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    // Format: ID <id> gen <gen> cgen <cgen> top level <tl> otime <otime> path <path>
    const match = line.match(
      /ID\s+(\d+)\s+gen\s+(\d+)\s+.*?path\s+(.+)/
    );

    if (match) {
      const [, id, gen, subvolPath] = match;
      // Use basename only - btrfs returns paths like "@snapshots/2026-01-30_00:00:01"
      // but SNAPSHOTS_ROOT is already the mount point of the snapshots subvolume
      const name = path.basename(subvolPath);
      const fullPath = path.join(SNAPSHOTS_ROOT, name);

      // Try to extract otime if present
      const otimeMatch = line.match(/otime\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
      const createdAt = otimeMatch ? new Date(otimeMatch[1]).toISOString() : undefined;

      subvolumes.push({
        id: parseInt(id, 10),
        gen: parseInt(gen, 10),
        path: fullPath,
        name,
        createdAt,
        isReadonly: true, // Snapshots are typically readonly
      });
    }
  }

  // Sort by name (which usually contains date) descending
  return subvolumes.sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Get detailed info about a specific subvolume
 */
export function getSubvolumeInfo(subvolPath: string): BtrfsSubvolume | null {
  const validPath = validatePath(subvolPath);

  try {
    let output: string;

    if (isMockEnabled()) {
      output = mockSubvolumeShow(validPath);
    } else {
      output = execSync(`btrfs subvolume show ${shellEscape(validPath)}`, {
        encoding: "utf-8",
        timeout: 10000,
      });
    }

    return parseSubvolumeShow(output, validPath);
  } catch (error) {
    console.error("Failed to get subvolume info:", error);
    return null;
  }
}

/**
 * Parse the output of `btrfs subvolume show`
 */
function parseSubvolumeShow(
  output: string,
  subvolPath: string
): BtrfsSubvolume {
  const lines = output.split("\n");

  let uuid: string | undefined;
  let parentUuid: string | undefined;
  let createdAt: string | undefined;
  let id = 0;
  let gen = 0;
  let isReadonly = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("UUID:")) {
      uuid = trimmed.split(":")[1]?.trim();
    } else if (trimmed.startsWith("Parent UUID:")) {
      const val = trimmed.split(":").slice(1).join(":").trim();
      parentUuid = val === "-" ? undefined : val;
    } else if (trimmed.startsWith("Creation time:")) {
      createdAt = trimmed.split(":").slice(1).join(":").trim();
    } else if (trimmed.startsWith("Subvolume ID:")) {
      id = parseInt(trimmed.split(":")[1]?.trim() || "0", 10);
    } else if (trimmed.startsWith("Generation:")) {
      gen = parseInt(trimmed.split(":")[1]?.trim() || "0", 10);
    } else if (trimmed.startsWith("Flags:")) {
      isReadonly = trimmed.includes("readonly");
    }
  }

  return {
    id,
    gen,
    path: subvolPath,
    name: path.basename(subvolPath),
    uuid,
    parentUuid,
    createdAt,
    isReadonly,
  };
}

/**
 * Read directory contents (with mock support)
 */
export function readDirectory(dirPath: string): fs.Dirent[] {
  if (isMockEnabled()) {
    return mockReadDir(dirPath, SNAPSHOTS_ROOT);
  }
  return fs.readdirSync(dirPath, { withFileTypes: true });
}

/**
 * Get file stats (with mock support)
 */
export function getFileStat(filePath: string): fs.Stats {
  if (isMockEnabled()) {
    const mockStats = mockStat(filePath, SNAPSHOTS_ROOT);
    if (mockStats) {
      return mockStats;
    }
    throw new Error(`Mock stat not found for: ${filePath}`);
  }
  return fs.statSync(filePath);
}

/**
 * Read file content (with mock support)
 */
export function readFile(filePath: string): Buffer {
  if (isMockEnabled()) {
    return mockReadFile(filePath, SNAPSHOTS_ROOT);
  }
  return fs.readFileSync(filePath);
}

/**
 * Read file content from a snapshot
 */
export function readFileContent(
  snapshotPath: string,
  filePath: string
): { content: string; size: number; isBinary: boolean; isTruncated: boolean } {
  const fullPath = validatePath(path.join(snapshotPath, filePath));
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB max

  const stat = getFileStat(fullPath);

  if (stat.isDirectory()) {
    throw new Error("Cannot read directory content");
  }

  // Check if binary by reading first few bytes
  const buffer = readFile(fullPath);
  const headerSize = Math.min(8192, buffer.length);
  const header = buffer.subarray(0, headerSize);

  const isBinary = header.some((byte) => byte === 0);

  if (isBinary) {
    return {
      content: "",
      size: stat.size,
      isBinary: true,
      isTruncated: false,
    };
  }

  let content: string;
  let isTruncated = false;

  if (stat.size > MAX_SIZE) {
    content = buffer.subarray(0, MAX_SIZE).toString("utf-8");
    isTruncated = true;
  } else {
    content = buffer.toString("utf-8");
  }

  return {
    content,
    size: stat.size,
    isBinary: false,
    isTruncated,
  };
}

/**
 * Get text diff between two files
 */
export function getTextDiff(
  baseSnapshotPath: string,
  compareSnapshotPath: string,
  filePath: string
): string {
  const basePath = validatePath(path.join(baseSnapshotPath, filePath));
  const comparePath = validatePath(path.join(compareSnapshotPath, filePath));

  try {
    // Use diff command - it returns exit code 1 when files differ
    const result = execFileSync(
      "diff",
      ["-u", "--label", `a/${filePath}`, "--label", `b/${filePath}`, basePath, comparePath],
      { encoding: "utf-8", timeout: 10000 }
    );
    return result; // Empty string means no differences
  } catch (error: unknown) {
    const execError = error as { status?: number; stdout?: string };
    if (execError.status === 1 && execError.stdout) {
      return execError.stdout; // Has differences
    }
    throw error;
  }
}
