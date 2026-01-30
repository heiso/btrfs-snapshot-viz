import { Link } from "react-router";
import type { Route } from "./+types/history";
import { getFileHistory } from "../services/db.server";
import { formatRelativeTime, formatSize } from "../lib/format";

export function meta({ params }: Route.MetaArgs) {
  const filePath = params["*"] || "";
  const fileName = filePath.split("/").pop() || "File";
  return [{ title: `History: ${fileName} - BTRFS Snapshot Viz` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const filePath = params["*"] || "";

  if (!filePath) {
    throw new Response("File path required", { status: 400 });
  }

  const history = getFileHistory(filePath);

  return {
    filePath,
    history,
  };
}

export default function History({ loaderData }: Route.ComponentProps) {
  const { filePath, history } = loaderData;
  const fileName = filePath.split("/").pop() || filePath;

  if (history.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold mb-4">No history found</h2>
        <p className="text-gray-500 dark:text-gray-400">
          File "{filePath}" not found in any indexed snapshot.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">
          storage
        </Link>
        <span className="text-gray-500 dark:text-gray-400">/</span>
        <span className="text-gray-900 dark:text-gray-100">{fileName}</span>
        <span className="text-gray-500 dark:text-gray-400">/</span>
        <span className="text-gray-900 dark:text-gray-100 font-medium">History</span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-gray-500 dark:text-gray-400">History of</span>
        <code className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm">
          {filePath}
        </code>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
        {history.map((entry, index) => {
          const prevEntry = history[index + 1];
          const sizeDiff = prevEntry ? entry.size - prevEntry.size : 0;
          const changeType = !prevEntry
            ? "created"
            : entry.checksum !== prevEntry.checksum
            ? "modified"
            : "unchanged";

          return (
            <div
              key={`${entry.snapshot_id}-${entry.path}`}
              className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    changeType === "created"
                      ? "bg-green-600 dark:bg-green-400"
                      : changeType === "modified"
                      ? "bg-amber-600 dark:bg-amber-400"
                      : "bg-gray-500 dark:bg-gray-400"
                  }`}
                />
                <Link
                  to={`/file/${entry.snapshot_id}/${entry.path}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  {entry.snapshot_name}
                </Link>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  {changeType === "created"
                    ? "Created"
                    : changeType === "modified"
                    ? "Modified"
                    : "Unchanged"}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <span>{formatSize(entry.size)}</span>
                {sizeDiff !== 0 && (
                  <span
                    className={`font-mono ${
                      sizeDiff > 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {sizeDiff > 0 ? "+" : ""}
                    {formatSize(Math.abs(sizeDiff))}
                  </span>
                )}
                {entry.snapshot_created_at && (
                  <span>{formatRelativeTime(entry.snapshot_created_at)}</span>
                )}
                <Link
                  to={`/file/${entry.snapshot_id}/${entry.path}`}
                  className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  View
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
