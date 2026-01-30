import { useFetcher } from "react-router";

export function IndexButton() {
  const fetcher = useFetcher();
  const isIndexing = fetcher.state === "submitting";

  return (
    <fetcher.Form method="post" action="/api/index-snapshot">
      <button
        type="submit"
        disabled={isIndexing}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <PlusIcon />
        {isIndexing ? "Indexing..." : "Index Snapshots"}
      </button>
    </fetcher.Form>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
      <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5a.75.75 0 0 1 1.5 0Z" />
    </svg>
  );
}
