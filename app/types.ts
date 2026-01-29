// Btrfs subvolume/snapshot types

export interface Subvolume {
  id: number;
  path: string;
  parentId: number | null;
  uuid: string;
  parentUuid: string | null;
  createdAt: Date;
  isSnapshot: boolean;
}

export interface Snapshot extends Subvolume {
  isSnapshot: true;
  sourceSubvolume: string;
}

export interface SubvolumeInfo {
  path: string;
  uuid: string;
  parentUuid: string | null;
  creationTime: Date;
  snapshots: Snapshot[];
}

// Change types from btrfs send --dump output
// (excluding utimes/chmod/chown - too noisy for practical use)
export type ChangeType =
  | "write"
  | "rename"
  | "unlink"
  | "rmdir"
  | "mkdir"
  | "link"
  | "symlink"
  | "truncate"
  | "clone";

export interface FileChange {
  type: ChangeType;
  path: string;
  oldPath?: string; // for rename operations
  size?: number;
}

export interface SnapshotComparison {
  oldSnapshot: Snapshot;
  newSnapshot: Snapshot;
  changes: FileChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
  };
}

// Diff types
export interface FileDiff {
  path: string;
  isBinary: boolean;
  oldContent?: string;
  newContent?: string;
  unifiedDiff?: string;
  error?: string;
  tooLarge?: boolean;
}

// API response types
export interface BtrfsConfig {
  useMock: boolean;
  rootPath: string;
}

// File browser and history types
export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number; // File size in bytes, or directory size via du
  modifiedAt?: Date;
}

export interface FileContent {
  content: string;
  isBinary: boolean;
  size: number;
  mimeType: string;
}

export interface FileHistoryEntry {
  snapshotPath: string;
  snapshotCreatedAt: Date;
  path: string;
  changeType: 'created' | 'modified' | 'deleted' | 'renamed';
  previousPath?: string;
  size?: number;
  isDirectory?: boolean;
}

export interface FileTimeline {
  currentPath: string;
  aliases: string[]; // All historical paths (for rename tracking)
  history: FileHistoryEntry[]; // Chronologically ordered
  firstSeen: Date;
  lastSeen: Date;
  status: 'active' | 'deleted';
}

export interface IndexStatus {
  exists: boolean;
  complete: boolean;
  progress: {
    current: number;
    total: number;
  };
}
