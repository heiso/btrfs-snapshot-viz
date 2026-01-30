import { Link } from "react-router";
import type { FileEntry } from "../../services/db.server";
import { formatRelativeTime } from "../../lib/format";

interface FileListProps {
  files: FileEntry[];
  snapshotId: number;
  currentPath: string;
}

export function FileList({ files, snapshotId, currentPath }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-md p-8 text-center text-gray-500 dark:text-gray-400">
        No files found in this directory.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-b-md overflow-hidden">
      {files.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          snapshotId={snapshotId}
        />
      ))}
    </div>
  );
}

function FileRow({ file, snapshotId }: { file: FileEntry; snapshotId: number }) {
  const isDirectory = file.is_directory === 1;
  const href = isDirectory
    ? `/browse/${snapshotId}/${file.path}`
    : `/file/${snapshotId}/${file.path}`;

  return (
    <div className="grid grid-cols-[minmax(200px,2fr)_3fr_120px] items-center px-4 py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800">
      <div className="flex items-center gap-2">
        <span className={isDirectory ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}>
          {isDirectory ? "📁" : "📄"}
        </span>
        <Link
          to={href}
          className="text-blue-600 dark:text-blue-400 hover:underline truncate"
        >
          {file.name}
        </Link>
      </div>
      <div className="text-gray-500 dark:text-gray-400 text-sm truncate pr-4">
        {/* Placeholder for commit message - would need file history */}
      </div>
      <div className="text-gray-500 dark:text-gray-400 text-sm text-right">
        {file.mtime ? formatRelativeTime(file.mtime) : "—"}
      </div>
    </div>
  );
}
