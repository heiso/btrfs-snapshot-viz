import { useNavigate } from "react-router";
import type { Snapshot } from "../../services/db.server";

interface SnapshotSelectorProps {
  currentSnapshot: Snapshot;
  snapshots: Snapshot[];
  currentPath: string;
}

export function SnapshotSelector({
  currentSnapshot,
  snapshots,
  currentPath,
}: SnapshotSelectorProps) {
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const snapshotId = e.target.value;
    const path = currentPath ? `/${currentPath}` : "";
    navigate(`/browse/${snapshotId}${path}`);
  };

  return (
    <div className="flex items-center gap-2">
      <BranchIcon />
      <select
        value={currentSnapshot.id}
        onChange={handleChange}
        className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
      >
        {snapshots.map((snapshot) => (
          <option key={snapshot.id} value={snapshot.id}>
            {snapshot.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-gray-500 dark:text-gray-400">
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  );
}
