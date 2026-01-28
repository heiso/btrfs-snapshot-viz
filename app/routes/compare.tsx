import { useState } from "react";
import type { Route } from "./+types/compare";
import { getChanges, getBtrfsDisplayPath } from "~/services/index.server";
import { ChangesView } from "~/components/ChangesView";
import { buildBtrfsSendCommand } from "~/utils/btrfs";

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

// Copyable command component
function CopyableCommand({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        // Fallback for non-HTTPS contexts
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

  const comparison = await getChanges(oldSnapshotPath, newSnapshotPath);
  return { comparison, oldSnapshotPath, newSnapshotPath, btrfsDisplayPath };
}

export default function Compare({ loaderData }: Route.ComponentProps) {
  const { comparison, oldSnapshotPath, newSnapshotPath, btrfsDisplayPath } = loaderData;
  const { changes, summary, oldSnapshot, newSnapshot } = comparison;

  // Build the btrfs send command for copying
  const btrfsSendCommand = buildBtrfsSendCommand(btrfsDisplayPath, oldSnapshotPath, newSnapshotPath);

  const getSnapshotName = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1];
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
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Compare Snapshots
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {changes.length} change{changes.length !== 1 ? "s" : ""} detected
              </p>
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
              {getSnapshotName(oldSnapshot.path)}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {formatDate(oldSnapshot.createdAt)}
            </p>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                Newer
              </span>
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white truncate">
              {getSnapshotName(newSnapshot.path)}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {formatDate(newSnapshot.createdAt)}
            </p>
          </div>
        </div>

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
        {changes.length === 0 ? (
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
