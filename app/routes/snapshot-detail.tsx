import { Link } from "react-router";
import type { Route } from "./+types/snapshot-detail";
import { getSnapshot, getAllSnapshots, getDb } from "../services/db.server";
import { formatRelativeTime, formatSize } from "../lib/format";

export function meta({ data }: Route.MetaArgs) {
  const snapshot = data?.snapshot;
  return [{ title: snapshot ? `${snapshot.name} - BTRFS Snapshot Viz` : "Snapshot - BTRFS Snapshot Viz" }];
}

interface FileDiff {
  path: string;
  name: string;
  status: "added" | "modified" | "deleted";
  oldSize?: number;
  newSize?: number;
}

export async function loader({ params }: Route.LoaderArgs) {
  const snapshotId = parseInt(params.id, 10);

  const snapshot = getSnapshot(snapshotId);
  if (!snapshot) {
    throw new Response("Snapshot not found", { status: 404 });
  }

  const snapshots = getAllSnapshots();
  const snapshotIndex = snapshots.findIndex((s) => s.id === snapshotId);
  const previousSnapshot = snapshotIndex < snapshots.length - 1 ? snapshots[snapshotIndex + 1] : null;

  // Get detailed diff
  const diff: FileDiff[] = [];

  if (previousSnapshot) {
    const db = getDb();

    // Added files
    const added = db.prepare(`
      SELECT c.path, c.name, c.size as new_size
      FROM files c
      LEFT JOIN files b ON b.snapshot_id = ? AND b.path = c.path
      WHERE c.snapshot_id = ? AND c.is_directory = 0 AND b.id IS NULL
      ORDER BY c.path
      LIMIT 200
    `).all(previousSnapshot.id, snapshotId) as { path: string; name: string; new_size: number }[];

    // Deleted files
    const deleted = db.prepare(`
      SELECT b.path, b.name, b.size as old_size
      FROM files b
      LEFT JOIN files c ON c.snapshot_id = ? AND c.path = b.path
      WHERE b.snapshot_id = ? AND b.is_directory = 0 AND c.id IS NULL
      ORDER BY b.path
      LIMIT 200
    `).all(snapshotId, previousSnapshot.id) as { path: string; name: string; old_size: number }[];

    // Modified files
    const modified = db.prepare(`
      SELECT b.path, b.name, b.size as old_size, c.size as new_size
      FROM files b
      JOIN files c ON c.snapshot_id = ? AND c.path = b.path
      WHERE b.snapshot_id = ? AND b.is_directory = 0
        AND b.checksum IS NOT NULL AND c.checksum IS NOT NULL
        AND b.checksum != c.checksum
      ORDER BY b.path
      LIMIT 200
    `).all(snapshotId, previousSnapshot.id) as { path: string; name: string; old_size: number; new_size: number }[];

    for (const file of added) {
      diff.push({ path: file.path, name: file.name, status: "added", newSize: file.new_size });
    }
    for (const file of modified) {
      diff.push({ path: file.path, name: file.name, status: "modified", oldSize: file.old_size, newSize: file.new_size });
    }
    for (const file of deleted) {
      diff.push({ path: file.path, name: file.name, status: "deleted", oldSize: file.old_size });
    }

    // Sort by path
    diff.sort((a, b) => a.path.localeCompare(b.path));
  }

  const summary = {
    added: diff.filter((d) => d.status === "added").length,
    modified: diff.filter((d) => d.status === "modified").length,
    deleted: diff.filter((d) => d.status === "deleted").length,
  };

  return {
    snapshot,
    previousSnapshot,
    diff,
    summary,
  };
}

export default function SnapshotDetail({ loaderData }: Route.ComponentProps) {
  const { snapshot, previousSnapshot, diff, summary } = loaderData;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link to="/snapshots" className="text-blue-600 dark:text-blue-400 hover:underline">
          Snapshots
        </Link>
        <span className="text-gray-500 dark:text-gray-400">/</span>
        <span className="text-gray-900 dark:text-gray-100 font-medium">{snapshot.name}</span>
      </div>

      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md mb-4">
        <div className="flex items-center gap-3">
          <span className="text-lg">📸</span>
          <div>
            <div className="font-medium">{snapshot.name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {snapshot.created_at && formatRelativeTime(snapshot.created_at)} · {formatSize(snapshot.total_size)} total
            </div>
          </div>
        </div>
        <Link
          to={`/browse/${snapshot.id}`}
          className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Browse files
        </Link>
      </div>

      {previousSnapshot ? (
        <>
          <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md mb-4 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-green-600 dark:text-green-400">+{summary.added}</span>
              <span>additions</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-red-600 dark:text-red-400">-{summary.deleted}</span>
              <span>deletions</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-amber-600 dark:text-amber-400">~{summary.modified}</span>
              <span>modifications</span>
            </div>
            <div className="flex-1" />
            <span className="text-gray-500 dark:text-gray-400">
              vs {previousSnapshot.name}
            </span>
          </div>

          {diff.length > 0 ? (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
              {diff.map((file) => (
                <Link
                  key={file.path}
                  to={`/file/${snapshot.id}/${file.path}`}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <span
                    className={`w-5 h-5 flex items-center justify-center rounded text-xs font-semibold ${
                      file.status === "added"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                        : file.status === "modified"
                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                        : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {file.status === "added" ? "A" : file.status === "modified" ? "M" : "D"}
                  </span>
                  <span className="flex-1 font-mono text-sm truncate">{file.path}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {file.status === "added" && file.newSize && (
                      <span className="text-green-600 dark:text-green-400">+{formatSize(file.newSize)}</span>
                    )}
                    {file.status === "deleted" && file.oldSize && (
                      <span className="text-red-600 dark:text-red-400">-{formatSize(file.oldSize)}</span>
                    )}
                    {file.status === "modified" && file.oldSize !== undefined && file.newSize !== undefined && (
                      <>
                        {file.newSize > file.oldSize ? (
                          <span className="text-green-600 dark:text-green-400">+{formatSize(file.newSize - file.oldSize)}</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400">-{formatSize(file.oldSize - file.newSize)}</span>
                        )}
                      </>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
              No changes detected between snapshots.
            </div>
          )}
        </>
      ) : (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          This is the oldest indexed snapshot. No previous snapshot to compare with.
        </div>
      )}
    </div>
  );
}
