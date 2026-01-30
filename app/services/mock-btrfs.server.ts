/**
 * Mock system for btrfs commands using fixtures
 * Enable with MOCK_BTRFS=true environment variable
 */

import fs from "fs";
import path from "path";

const MOCK_ENABLED = process.env.MOCK_BTRFS === "true";
const FIXTURES_DIR = process.env.FIXTURES_DIR || path.join(process.cwd(), "fixtures");

export function isMockEnabled(): boolean {
  return MOCK_ENABLED;
}

/**
 * Load a fixture file by name
 */
function loadFixture(name: string): string {
  const fixturePath = path.join(FIXTURES_DIR, name);
  try {
    return fs.readFileSync(fixturePath, "utf-8");
  } catch (error) {
    console.error(`Failed to load fixture: ${fixturePath}`, error);
    return "";
  }
}

/**
 * Mock for: btrfs subvolume list -s -o <path>
 * Fixture file: subvolume-list.txt
 */
export function mockSubvolumeList(): string {
  return loadFixture("subvolume-list.txt");
}

/**
 * Mock for: btrfs subvolume show <path>
 * Fixture file: subvolume-show/<snapshot-name>.txt
 * Falls back to subvolume-show-default.txt if specific file not found
 */
export function mockSubvolumeShow(snapshotPath: string): string {
  const snapshotName = path.basename(snapshotPath);
  const specificFixture = path.join("subvolume-show", `${snapshotName}.txt`);
  const specificPath = path.join(FIXTURES_DIR, specificFixture);

  if (fs.existsSync(specificPath)) {
    return loadFixture(specificFixture);
  }

  // Fall back to default fixture
  return loadFixture("subvolume-show-default.txt");
}

/**
 * Mock for: diff -u <file1> <file2>
 * Returns empty string (no diff) by default
 * Fixture file: diffs/<base64-encoded-path>.txt for specific diffs
 */
export function mockDiff(basePath: string, comparePath: string): string {
  // For mocks, return empty diff by default
  return "";
}

/**
 * Mock file tree structure
 * Fixture file: file-tree.json
 * Format: { "path/to/dir": [{ name, isDirectory, size, mtime }] }
 */
let fileTreeCache: Record<string, Array<{ name: string; isDirectory: boolean; size: number; mtime: string }>> | null = null;

export function mockReadDir(dirPath: string, snapshotsRoot: string): fs.Dirent[] {
  if (!fileTreeCache) {
    try {
      const content = loadFixture("file-tree.json");
      fileTreeCache = JSON.parse(content);
    } catch {
      fileTreeCache = {};
    }
  }

  // Get relative path from snapshots root
  const relativePath = dirPath.startsWith(snapshotsRoot)
    ? dirPath.slice(snapshotsRoot.length).replace(/^\//, "")
    : dirPath;

  const entries = fileTreeCache?.[relativePath] || [];

  // Convert to Dirent-like objects
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: () => entry.isDirectory,
    isFile: () => !entry.isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: dirPath,
    parentPath: dirPath,
  })) as fs.Dirent[];
}

/**
 * Mock file stats
 * Uses file-tree.json to provide stats
 */
export function mockStat(filePath: string, snapshotsRoot: string): fs.Stats | null {
  if (!fileTreeCache) {
    try {
      const content = loadFixture("file-tree.json");
      fileTreeCache = JSON.parse(content);
    } catch {
      fileTreeCache = {};
    }
  }

  // Find the file in the tree
  const dirPath = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const relativeDirPath = dirPath.startsWith(snapshotsRoot)
    ? dirPath.slice(snapshotsRoot.length).replace(/^\//, "")
    : dirPath;

  const entries = fileTreeCache?.[relativeDirPath] || [];
  const entry = entries.find((e) => e.name === fileName);

  if (!entry) {
    return null;
  }

  // Return a mock Stats object
  return {
    isFile: () => !entry.isDirectory,
    isDirectory: () => entry.isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    size: entry.size || 0,
    mtime: new Date(entry.mtime || Date.now()),
    atime: new Date(entry.mtime || Date.now()),
    ctime: new Date(entry.mtime || Date.now()),
    birthtime: new Date(entry.mtime || Date.now()),
    mtimeMs: new Date(entry.mtime || Date.now()).getTime(),
    atimeMs: new Date(entry.mtime || Date.now()).getTime(),
    ctimeMs: new Date(entry.mtime || Date.now()).getTime(),
    birthtimeMs: new Date(entry.mtime || Date.now()).getTime(),
    dev: 0,
    ino: 0,
    mode: entry.isDirectory ? 16877 : 33188,
    nlink: 1,
    uid: 1000,
    gid: 1000,
    rdev: 0,
    blksize: 4096,
    blocks: Math.ceil((entry.size || 0) / 512),
  } as fs.Stats;
}

/**
 * Mock file content
 * Fixture file: file-contents/<base64-or-path>.txt
 * Or returns placeholder for binary/large files
 */
export function mockReadFile(filePath: string, snapshotsRoot: string): Buffer {
  const relativePath = filePath.startsWith(snapshotsRoot)
    ? filePath.slice(snapshotsRoot.length).replace(/^\//, "")
    : filePath;

  // Try to load specific fixture
  const safeFileName = relativePath.replace(/\//g, "__");
  const fixturePath = path.join("file-contents", safeFileName);
  const fullFixturePath = path.join(FIXTURES_DIR, fixturePath);

  if (fs.existsSync(fullFixturePath)) {
    return fs.readFileSync(fullFixturePath);
  }

  // Return placeholder content based on extension
  const ext = path.extname(filePath).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".mp4", ".mkv", ".mp3", ".flac", ".zip", ".tar", ".gz", ".iso"].includes(ext)) {
    // Binary placeholder (contains null byte to be detected as binary)
    return Buffer.from([0x00, 0x42, 0x49, 0x4e, 0x41, 0x52, 0x59]);
  }

  // Text placeholder
  return Buffer.from(`# Mock content for ${path.basename(filePath)}\n\nThis is placeholder content in mock mode.\n`);
}
