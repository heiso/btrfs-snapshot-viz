import { readFile, stat } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import type { FileDiff } from "~/types";

const execAsync = promisify(exec);

const BTRFS_ROOT = process.env.BTRFS_ROOT || "/";
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const BINARY_CHECK_SIZE = 8192; // Check first 8KB for binary content

/**
 * Check if a file is binary by looking for null bytes
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const fd = await readFile(filePath);
    const buffer = fd.subarray(0, BINARY_CHECK_SIZE);

    // Check for null bytes
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get file size
 */
async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Read file content as string
 */
async function readFileContent(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch {
    return null;
  }
}

/**
 * Generate unified diff between two files using system diff command
 */
async function generateUnifiedDiff(
  oldPath: string,
  newPath: string,
  label: string
): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `diff -u --label "a${label}" --label "b${label}" "${oldPath}" "${newPath}" 2>/dev/null || true`
    );
    return stdout;
  } catch {
    // diff returns exit code 1 when files differ, which throws
    return "";
  }
}

/**
 * Get diff between a file in two snapshots
 */
export async function getFileDiff(
  oldSnapshotPath: string,
  newSnapshotPath: string,
  filePath: string
): Promise<FileDiff> {
  // Construct full paths (BTRFS_ROOT + snapshot path + / + file path)
  const oldFullPath = `${BTRFS_ROOT}${oldSnapshotPath}/${filePath}`;
  const newFullPath = `${BTRFS_ROOT}${newSnapshotPath}/${filePath}`;

  // Check file sizes
  const oldSize = await getFileSize(oldFullPath);
  const newSize = await getFileSize(newFullPath);

  // Check if too large
  if (oldSize > MAX_FILE_SIZE || newSize > MAX_FILE_SIZE) {
    return {
      path: filePath,
      isBinary: false,
      tooLarge: true,
      error: `File too large (${Math.max(oldSize, newSize)} bytes, max ${MAX_FILE_SIZE} bytes)`,
    };
  }

  // Check if binary
  const oldIsBinary = oldSize > 0 ? await isBinaryFile(oldFullPath) : false;
  const newIsBinary = newSize > 0 ? await isBinaryFile(newFullPath) : false;

  if (oldIsBinary || newIsBinary) {
    return {
      path: filePath,
      isBinary: true,
    };
  }

  // Read file contents
  const oldContent = await readFileContent(oldFullPath);
  const newContent = await readFileContent(newFullPath);

  // Generate unified diff
  let unifiedDiff = "";
  if (oldContent !== null && newContent !== null) {
    unifiedDiff = await generateUnifiedDiff(oldFullPath, newFullPath, filePath);
  } else if (oldContent === null && newContent !== null) {
    // New file
    unifiedDiff = `--- /dev/null\n+++ b${filePath}\n@@ -0,0 +1,${newContent.split("\n").length} @@\n${newContent
      .split("\n")
      .map((l) => `+${l}`)
      .join("\n")}`;
  } else if (oldContent !== null && newContent === null) {
    // Deleted file
    unifiedDiff = `--- a${filePath}\n+++ /dev/null\n@@ -1,${oldContent.split("\n").length} +0,0 @@\n${oldContent
      .split("\n")
      .map((l) => `-${l}`)
      .join("\n")}`;
  }

  return {
    path: filePath,
    isBinary: false,
    oldContent: oldContent || undefined,
    newContent: newContent || undefined,
    unifiedDiff,
  };
}
