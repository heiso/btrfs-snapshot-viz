import { Link } from "react-router";
import type { Snapshot } from "../../services/db.server";
import { formatRelativeTime } from "../../lib/format";

interface LatestCommitBarProps {
  snapshot: Snapshot;
  changeSummary: { added: number; deleted: number; modified: number } | null;
  totalSnapshots: number;
}

export function LatestCommitBar({
  snapshot,
  changeSummary,
  totalSnapshots,
}: LatestCommitBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-t-md text-sm">
      <div className="flex items-center gap-3">
        <span className="text-lg">📸</span>
        <span className="text-gray-900 dark:text-gray-100">Snapshot</span>
        <span className="text-gray-500 dark:text-gray-400">
          <Link
            to={`/snapshots/${snapshot.id}`}
            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            {snapshot.name}
          </Link>
          {changeSummary && (
            <>
              {" · "}
              <span className="text-green-600 dark:text-green-400">+{changeSummary.added}</span>
              {" "}
              <span className="text-red-600 dark:text-red-400">-{changeSummary.deleted}</span>
              {" "}
              <span className="text-amber-600 dark:text-amber-400">~{changeSummary.modified}</span>
            </>
          )}
          {snapshot.created_at && (
            <>
              {" · "}
              {formatRelativeTime(snapshot.created_at)}
            </>
          )}
        </span>
      </div>
      <Link
        to="/snapshots"
        className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
      >
        <span>{totalSnapshots} snapshots</span>
        <HistoryIcon />
      </Link>
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
      <path d="M1.643 3.143.427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684ZM7.75 4a.75.75 0 0 0-.75.75v2.992l2.028.812a.75.75 0 0 0 .557-1.392l-1.085-.434V4.75A.75.75 0 0 0 7.75 4Z" />
    </svg>
  );
}
