import { useState } from "react";
import type { Route } from "./+types/diff";
import { getFileDiff, getBtrfsDisplayPath } from "~/services/index.server";
import { DiffViewer } from "~/components/DiffViewer";

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

export function meta({ location }: Route.MetaArgs) {
  const params = new URLSearchParams(location.search);
  const file = params.get("file") || "file";
  return [
    { title: `Diff - ${file}` },
    { name: "description", content: `View diff for ${file}` },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const oldSnapshotPath = url.searchParams.get("old");
  const newSnapshotPath = url.searchParams.get("new");
  const filePath = url.searchParams.get("file");
  const btrfsDisplayPath = getBtrfsDisplayPath();

  if (!oldSnapshotPath || !newSnapshotPath || !filePath) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  const diff = await getFileDiff(oldSnapshotPath, newSnapshotPath, filePath);
  return { diff, oldSnapshotPath, newSnapshotPath, filePath, btrfsDisplayPath };
}

export default function Diff({ loaderData }: Route.ComponentProps) {
  const { diff, oldSnapshotPath, newSnapshotPath, filePath, btrfsDisplayPath } = loaderData;

  const getSnapshotName = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1];
  };

  // Build the diff command for copying
  const diffCommand = `diff "${btrfsDisplayPath}${oldSnapshotPath}/${filePath}" "${btrfsDisplayPath}${newSnapshotPath}/${filePath}"`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
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
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
                {filePath}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {getSnapshotName(oldSnapshotPath)} →{" "}
                {getSnapshotName(newSnapshotPath)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* File info */}
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Older snapshot:{" "}
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {getSnapshotName(oldSnapshotPath)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">
                Newer snapshot:{" "}
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {getSnapshotName(newSnapshotPath)}
              </span>
            </div>
          </div>
        </div>

        {/* Command */}
        <details className="mb-6">
          <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            Show diff command
          </summary>
          <div className="mt-2">
            <CopyableCommand
              label="diff (compare files)"
              command={diffCommand}
            />
          </div>
        </details>

        {/* Diff viewer */}
        <DiffViewer diff={diff} />
      </main>
    </div>
  );
}
