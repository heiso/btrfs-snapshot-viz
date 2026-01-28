import { useState, useEffect, useRef } from "react";
import type { Route } from "./+types/compare";
import { getBtrfsDisplayPath } from "~/services/index.server";
import { ChangesView } from "~/components/ChangesView";
import { buildBtrfsSendCommand } from "~/utils/btrfs";
import type { FileChange } from "~/types";

// Copy icon
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

// Check icon
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// Loading spinner
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// Copyable command component
function CopyableCommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = command;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
        >
          {copied ? (
            <>
              <CheckIcon className="w-4 h-4 text-green-500" />
              <span className="text-green-500">Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon className="w-4 h-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap break-all">
        {command}
      </pre>
    </div>
  );
}

export function meta({ params }: Route.MetaArgs) {
  return [
    { title: "Compare Snapshots" },
    { name: "description", content: "Compare changes between two snapshots" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const oldSnapshotPath = decodeURIComponent(params.oldSnapshot);
  const newSnapshotPath = decodeURIComponent(params.newSnapshot);
  const btrfsDisplayPath = getBtrfsDisplayPath();

  return { oldSnapshotPath, newSnapshotPath, btrfsDisplayPath };
}

interface StreamSummary {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
}

export default function Compare({ loaderData }: Route.ComponentProps) {
  const { oldSnapshotPath, newSnapshotPath, btrfsDisplayPath } = loaderData;

  const [changes, setChanges] = useState<FileChange[]>([]);
  const [summary, setSummary] = useState<StreamSummary>({ added: 0, modified: 0, deleted: 0, renamed: 0 });
  const [isStreaming, setIsStreaming] = useState(true);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Use refs to accumulate changes without triggering re-renders
  const changeMapRef = useRef(new Map<string, FileChange>());
  const pendingUpdateRef = useRef(false);

  // Stream changes from the API
  useEffect(() => {
    const changeMap = changeMapRef.current;
    changeMap.clear();

    // Batch UI updates every 150ms
    let updateTimer: ReturnType<typeof setTimeout> | null = null;

    const flushUpdates = () => {
      const allChanges = Array.from(changeMap.values());
      setChanges(allChanges);
      setSummary({
        added: allChanges.filter(c => c.type === "mkdir" || c.type === "link" || c.type === "symlink").length,
        modified: allChanges.filter(c => c.type === "write" || c.type === "truncate").length,
        deleted: allChanges.filter(c => c.type === "unlink" || c.type === "rmdir").length,
        renamed: allChanges.filter(c => c.type === "rename").length,
      });
      pendingUpdateRef.current = false;
    };

    const scheduleUpdate = () => {
      if (!pendingUpdateRef.current) {
        pendingUpdateRef.current = true;
        updateTimer = setTimeout(flushUpdates, 150);
      }
    };

    const eventSource = new EventSource(
      `/api/stream-changes?old=${encodeURIComponent(oldSnapshotPath)}&new=${encodeURIComponent(newSnapshotPath)}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "change" && data.data) {
          const change = data.data as FileChange;
          const key = `${change.type}:${change.path}`;
          const existing = changeMap.get(key);

          if (existing && change.size) {
            existing.size = (existing.size || 0) + change.size;
          } else if (!existing) {
            changeMap.set(key, change);
          }

          // Schedule batched update
          scheduleUpdate();
        } else if (data.type === "progress") {
          setProgress(data.message || "");
        } else if (data.type === "done") {
          // Final flush
          if (updateTimer) clearTimeout(updateTimer);
          flushUpdates();
          setIsStreaming(false);
          setProgress("");
          if (data.summary) {
            setSummary(data.summary);
          }
          eventSource.close();
        } else if (data.type === "error") {
          setError(data.message || "Unknown error");
          setIsStreaming(false);
          eventSource.close();
        }
      } catch (e) {
        console.error("Failed to parse SSE event:", e);
      }
    };

    eventSource.onerror = () => {
      setError("Connection lost");
      setIsStreaming(false);
      eventSource.close();
    };

    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      eventSource.close();
    };
  }, [oldSnapshotPath, newSnapshotPath]);

  const btrfsSendCommand = buildBtrfsSendCommand(btrfsDisplayPath, oldSnapshotPath, newSnapshotPath);

  const getSnapshotName = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1];
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Compare Snapshots
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {changes.length} change{changes.length !== 1 ? "s" : ""} detected
                </p>
                {isStreaming && (
                  <div className="flex items-center gap-1 text-sm text-blue-500">
                    <LoadingSpinner className="w-4 h-4" />
                    <span>Streaming...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Snapshot info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Older
              </span>
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white truncate">
              {getSnapshotName(oldSnapshotPath)}
            </h3>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                Newer
              </span>
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white truncate">
              {getSnapshotName(newSnapshotPath)}
            </h3>
          </div>
        </div>

        {/* Progress indicator */}
        {isStreaming && progress && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
              <LoadingSpinner className="w-4 h-4" />
              <span>{progress}</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {summary.added}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Added</div>
          </div>
          <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {summary.modified}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Modified
            </div>
          </div>
          <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {summary.deleted}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Deleted
            </div>
          </div>
          <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {summary.renamed}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Renamed
            </div>
          </div>
        </div>

        {/* Command */}
        <details className="mb-6">
          <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            Show btrfs command
          </summary>
          <div className="mt-2">
            <CopyableCommand
              label="btrfs send (list changes)"
              command={btrfsSendCommand}
            />
          </div>
        </details>

        {/* Changes list */}
        {!isStreaming && changes.length === 0 && !error ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No changes detected between these snapshots.
            </p>
          </div>
        ) : (
          <ChangesView
            changes={changes}
            oldSnapshotPath={oldSnapshotPath}
            newSnapshotPath={newSnapshotPath}
          />
        )}
      </main>
    </div>
  );
}
