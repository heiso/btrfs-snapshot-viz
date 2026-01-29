import { useState } from "react";
import { Link, useNavigate, useNavigation } from "react-router";
import type { Route } from "./+types/snapshots";
import { getSnapshots, getBtrfsDisplayPath } from "~/services/index.server";
import { getIndexStatus } from "~/services/file-history.server";
import { Timeline } from "~/components/Timeline";
import { IndexStatusBanner } from "~/components/IndexStatusBanner";
import { buildBtrfsSendCommand } from "~/utils/btrfs";

// Loading spinner component
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

export function meta({ params }: Route.MetaArgs) {
  const subvolume = decodeURIComponent(params.subvolume);
  return [
    { title: `Snapshots - ${subvolume}` },
    { name: "description", content: `Snapshots for ${subvolume}` },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const subvolumePath = decodeURIComponent(params.subvolume);
  const snapshots = await getSnapshots(subvolumePath);
  const btrfsDisplayPath = getBtrfsDisplayPath();
  const indexStatus = await getIndexStatus(subvolumePath);
  return { subvolumePath, snapshots, btrfsDisplayPath, indexStatus };
}

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

export default function Snapshots({ loaderData }: Route.ComponentProps) {
  const { subvolumePath, snapshots, btrfsDisplayPath, indexStatus } = loaderData;
  const navigate = useNavigate();
  const navigation = useNavigation();

  // Show loading when navigating to compare page
  const isComparing = navigation.state === "loading" && navigation.location?.pathname.startsWith("/compare");

  // Sort snapshots with most recent first
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const [selectedSnapshots, setSelectedSnapshots] = useState<
    [string | null, string | null]
  >([null, null]);

  const handleSnapshotClick = (snapshotPath: string) => {
    setSelectedSnapshots(([first, second]) => {
      // If clicking on already selected first, deselect it
      if (snapshotPath === first) {
        return [second, null];
      }
      // If clicking on already selected second, deselect it
      if (snapshotPath === second) {
        return [first, null];
      }
      // If no selection yet, select as first
      if (first === null) {
        return [snapshotPath, null];
      }
      // If only first selected, select as second (ensure chronological order)
      const firstSnapshot = snapshots.find((s) => s.path === first);
      const clickedSnapshot = snapshots.find((s) => s.path === snapshotPath);

      if (firstSnapshot && clickedSnapshot) {
        const firstDate = new Date(firstSnapshot.createdAt).getTime();
        const clickedDate = new Date(clickedSnapshot.createdAt).getTime();

        // Ensure older is first, newer is second
        if (clickedDate < firstDate) {
          return [snapshotPath, first];
        } else {
          return [first, snapshotPath];
        }
      }

      return [first, snapshotPath];
    });
  };

  const canCompare = selectedSnapshots[0] && selectedSnapshots[1];
  const [copied, setCopied] = useState(false);

  // Build the btrfs send command for copying
  const btrfsSendCommand = canCompare
    ? buildBtrfsSendCommand(btrfsDisplayPath, selectedSnapshots[0]!, selectedSnapshots[1]!)
    : "";

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(btrfsSendCommand);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = btrfsSendCommand;
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

  const handleCompare = () => {
    if (canCompare) {
      const [older, newer] = selectedSnapshots;
      navigate(
        `/compare/${encodeURIComponent(older!)}/${encodeURIComponent(newer!)}`
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {subvolumePath}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Index Status Banner */}
        <IndexStatusBanner
          status={indexStatus}
          subvolumePath={subvolumePath}
          totalSnapshots={snapshots.length}
        />

        {/* Selection help */}
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {!selectedSnapshots[0] && !selectedSnapshots[1] && (
              <>Select two snapshots to compare their differences.</>
            )}
            {selectedSnapshots[0] && !selectedSnapshots[1] && (
              <>
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2" />
                Older snapshot selected. Now select a newer snapshot to compare.
              </>
            )}
            {selectedSnapshots[0] && selectedSnapshots[1] && (
              <>
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2" />
                <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2" />
                Two snapshots selected. Click compare to see changes.
              </>
            )}
          </p>
        </div>

        {snapshots.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No snapshots found for this subvolume.
            </p>
          </div>
        ) : (
          <Timeline
            snapshots={sortedSnapshots}
            selectedSnapshots={selectedSnapshots}
            onSnapshotClick={handleSnapshotClick}
          />
        )}
      </main>

      {/* Compare button - fixed at bottom */}
      {canCompare && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-300 min-w-0">
              <p>
                <strong>Older:</strong>{" "}
                {selectedSnapshots[0]?.split("/").pop()}
              </p>
              <p>
                <strong>Newer:</strong>{" "}
                {selectedSnapshots[1]?.split("/").pop()}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors cursor-pointer"
                title="Copy btrfs command"
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-500" />
                    <span className="text-green-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-4 h-4" />
                    <span>Copy cmd</span>
                  </>
                )}
              </button>
              <button
                onClick={handleCompare}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
              >
                Compare Snapshots
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spacer for fixed bottom bar */}
      {canCompare && <div className="h-24" />}

      {/* Loading overlay */}
      {isComparing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl flex flex-col items-center gap-4">
            <LoadingSpinner className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            <div className="text-center">
              <p className="font-medium text-gray-900 dark:text-white">
                Comparing snapshots...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                This may take a moment
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
