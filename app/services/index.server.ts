import * as mockBtrfs from "./mock-btrfs.server";
import * as realBtrfs from "./btrfs.server";
import * as realDiff from "./diff.server";
import type {
  Subvolume,
  Snapshot,
  SnapshotComparison,
  FileDiff,
} from "~/types";

// Use demo data when DEMO environment variable is set
const isDemo = process.env.DEMO === "true";
const BTRFS_ROOT = process.env.BTRFS_ROOT || "/";
// Display path for copy commands (defaults to BTRFS_ROOT)
const BTRFS_DISPLAY_PATH = process.env.BTRFS_DISPLAY_PATH || BTRFS_ROOT;

export function isDemoMode(): boolean {
  return isDemo;
}

export function getBtrfsRoot(): string {
  return BTRFS_ROOT;
}

export function getBtrfsDisplayPath(): string {
  return BTRFS_DISPLAY_PATH;
}

export async function getSubvolumes(): Promise<Subvolume[]> {
  if (isDemo) {
    return mockBtrfs.getSubvolumes();
  }
  return realBtrfs.getSubvolumes();
}

export async function getSnapshots(subvolumePath: string): Promise<Snapshot[]> {
  if (isDemo) {
    return mockBtrfs.getSnapshots(subvolumePath);
  }
  return realBtrfs.getSnapshots(subvolumePath);
}

export async function getChanges(
  oldSnapshotPath: string,
  newSnapshotPath: string
): Promise<SnapshotComparison> {
  if (isDemo) {
    return mockBtrfs.getChanges(oldSnapshotPath, newSnapshotPath);
  }
  return realBtrfs.getChanges(oldSnapshotPath, newSnapshotPath);
}

export async function getFileDiff(
  oldSnapshotPath: string,
  newSnapshotPath: string,
  filePath: string
): Promise<FileDiff> {
  if (isDemo) {
    return mockBtrfs.getFileDiff(oldSnapshotPath, newSnapshotPath, filePath);
  }
  return realDiff.getFileDiff(oldSnapshotPath, newSnapshotPath, filePath);
}
