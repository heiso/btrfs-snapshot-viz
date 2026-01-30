import type { Route } from "./+types/home";
import { getLatestSnapshot, getAllSnapshots, getFilesForSnapshot, getChangeSummary } from "../services/db.server";
import { FileList } from "../components/browser/FileList";
import { LatestCommitBar } from "../components/browser/LatestCommitBar";
import { SnapshotSelector } from "../components/layout/SnapshotSelector";
import { IndexButton } from "../components/indexing/IndexButton";

export function meta() {
  return [
    { title: "BTRFS Snapshot Viz" },
    { name: "description", content: "Browse your btrfs snapshots like GitHub" },
  ];
}

export async function loader() {
  const snapshots = getAllSnapshots();
  const latestSnapshot = getLatestSnapshot();

  if (!latestSnapshot) {
    return {
      snapshot: null,
      snapshots,
      files: [],
      changeSummary: null,
      currentPath: "",
    };
  }

  const files = getFilesForSnapshot(latestSnapshot.id, "");

  let changeSummary = null;
  if (snapshots.length > 1) {
    const previousSnapshot = snapshots[1];
    changeSummary = getChangeSummary(previousSnapshot.id, latestSnapshot.id);
  }

  return {
    snapshot: latestSnapshot,
    snapshots,
    files,
    changeSummary,
    currentPath: "",
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { snapshot, snapshots, files, changeSummary, currentPath } = loaderData;

  if (!snapshot) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold mb-4">No snapshots indexed</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Click the button below to discover and index your btrfs snapshots.
        </p>
        <IndexButton />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <SnapshotSelector
          currentSnapshot={snapshot}
          snapshots={snapshots}
          currentPath={currentPath}
        />
        <IndexButton />
      </div>

      <LatestCommitBar
        snapshot={snapshot}
        changeSummary={changeSummary}
        totalSnapshots={snapshots.length}
      />

      <FileList
        files={files}
        snapshotId={snapshot.id}
        currentPath={currentPath}
      />
    </div>
  );
}
