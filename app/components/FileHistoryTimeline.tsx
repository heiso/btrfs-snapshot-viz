import { useState } from 'react';
import { Link } from 'react-router';
import type { FileTimeline } from '~/types';
import { formatSize, formatDate } from '~/utils/format';

interface FileHistoryTimelineProps {
  timeline: FileTimeline;
  subvolume: string;
}

export function FileHistoryTimeline({ timeline, subvolume }: FileHistoryTimelineProps) {
  const [selectedSnapshots, setSelectedSnapshots] = useState<[string?, string?]>([]);

  const handleSelect = (snapshotPath: string) => {
    setSelectedSnapshots(([first, second]) => {
      if (first === snapshotPath) {
        return [second, undefined];
      }
      if (second === snapshotPath) {
        return [first, undefined];
      }
      if (!first) {
        return [snapshotPath, undefined];
      }
      if (!second) {
        // Ensure chronological order (older first, newer second)
        const firstIndex = timeline.history.findIndex(e => e.snapshotPath === first);
        const clickedIndex = timeline.history.findIndex(e => e.snapshotPath === snapshotPath);
        if (clickedIndex < firstIndex) {
          return [snapshotPath, first];
        }
        return [first, snapshotPath];
      }
      // Replace second selection
      return [first, snapshotPath];
    });
  };

  const handleCompare = () => {
    if (selectedSnapshots[0] && selectedSnapshots[1]) {
      const [older, newer] = selectedSnapshots;
      window.open(
        `/compare/${encodeURIComponent(older)}/${encodeURIComponent(newer)}`,
        '_blank'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

        <div className="space-y-4">
          {timeline.history.map((entry, index) => {
            const previousEntry = index > 0 ? timeline.history[index - 1] : null;
            const sizeDelta =
              previousEntry && entry.size !== undefined && previousEntry.size !== undefined
                ? entry.size - previousEntry.size
                : 0;

            const isSelected =
              selectedSnapshots.includes(entry.snapshotPath);
            const selectionOrder = selectedSnapshots[0] === entry.snapshotPath
              ? 'first'
              : selectedSnapshots[1] === entry.snapshotPath
                ? 'second'
                : null;

            return (
              <div key={`${entry.snapshotPath}-${index}`} className="relative pl-10">
                {/* Timeline dot */}
                <button
                  onClick={() => handleSelect(entry.snapshotPath)}
                  className={`absolute left-2 w-5 h-5 rounded-full border-2 transition-all ${
                    selectionOrder === 'first'
                      ? 'bg-blue-500 border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                      : selectionOrder === 'second'
                        ? 'bg-green-500 border-green-500 ring-2 ring-green-200 dark:ring-green-800'
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                  title={isSelected ? 'Click to deselect' : 'Click to select for comparison'}
                />

                {/* Timeline Entry Card */}
                <div
                  className={`p-4 rounded-lg border transition-all ${
                    isSelected
                      ? selectionOrder === 'first'
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                        : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      {/* Change Type Badge */}
                      <ChangeTypeBadge type={entry.changeType} isDirectory={entry.isDirectory} />

                      {/* Snapshot Info */}
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <time>{formatDate(entry.snapshotCreatedAt)}</time>
                        <span className="mx-2">•</span>
                        <Link
                          to={`/browse${entry.snapshotPath}/`}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {entry.snapshotPath.split('/').pop()}
                        </Link>
                      </div>
                    </div>

                    {isSelected && (
                      <span
                        className={`shrink-0 text-xs font-medium px-2 py-1 rounded ${
                          selectionOrder === 'first'
                            ? 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200'
                            : 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200'
                        }`}
                      >
                        {selectionOrder === 'first' ? 'Older' : 'Newer'}
                      </span>
                    )}
                  </div>

                  {/* File Path & Size */}
                  <div className="space-y-1">
                    {entry.path !== timeline.currentPath && (
                      <div className="text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Path: </span>
                        <code className="text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded text-xs">
                          {entry.path}
                        </code>
                      </div>
                    )}

                    {entry.previousPath && (
                      <div className="text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Renamed from: </span>
                        <code className="text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded text-xs">
                          {entry.previousPath}
                        </code>
                      </div>
                    )}

                    {entry.size !== undefined && !entry.isDirectory && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Size:</span>
                        <span className="font-mono text-gray-700 dark:text-gray-300">
                          {formatSize(entry.size)}
                        </span>

                        {sizeDelta !== 0 && previousEntry && (
                          <span
                            className={`font-mono text-xs px-2 py-0.5 rounded ${
                              sizeDelta > 0
                                ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                            }`}
                          >
                            {sizeDelta > 0 ? '+' : ''}
                            {formatSize(Math.abs(sizeDelta))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white mb-3">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Total Changes</span>
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {timeline.history.length}
            </div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">First Seen</span>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {formatDate(timeline.firstSeen)}
            </div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Last Seen</span>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {formatDate(timeline.lastSeen)}
            </div>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Status</span>
            <div
              className={`text-sm font-medium ${
                timeline.status === 'active'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {timeline.status === 'active' ? 'Active' : 'Deleted'}
            </div>
          </div>
        </div>
      </div>

      {/* Compare Button */}
      {selectedSnapshots[0] && selectedSnapshots[1] && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 shadow-lg">
          <div className="container mx-auto flex items-center justify-between gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <p>
                <strong>Older:</strong> {selectedSnapshots[0].split('/').pop()}
              </p>
              <p>
                <strong>Newer:</strong> {selectedSnapshots[1]?.split('/').pop()}
              </p>
            </div>
            <button
              onClick={handleCompare}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Compare Snapshots
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ChangeTypeBadgeProps {
  type: 'created' | 'modified' | 'deleted' | 'renamed';
  isDirectory?: boolean;
}

function ChangeTypeBadge({ type, isDirectory }: ChangeTypeBadgeProps) {
  const badges = {
    created: {
      label: isDirectory ? 'Directory Created' : 'File Created',
      className: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
      icon: '✨'
    },
    modified: {
      label: 'Modified',
      className: 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
      icon: '✏️'
    },
    deleted: {
      label: isDirectory ? 'Directory Deleted' : 'File Deleted',
      className: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300',
      icon: '🗑️'
    },
    renamed: {
      label: 'Renamed',
      className: 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
      icon: '🔄'
    }
  };

  const badge = badges[type];

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${badge.className}`}>
      <span>{badge.icon}</span>
      <span>{badge.label}</span>
    </span>
  );
}
