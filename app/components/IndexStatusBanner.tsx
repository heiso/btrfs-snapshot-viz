import { useState } from 'react';
import type { IndexStatus } from '~/types';

interface IndexStatusBannerProps {
  status: IndexStatus;
  subvolumePath: string;
  totalSnapshots: number;
  onBuildComplete?: () => void;
}

export function IndexStatusBanner({
  status,
  subvolumePath,
  totalSnapshots,
  onBuildComplete
}: IndexStatusBannerProps) {
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBuildIndex = async () => {
    setIsBuilding(true);
    setError(null);
    setBuildProgress(null);

    try {
      // Start SSE stream to build index
      const response = await fetch(
        `/api/file-history?subvolume=${encodeURIComponent(subvolumePath)}&file=/&stream=true`
      );

      if (!response.ok) {
        throw new Error('Failed to start index build');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              setBuildProgress({
                current: data.current,
                total: data.total
              });
            } else if (data.type === 'complete') {
              setIsBuilding(false);
              if (onBuildComplete) {
                onBuildComplete();
              }
            } else if (data.type === 'error') {
              setError(data.message);
              setIsBuilding(false);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsBuilding(false);
    }
  };

  // Don't show banner if index is complete
  if (status.complete) {
    return null;
  }

  // Show building progress
  if (isBuilding && buildProgress) {
    const percentage = Math.round((buildProgress.current / buildProgress.total) * 100);

    return (
      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-100">
              Building Index...
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              {buildProgress.current} of {buildProgress.total} snapshots processed
            </p>
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {percentage}%
          </div>
        </div>
        <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }

  // Show error if build failed
  if (error) {
    return (
      <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-red-900 dark:text-red-100">
              Index Build Failed
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
          <button
            onClick={handleBuildIndex}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show index not built banner
  if (!status.exists) {
    return (
      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-100">
              File History Index Not Built
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Build the index to enable file browsing and history tracking across all{' '}
              {totalSnapshots} snapshots.
            </p>
          </div>
          <button
            onClick={handleBuildIndex}
            disabled={isBuilding}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBuilding ? 'Building...' : 'Build Index Now'}
          </button>
        </div>
      </div>
    );
  }

  // Show index building in progress (incomplete)
  return (
    <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-amber-900 dark:text-amber-100">
            Index Building In Progress
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            {status.progress.current} of {status.progress.total} snapshots indexed
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold text-amber-600">
            {Math.round((status.progress.current / status.progress.total) * 100)}%
          </div>
          <button
            onClick={handleBuildIndex}
            disabled={isBuilding}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBuilding ? 'Resuming...' : 'Resume Build'}
          </button>
        </div>
      </div>
    </div>
  );
}
