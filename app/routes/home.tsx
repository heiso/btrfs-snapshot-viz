import { Link } from "react-router";
import type { Route } from "./+types/home";
import { getSubvolumes, isDemoMode } from "~/services/index.server";
import type { Subvolume } from "~/types";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "BTRFS Snapshot Visualizer" },
    {
      name: "description",
      content: "Visualize and compare btrfs snapshots",
    },
  ];
}

export async function loader() {
  const subvolumes = await getSubvolumes();
  const isDemo = isDemoMode();
  return { subvolumes, isDemo };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { subvolumes, isDemo } = loaderData;

  // Filter to show only main subvolumes (not snapshots)
  const mainSubvolumes = subvolumes.filter((sv: Subvolume) => !sv.isSnapshot);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            BTRFS Snapshot Visualizer
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Explore snapshots and view incremental changes
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {isDemo && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Running in demo mode with sample data. Set{" "}
              <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">
                DEMO=false
              </code>{" "}
              to use real btrfs commands.
            </p>
          </div>
        )}

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Select a Subvolume
          </h2>

          {mainSubvolumes.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              No subvolumes found. Make sure you have btrfs subvolumes with
              snapshots configured.
            </p>
          ) : (
            <div className="space-y-3">
              {mainSubvolumes.map((subvolume: Subvolume) => (
                <Link
                  key={subvolume.id}
                  to={`/snapshots/${encodeURIComponent(subvolume.path)}`}
                  className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {subvolume.path}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        ID: {subvolume.id} | Created:{" "}
                        {new Date(subvolume.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
