import { Link } from "react-router";
import type { Route } from "./+types/snapshots";
import { getAllSnapshots, getChangeSummary } from "../services/db.server";
import { IndexButton } from "../components/indexing/IndexButton";
import { formatRelativeTime, formatSize } from "../lib/format";

export function meta() {
  return [{ title: "Snapshots - BTRFS Snapshot Viz" }];
}

export async function loader() {
  const snapshots = getAllSnapshots();

  // Calculate change summary for each snapshot vs previous
  const snapshotsWithChanges = snapshots.map((snapshot, index) => {
    const prevSnapshot = snapshots[index + 1];
    const changes = prevSnapshot
      ? getChangeSummary(prevSnapshot.id, snapshot.id)
      : null;
    return { ...snapshot, changes };
  });

  return { snapshots: snapshotsWithChanges };
}

export default function Snapshots({ loaderData }: Route.ComponentProps) {
  const { snapshots } = loaderData;

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold mb-4">No snapshots indexed</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Click the button below to discover and index your btrfs snapshots.
        </p>
        <IndexButton />
      </div>
    );
  }

  // Group snapshots by month
  const groupedSnapshots = snapshots.reduce((groups, snapshot) => {
    const date = snapshot.created_at ? new Date(snapshot.created_at) : new Date();
    const monthKey = date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    if (!groups[monthKey]) {
      groups[monthKey] = [];
    }
    groups[monthKey].push(snapshot);
    return groups;
  }, {} as Record<string, typeof snapshots>);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-base font-medium">Snapshots</h2>
        <IndexButton />
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
        {Object.entries(groupedSnapshots).map(([month, monthSnapshots]) => (
          <div key={month}>
            <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-medium text-sm">
              {month}
            </div>
            {monthSnapshots.map((snapshot) => (
              <Link
                key={snapshot.id}
                to={`/snapshots/${snapshot.id}`}
                className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">📸</span>
                  <div>
                    <div className="font-medium hover:text-blue-600 dark:hover:text-blue-400">
                      {snapshot.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {snapshot.created_at && formatRelativeTime(snapshot.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {snapshot.changes && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-green-600 dark:text-green-400">
                        +{snapshot.changes.added}
                      </span>
                      <span className="text-red-600 dark:text-red-400">
                        -{snapshot.changes.deleted}
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">
                        ~{snapshot.changes.modified}
                      </span>
                    </div>
                  )}
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-mono px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                    {formatSize(snapshot.total_size)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
