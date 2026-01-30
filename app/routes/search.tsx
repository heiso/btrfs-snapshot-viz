import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/search";
import { searchFiles, getAllSnapshots } from "../services/db.server";
import { formatSize } from "../lib/format";

export function meta() {
  return [{ title: "Search - BTRFS Snapshot Viz" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const snapshotId = url.searchParams.get("snapshot");

  const snapshots = getAllSnapshots();

  if (!query) {
    return { query, snapshots, results: [], snapshotId };
  }

  const results = searchFiles(query, snapshotId ? parseInt(snapshotId, 10) : undefined);

  return { query, snapshots, results, snapshotId };
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { query, snapshots, results, snapshotId } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newQuery = formData.get("q") as string;
    const newSnapshot = formData.get("snapshot") as string;

    const newParams = new URLSearchParams();
    if (newQuery) newParams.set("q", newQuery);
    if (newSnapshot) newParams.set("snapshot", newSnapshot);
    setSearchParams(newParams);
  };

  return (
    <div className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search for files..."
          className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        />
        <select
          name="snapshot"
          defaultValue={snapshotId || ""}
          className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm"
        >
          <option value="">All snapshots</option>
          {snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
        >
          Search
        </button>
      </form>

      {query && results.length === 0 && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          No files found matching "{query}".
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
          {results.map((file) => (
            <Link
              key={`${file.snapshot_id}-${file.path}`}
              to={`/file/${file.snapshot_id}/${file.path}`}
              className="block px-4 py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <div className="font-mono text-sm mb-1">{file.path}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {formatSize(file.size)} · Found in {file.snapshot_name}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!query && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          Enter a filename to search across all indexed snapshots.
        </div>
      )}
    </div>
  );
}
