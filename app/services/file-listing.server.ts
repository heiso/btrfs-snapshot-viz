import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { DirectoryEntry, FileContent } from '~/types';

const execFileAsync = promisify(execFile);

// Get BTRFS_ROOT from environment or use default
const BTRFS_ROOT = process.env.BTRFS_ROOT || '/mnt/btrfs';

// Cache for directory sizes (du is expensive)
interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

const directorySizeCache = new Map<string, CacheEntry<number>>();
const directoryContentsCache = new Map<string, CacheEntry<DirectoryEntry[]>>();
const fileContentCache = new Map<string, CacheEntry<FileContent>>();

const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Clear expired entries from a cache
 */
function clearExpiredCache<T>(cache: Map<string, CacheEntry<T>>) {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

/**
 * Get value from cache if not expired
 */
function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Set value in cache
 */
function setInCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, { value, timestamp: Date.now() });
}

/**
 * Calculate directory size using du -sb command
 * Returns size in bytes
 * Uses execFile for safe argument passing (no shell injection)
 */
async function calculateDirectorySize(fullPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('du', ['-sb', fullPath]);
    const match = stdout.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch (error) {
    console.error(`Error calculating directory size for ${fullPath}:`, error);
    return 0;
  }
}

/**
 * Get directory size with caching
 */
async function getDirectorySize(fullPath: string): Promise<number> {
  // Check cache first
  const cached = getFromCache(directorySizeCache, fullPath);
  if (cached !== null) {
    return cached;
  }

  // Calculate and cache
  const size = await calculateDirectorySize(fullPath);
  setInCache(directorySizeCache, fullPath, size);

  // Periodically clean expired cache entries
  if (directorySizeCache.size > 1000) {
    clearExpiredCache(directorySizeCache);
  }

  return size;
}

/**
 * Get file size using fs.stat
 */
async function getFileSize(fullPath: string): Promise<number> {
  try {
    const stats = await fs.stat(fullPath);
    return stats.size;
  } catch (error) {
    console.error(`Error getting file size for ${fullPath}:`, error);
    return 0;
  }
}

/**
 * Get size for a directory entry (file or directory)
 */
async function getEntrySize(fullPath: string, isDirectory: boolean): Promise<number> {
  if (isDirectory) {
    return getDirectorySize(fullPath);
  }
  return getFileSize(fullPath);
}

/**
 * List contents of a directory at a specific snapshot
 *
 * @param snapshotPath - The snapshot path (e.g., "/@snapshots/2026-01-29_00:00:01")
 * @param dirPath - The directory path within the snapshot (e.g., "/", "/home/user")
 * @param includeSize - Whether to calculate sizes (default: true)
 * @returns Array of directory entries with metadata
 */
export async function getDirectoryContents(
  snapshotPath: string,
  dirPath: string = '/',
  includeSize: boolean = true
): Promise<DirectoryEntry[]> {
  // Normalize paths
  const normalizedDirPath = dirPath.startsWith('/') ? dirPath : `/${dirPath}`;
  const fullPath = path.join(BTRFS_ROOT, snapshotPath, normalizedDirPath);

  // Check cache
  const cacheKey = `${snapshotPath}:${normalizedDirPath}:${includeSize}`;
  const cached = getFromCache(directoryContentsCache, cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Read directory
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    // Process entries
    const results: DirectoryEntry[] = [];

    for (const entry of entries) {
      const entryPath = path.join(normalizedDirPath, entry.name);
      const entryFullPath = path.join(fullPath, entry.name);

      // Handle symlinks by resolving them
      let isDirectory = entry.isDirectory();
      let stats = null;

      if (entry.isSymbolicLink()) {
        try {
          stats = await fs.stat(entryFullPath); // Follow symlink
          isDirectory = stats.isDirectory();
        } catch {
          // Broken symlink, skip it
          continue;
        }
      }

      // Get size if requested
      let size = 0;
      let modifiedAt: Date | undefined;

      if (includeSize) {
        size = await getEntrySize(entryFullPath, isDirectory);
      }

      // Get modification time
      if (!stats) {
        try {
          stats = await fs.stat(entryFullPath);
        } catch {
          // Permission error or file disappeared
          continue;
        }
      }

      if (stats) {
        modifiedAt = stats.mtime;
      }

      results.push({
        name: entry.name,
        path: entryPath,
        isDirectory,
        size,
        modifiedAt
      });
    }

    // Sort: directories first, then by name
    results.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    // Cache results
    setInCache(directoryContentsCache, cacheKey, results);

    // Periodically clean expired cache entries
    if (directoryContentsCache.size > 100) {
      clearExpiredCache(directoryContentsCache);
    }

    return results;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Directory not found: ${snapshotPath}${normalizedDirPath}`);
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(`Permission denied: ${snapshotPath}${normalizedDirPath}`);
    }
    throw error;
  }
}

/**
 * Get information about a specific file or directory
 *
 * @param snapshotPath - The snapshot path
 * @param filePath - The file/directory path within the snapshot
 * @returns Directory entry with metadata, or null if not found
 */
export async function getFileInfo(
  snapshotPath: string,
  filePath: string
): Promise<DirectoryEntry | null> {
  const normalizedFilePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  const fullPath = path.join(BTRFS_ROOT, snapshotPath, normalizedFilePath);

  try {
    const stats = await fs.stat(fullPath);
    const isDirectory = stats.isDirectory();
    const size = isDirectory
      ? await getDirectorySize(fullPath)
      : stats.size;

    return {
      name: path.basename(filePath),
      path: normalizedFilePath,
      isDirectory,
      size,
      modifiedAt: stats.mtime
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Read file content from a snapshot
 *
 * @param snapshotPath - The snapshot path
 * @param filePath - The file path within the snapshot
 * @returns File content with metadata
 */
export async function getFileContent(
  snapshotPath: string,
  filePath: string
): Promise<FileContent> {
  const normalizedFilePath = filePath.startsWith('/') ? filePath : `/${filePath}`;
  const fullPath = path.join(BTRFS_ROOT, snapshotPath, normalizedFilePath);

  // Check cache
  const cacheKey = `${snapshotPath}:${normalizedFilePath}`;
  const cached = getFromCache(fileContentCache, cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      throw new Error('Cannot read directory as file');
    }

    // Check file size - limit to 10MB for text files
    const MAX_TEXT_SIZE = 10 * 1024 * 1024;
    if (stats.size > MAX_TEXT_SIZE) {
      const result: FileContent = {
        content: '',
        isBinary: true,
        size: stats.size,
        mimeType: 'application/octet-stream'
      };
      setInCache(fileContentCache, cacheKey, result);
      return result;
    }

    // Read file
    const buffer = await fs.readFile(fullPath);

    // Detect if binary by checking for null bytes in first 8KB
    const sampleSize = Math.min(buffer.length, 8192);
    const sample = buffer.subarray(0, sampleSize);
    const isBinary = sample.includes(0);

    // Determine MIME type based on extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.jsx': 'text/javascript',
      '.tsx': 'text/typescript',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.sh': 'text/x-shellscript',
      '.py': 'text/x-python',
      '.rb': 'text/x-ruby',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.c': 'text/x-c',
      '.cpp': 'text/x-c++',
      '.h': 'text/x-c',
      '.hpp': 'text/x-c++',
      '.java': 'text/x-java',
      '.xml': 'text/xml',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.toml': 'text/x-toml',
      '.ini': 'text/plain',
      '.conf': 'text/plain',
      '.log': 'text/plain'
    };

    const mimeType = isBinary
      ? 'application/octet-stream'
      : (mimeTypes[ext] || 'text/plain');

    const result: FileContent = {
      content: isBinary ? '' : buffer.toString('utf-8'),
      isBinary,
      size: stats.size,
      mimeType
    };

    // Cache result
    setInCache(fileContentCache, cacheKey, result);

    // Periodically clean expired cache entries
    if (fileContentCache.size > 100) {
      clearExpiredCache(fileContentCache);
    }

    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${snapshotPath}${normalizedFilePath}`);
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(`Permission denied: ${snapshotPath}${normalizedFilePath}`);
    }
    throw error;
  }
}

/**
 * Clear all caches (useful for testing)
 */
export function clearCaches() {
  directorySizeCache.clear();
  directoryContentsCache.clear();
  fileContentCache.clear();
}
