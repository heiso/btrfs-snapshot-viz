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
