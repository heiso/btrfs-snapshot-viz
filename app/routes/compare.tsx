import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/compare";
import { getAllSnapshots, getSnapshot, getDb } from "../services/db.server";
import { formatSize } from "../lib/format";

export function meta() {
  return [{ title: "Compare Snapshots - BTRFS Snapshot Viz" }];
}

interface FileDiff {
  path: string;
  name: string;
  status: "added" | "modified" | "deleted";
  oldSize?: number;
  newSize?: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const baseId = url.searchParams.get("base");
  const compareId = url.searchParams.get("compare");

  const snapshots = getAllSnapshots();

  if (!baseId || !compareId) {
    return {
      snapshots,
      baseSnapshot: null,
      compareSnapshot: null,
      diff: [],
      summary: { added: 0, modified: 0, deleted: 0 },
    };
  }

  const baseSnapshot = getSnapshot(parseInt(baseId, 10));
  const compareSnapshot = getSnapshot(parseInt(compareId, 10));

  if (!baseSnapshot || !compareSnapshot) {
    return {
      snapshots,
      baseSnapshot: null,
      compareSnapshot: null,
      diff: [],
      summary: { added: 0, modified: 0, deleted: 0 },
    };
  }

  // Get detailed diff
  const diff: FileDiff[] = [];
  const db = getDb();

  // Added files (in compare but not in base)
  const added = db.prepare(`
    SELECT c.path, c.name, c.size as new_size
    FROM files c
    LEFT JOIN files b ON b.snapshot_id = ? AND b.path = c.path
    WHERE c.snapshot_id = ? AND c.is_directory = 0 AND b.id IS NULL
    ORDER BY c.path
    LIMIT 500
  `).all(baseSnapshot.id, compareSnapshot.id) as { path: string; name: string; new_size: number }[];

  // Deleted files (in base but not in compare)
  const deleted = db.prepare(`
    SELECT b.path, b.name, b.size as old_size
    FROM files b
    LEFT JOIN files c ON c.snapshot_id = ? AND c.path = b.path
    WHERE b.snapshot_id = ? AND b.is_directory = 0 AND c.id IS NULL
    ORDER BY b.path
    LIMIT 500
  `).all(compareSnapshot.id, baseSnapshot.id) as { path: string; name: string; old_size: number }[];

  // Modified files
  const modified = db.prepare(`
    SELECT b.path, b.name, b.size as old_size, c.size as new_size
    FROM files b
    JOIN files c ON c.snapshot_id = ? AND c.path = b.path
    WHERE b.snapshot_id = ? AND b.is_directory = 0
      AND b.checksum IS NOT NULL AND c.checksum IS NOT NULL
      AND b.checksum != c.checksum
    ORDER BY b.path
    LIMIT 500
  `).all(compareSnapshot.id, baseSnapshot.id) as { path: string; name: string; old_size: number; new_size: number }[];

  for (const file of added) {
    diff.push({ path: file.path, name: file.name, status: "added", newSize: file.new_size });
  }
  for (const file of modified) {
    diff.push({ path: file.path, name: file.name, status: "modified", oldSize: file.old_size, newSize: file.new_size });
  }
  for (const file of deleted) {
    diff.push({ path: file.path, name: file.name, status: "deleted", oldSize: file.old_size });
  }

  diff.sort((a, b) => a.path.localeCompare(b.path));

  const summary = {
    added: added.length,
    modified: modified.length,
    deleted: deleted.length,
  };

  return {
    snapshots,
    baseSnapshot,
    compareSnapshot,
    diff,
    summary,
  };
}

export default function Compare({ loaderData }: Route.ComponentProps) {
  const { snapshots, baseSnapshot, compareSnapshot, diff, summary } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const handleBaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("base", e.target.value);
    setSearchParams(newParams);
  };

  const handleCompareChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("compare", e.target.value);
    setSearchParams(newParams);
  };

  return (
    <div>
      <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Base</label>
            <select
              value={baseSnapshot?.id || ""}
              onChange={handleBaseChange}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm"
            >
              <option value="">Select snapshot...</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <span className="text-gray-500 dark:text-gray-400 text-xl mt-5">←</span>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Compare</label>
            <select
              value={compareSnapshot?.id || ""}
              onChange={handleCompareChange}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm"
            >
              <option value="">Select snapshot...</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {baseSnapshot && compareSnapshot && (
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
              {baseSnapshot.name} → {compareSnapshot.name}
            </span>
          </div>

          {diff.length > 0 ? (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
              {diff.map((file) => (
                <Link
                  key={file.path}
                  to={`/file/${compareSnapshot.id}/${file.path}`}
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
              No changes detected between these snapshots.
            </div>
          )}
        </>
      )}

      {!baseSnapshot || !compareSnapshot ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          Select two snapshots to compare.
        </div>
      ) : null}
    </div>
  );
}
