import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Route } from './+types/file-history';
import { json } from 'react-router';
import {
  getFileHistory,
  getIndexStatus,
  needsInitialBuild
} from '~/services/file-history.server';
import { FileHistoryTimeline } from '~/components/FileHistoryTimeline';

/**
 * File History route: /file-history?subvolume=/@snapshots&file=/path/to/file
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const subvolume = url.searchParams.get('subvolume');
  const file = url.searchParams.get('file');

  if (!subvolume || !file) {
    throw new Response('Missing required parameters', { status: 400 });
  }

  try {
    // Check if index needs to be built
    const needsBuild = await needsInitialBuild(subvolume);
    const indexStatus = await getIndexStatus(subvolume);

    // If index is incomplete, return status only
    if (needsBuild || !indexStatus.complete) {
      return json({
        subvolume,
        file,
        indexStatus,
        timeline: null,
        needsBuild
      });
    }

    // Get file history
    const timeline = await getFileHistory(subvolume, file);

    if (!timeline) {
      throw new Response('File not found in history', { status: 404 });
    }

    return json({
      subvolume,
      file,
      indexStatus,
      timeline,
      needsBuild: false
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Response(message, { status: 500 });
  }
}

export default function FileHistory({ loaderData }: Route.ComponentProps) {
  const { subvolume, file, indexStatus, timeline, needsBuild } = loaderData;
  const navigate = useNavigate();

  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [streamedTimeline, setStreamedTimeline] = useState(timeline);
  const [error, setError] = useState<string | null>(null);

  // Auto-start building if needed
  useEffect(() => {
    if (needsBuild || !indexStatus.complete) {
      handleBuildIndex();
    }
  }, [needsBuild, indexStatus.complete]);

  const handleBuildIndex = async () => {
    setIsBuilding(true);
    setError(null);
    setBuildProgress(null);

    try {
      // Start SSE stream to build index
      const response = await fetch(
        `/api/file-history?subvolume=${encodeURIComponent(subvolume)}&file=${encodeURIComponent(file)}&stream=true`
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
              setStreamedTimeline(data.timeline);
              setIsBuilding(false);
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

  // Show building progress
  if (isBuilding) {
    const percentage = buildProgress
      ? Math.round((buildProgress.current / buildProgress.total) * 100)
      : 0;

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Building Index...
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Building file history index to track changes across all snapshots.
            </p>

            {buildProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {buildProgress.current} of {buildProgress.total} snapshots
                  </span>
                  <span className="font-bold text-blue-600">{percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show error
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-8">
            <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
              Error Building Index
            </h2>
            <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
            <div className="flex gap-4">
              <button
                onClick={handleBuildIndex}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show file not found
  if (!streamedTimeline) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              File Not Found
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No history found for <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{file}</code>
            </p>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show file history timeline
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          File History
        </h1>
        <p className="text-gray-600 dark:text-gray-400 break-all">
          {streamedTimeline.currentPath}
        </p>
      </div>

      {/* File Status */}
      <div className="mb-6 flex items-center gap-4">
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            streamedTimeline.status === 'active'
              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}
        >
          {streamedTimeline.status === 'active' ? '✓ Active' : '✗ Deleted'}
        </span>

        {streamedTimeline.aliases.length > 1 && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Aliases:</span>{' '}
            {streamedTimeline.aliases
              .filter(a => a !== streamedTimeline.currentPath)
              .map(alias => (
                <span key={alias} className="inline-block bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded mr-2">
                  {alias}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <FileHistoryTimeline timeline={streamedTimeline} subvolume={subvolume} />
    </div>
  );
}
