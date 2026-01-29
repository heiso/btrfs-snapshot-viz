import type { DirectoryEntry } from '~/types';
import { formatSize, formatRelativeTime } from '~/utils/format';

interface FileBrowserProps {
  files: DirectoryEntry[];
  directory: string;
  onNavigate: (path: string, isDirectory: boolean) => void;
  onGoUp: () => void;
  onViewHistory: (filePath: string) => void;
}

export function FileBrowser({
  files,
  directory,
  onNavigate,
  onGoUp,
  onViewHistory
}: FileBrowserProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4 text-sm font-medium text-gray-600 dark:text-gray-400">
          <div className="flex-1">Name</div>
          <div className="w-24 text-right">Size</div>
          <div className="w-32">Modified</div>
          <div className="w-20">Actions</div>
        </div>
      </div>

      {/* File List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {/* Parent Directory */}
        {directory !== '/' && (
          <button
            onClick={onGoUp}
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-left group"
          >
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xl">📁</span>
              <span className="text-gray-700 dark:text-gray-300 font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400">
                ..
              </span>
            </div>
            <div className="w-24"></div>
            <div className="w-32"></div>
            <div className="w-20"></div>
          </button>
        )}

        {/* Files and Directories */}
        {files.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            This directory is empty
          </div>
        ) : (
          files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              onNavigate={onNavigate}
              onViewHistory={onViewHistory}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface FileRowProps {
  file: DirectoryEntry;
  onNavigate: (path: string, isDirectory: boolean) => void;
  onViewHistory: (filePath: string) => void;
}

function FileRow({ file, onNavigate, onViewHistory }: FileRowProps) {
  const icon = file.isDirectory ? '📁' : '📄';

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors group">
      {/* Name */}
      <button
        onClick={() => onNavigate(file.path, file.isDirectory)}
        className="flex items-center gap-2 flex-1 text-left min-w-0"
      >
        <span className="text-xl shrink-0">{icon}</span>
        <span className="text-gray-700 dark:text-gray-300 font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
          {file.name}
        </span>
      </button>

      {/* Size */}
      <div className="w-24 text-right text-sm text-gray-600 dark:text-gray-400">
        {file.size > 0 ? formatSize(file.size) : '-'}
      </div>

      {/* Modified Time */}
      <div className="w-32 text-sm text-gray-600 dark:text-gray-400">
        {file.modifiedAt ? (
          <span title={file.modifiedAt.toLocaleString()}>
            {formatRelativeTime(file.modifiedAt)}
          </span>
        ) : (
          '-'
        )}
      </div>

      {/* Actions */}
      <div className="w-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {!file.isDirectory && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewHistory(file.path);
              }}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              title="View file history"
            >
              <svg
                className="w-4 h-4 text-gray-600 dark:text-gray-400"
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
            </button>
          </>
        )}
      </div>
    </div>
  );
}
