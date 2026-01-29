import { Link } from "react-router";
import type { Snapshot } from "~/types";

interface TimelineProps {
  snapshots: Snapshot[];
  selectedSnapshots: [string | null, string | null];
  onSnapshotClick: (snapshotPath: string) => void;
}

export function Timeline({
  snapshots,
  selectedSnapshots,
  onSnapshotClick,
}: TimelineProps) {
  const [firstSelected, secondSelected] = selectedSnapshots;

  const getSelectionState = (path: string) => {
    if (path === firstSelected) return "first";
    if (path === secondSelected) return "second";
    return null;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSnapshotName = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1];
  };

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

      <div className="space-y-4">
        {snapshots.map((snapshot, index) => {
          const selectionState = getSelectionState(snapshot.path);
          const isSelected = selectionState !== null;

          return (
            <div key={snapshot.id} className="relative pl-10">
              {/* Timeline dot */}
              <button
                onClick={() => onSnapshotClick(snapshot.path)}
                className={`absolute left-2 w-5 h-5 rounded-full border-2 transition-all cursor-pointer ${
                  selectionState === "first"
                    ? "bg-blue-500 border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                    : selectionState === "second"
                      ? "bg-green-500 border-green-500 ring-2 ring-green-200 dark:ring-green-800"
                      : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
                }`}
                title={isSelected ? "Click to deselect" : "Click to select"}
              />

              {/* Card */}
              <div
                onClick={() => onSnapshotClick(snapshot.path)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? selectionState === "first"
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700"
                      : "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3
                      className={`font-medium truncate ${
                        isSelected
                          ? selectionState === "first"
                            ? "text-blue-900 dark:text-blue-100"
                            : "text-green-900 dark:text-green-100"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {getSnapshotName(snapshot.path)}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {formatDate(snapshot.createdAt)}
                    </p>
                    <p
                      className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate"
                      title={snapshot.path}
                    >
                      {snapshot.path}
                    </p>
                  </div>

                  {isSelected && (
                    <span
                      className={`shrink-0 text-xs font-medium px-2 py-1 rounded ${
                        selectionState === "first"
                          ? "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200"
                          : "bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200"
                      }`}
                    >
                      {selectionState === "first" ? "Older" : "Newer"}
                    </span>
                  )}
                </div>

                {/* Browse Files Link */}
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <Link
                    to={`/browse${snapshot.path}/`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
                  >
                    <span>📁</span>
                    <span>Browse Files</span>
                  </Link>
                </div>
              </div>

              {/* Connection line for selected pair */}
              {selectionState === "first" && secondSelected && (
                <div className="absolute left-4 top-5 -translate-x-1/2 w-1 bg-gradient-to-b from-blue-500 to-green-500 z-10" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
