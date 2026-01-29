import { useState } from "react";
import { Link } from "react-router";
import type { FileChange, ChangeType } from "~/types";

interface ChangesViewProps {
  changes: FileChange[];
  oldSnapshotPath: string;
  newSnapshotPath: string;
}

// Tree node structure for hierarchical display
interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  change?: FileChange;
  children: TreeNode[];
}

const changeTypeConfig: Record<
  ChangeType,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  write: {
    label: "Modified",
    color: "text-amber-700 dark:text-amber-300",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  },
  mkdir: {
    label: "Created",
    color: "text-green-700 dark:text-green-300",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    icon: "M12 4v16m8-8H4",
  },
  unlink: {
    label: "Deleted",
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  },
  rmdir: {
    label: "Removed",
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  },
  rename: {
    label: "Renamed",
    color: "text-purple-700 dark:text-purple-300",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    icon: "M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4",
  },
  link: {
    label: "Created",
    color: "text-green-700 dark:text-green-300",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    icon: "M12 4v16m8-8H4",
  },
  symlink: {
    label: "Symlink",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  },
  truncate: {
    label: "Truncated",
    color: "text-amber-700 dark:text-amber-300",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    icon: "M4 6h16M4 12h16m-7 6h7",
  },
  clone: {
    label: "Cloned",
    color: "text-cyan-700 dark:text-cyan-300",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    icon: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
  },
};

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Simple folder icon
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  );
}

// Simple file icon
function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Chevron icon for expand/collapse
function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      className={`${className} transition-transform ${expanded ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

/**
 * Build a tree structure from flat file changes
 */
function buildTree(changes: FileChange[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Sort changes by path for consistent tree building
  const sortedChanges = [...changes].sort((a, b) => a.path.localeCompare(b.path));

  for (const change of sortedChanges) {
    const segments = change.path.split("/").filter(Boolean);
    let currentPath = "";
    let currentLevel = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      let node = nodeMap.get(currentPath);

      if (!node) {
        node = {
          name: segment,
          path: currentPath,
          isFolder: !isLast,
          children: [],
        };
        nodeMap.set(currentPath, node);
        currentLevel.push(node);
      }

      // If this is the file with the change, attach the change info
      if (isLast) {
        node.change = change;
        // Folder operations (mkdir, rmdir) are folders
        node.isFolder = change.type === "mkdir" || change.type === "rmdir";
      }

      currentLevel = node.children;
    }
  }

  return root;
}

/**
 * Determine if a file can have a diff view
 */
function canDiff(change: FileChange): boolean {
  return change.type === "write" || change.type === "truncate";
}

// Recursive tree node component
function TreeNodeComponent({
  node,
  depth,
  collapsed,
  onToggle,
  oldSnapshotPath,
  newSnapshotPath,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  oldSnapshotPath: string;
  newSnapshotPath: string;
}) {
  const isCollapsed = collapsed.has(node.path);
  const hasChildren = node.children.length > 0;
  const config = node.change ? changeTypeConfig[node.change.type] : null;
  const diffUrl =
    node.change && canDiff(node.change)
      ? `/diff?old=${encodeURIComponent(oldSnapshotPath)}&new=${encodeURIComponent(newSnapshotPath)}&file=${encodeURIComponent(node.change.path)}`
      : null;

  // Extract subvolume from snapshot path (e.g., "/@snapshots/2026-01-29_00:00:01" -> "/@snapshots")
  const subvolume = oldSnapshotPath.split('/').slice(0, 2).join('/');
  const historyUrl = !node.isFolder && node.change
    ? `/file-history?subvolume=${encodeURIComponent(subvolume)}&file=${encodeURIComponent(node.change.path)}`
    : null;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded px-2 -mx-2"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Expand/collapse button for folders with children */}
        {node.isFolder || hasChildren ? (
          <button
            onClick={() => onToggle(node.path)}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
          >
            {hasChildren && <ChevronIcon expanded={!isCollapsed} className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Folder or file icon - color reflects change type */}
        {node.isFolder || hasChildren ? (
          <FolderIcon
            className={`w-4 h-4 shrink-0 ${
              node.change?.type === "rmdir"
                ? "text-red-500 dark:text-red-400"
                : node.change?.type === "mkdir" || node.change?.type === "link"
                  ? "text-green-500 dark:text-green-400"
                  : "text-gray-400 dark:text-gray-500"
            }`}
          />
        ) : (
          <FileIcon
            className={`w-4 h-4 shrink-0 ${
              node.change?.type === "unlink"
                ? "text-red-400 dark:text-red-500"
                : node.change?.type === "write" || node.change?.type === "truncate"
                  ? "text-amber-400 dark:text-amber-500"
                  : node.change?.type === "link" || node.change?.type === "symlink"
                    ? "text-green-400 dark:text-green-500"
                    : node.change?.type === "rename"
                      ? "text-purple-400 dark:text-purple-500"
                      : "text-gray-400 dark:text-gray-500"
            }`}
          />
        )}

        {/* Change type badge (only for nodes with changes) */}
        {config && (
          <span
            className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}
          >
            {config.label}
          </span>
        )}

        {/* Name */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {diffUrl ? (
            <Link
              to={diffUrl}
              className="font-mono text-sm text-blue-600 dark:text-blue-400 hover:underline truncate"
            >
              {node.name}
            </Link>
          ) : (
            <span className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">
              {node.name}
            </span>
          )}

          {/* Rename info */}
          {node.change?.type === "rename" && node.change.oldPath && (
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
              from: {node.change.oldPath}
            </span>
          )}
        </div>

        {/* Size */}
        {node.change?.size !== undefined && (
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
            {formatSize(node.change.size)}
          </span>
        )}

        {/* Diff arrow */}
        {diffUrl && (
          <Link
            to={diffUrl}
            className="shrink-0 text-gray-400 hover:text-blue-500"
            title="View diff"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        )}

        {/* File history button */}
        {historyUrl && (
          <Link
            to={historyUrl}
            className="shrink-0 text-gray-400 hover:text-purple-500"
            title="View file history"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </Link>
        )}
      </div>

      {/* Render children if not collapsed */}
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              oldSnapshotPath={oldSnapshotPath}
              newSnapshotPath={newSnapshotPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChangesView({
  changes,
  oldSnapshotPath,
  newSnapshotPath,
}: ChangesViewProps) {
  // Track collapsed folder paths
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Build tree structure from flat changes
  const tree = buildTree(changes);

  const handleToggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {tree.map((node) => (
        <TreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={handleToggle}
          oldSnapshotPath={oldSnapshotPath}
          newSnapshotPath={newSnapshotPath}
        />
      ))}
    </div>
  );
}
