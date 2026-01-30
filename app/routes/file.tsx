import { Link } from "react-router";
import type { Route } from "./+types/file";
import { getSnapshot, getFile } from "../services/db.server";
import { readFileContent } from "../services/btrfs.server";
import { Breadcrumbs } from "../components/browser/Breadcrumbs";
import { formatSize } from "../lib/format";

export function meta({ data }: Route.MetaArgs) {
  const fileName = data?.file?.name || "File";
  return [{ title: `${fileName} - BTRFS Snapshot Viz` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const snapshotId = parseInt(params.snapshotId, 10);
  const filePath = params["*"] || "";

  const snapshot = getSnapshot(snapshotId);
  if (!snapshot) {
    throw new Response("Snapshot not found", { status: 404 });
  }

  const file = getFile(snapshotId, filePath);
  if (!file) {
    throw new Response("File not found", { status: 404 });
  }

  // Try to read file content
  let content: { content: string; size: number; isBinary: boolean; isTruncated: boolean } | null = null;
  let error: string | null = null;

  try {
    content = readFileContent(snapshot.path, filePath);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read file";
  }

  return {
    snapshot,
    file,
    filePath,
    content,
    error,
  };
}

export default function FileView({ loaderData }: Route.ComponentProps) {
  const { snapshot, file, filePath, content, error } = loaderData;

  return (
    <div>
      <Breadcrumbs snapshotId={snapshot.id} currentPath={filePath} />

      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-t-md">
        <div className="flex items-center gap-2">
          <span>📄</span>
          <span className="font-medium">{file.name}</span>
          <span className="text-gray-500 dark:text-gray-400 text-sm">
            {formatSize(file.size)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/history/${filePath}`}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <HistoryIcon />
            History
          </Link>
        </div>
      </div>

      <div className="border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-md overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {error}
          </div>
        ) : content?.isBinary ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            Binary file ({formatSize(content.size)})
          </div>
        ) : content ? (
          <div className="overflow-x-auto">
            {content.isTruncated && (
              <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-sm">
                File truncated. Showing first 5MB of {formatSize(content.size)}.
              </div>
            )}
            <pre className="text-sm">
              <code>
                {content.content.split("\n").map((line, i) => (
                  <div key={i} className="flex hover:bg-gray-50 dark:hover:bg-gray-800">
                    <span className="w-12 px-3 text-right text-gray-500 dark:text-gray-400 select-none bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
                      {i + 1}
                    </span>
                    <span className="px-3 whitespace-pre">{line}</span>
                  </div>
                ))}
              </code>
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
      <path d="M1.643 3.143.427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684ZM7.75 4a.75.75 0 0 0-.75.75v2.992l2.028.812a.75.75 0 0 0 .557-1.392l-1.085-.434V4.75A.75.75 0 0 0 7.75 4Z" />
    </svg>
  );
}
