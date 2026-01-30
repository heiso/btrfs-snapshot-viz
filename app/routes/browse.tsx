import type { Route } from "./+types/browse";
import { getSnapshot, getAllSnapshots, getFilesForSnapshot, getChangeSummary } from "../services/db.server";
import { FileList } from "../components/browser/FileList";
import { LatestCommitBar } from "../components/browser/LatestCommitBar";
import { SnapshotSelector } from "../components/layout/SnapshotSelector";
import { Breadcrumbs } from "../components/browser/Breadcrumbs";
import { IndexButton } from "../components/indexing/IndexButton";

export function meta({ data }: Route.MetaArgs) {
  const snapshot = data?.snapshot;
  return [
    { title: snapshot ? `${snapshot.name} - BTRFS Snapshot Viz` : "Browse - BTRFS Snapshot Viz" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const snapshotId = parseInt(params.snapshotId, 10);
  const currentPath = params["*"] || "";

  const snapshot = getSnapshot(snapshotId);
  if (!snapshot) {
    throw new Response("Snapshot not found", { status: 404 });
  }

  const snapshots = getAllSnapshots();
  const files = getFilesForSnapshot(snapshotId, currentPath);

  // Get change summary vs previous snapshot
  let changeSummary = null;
  const snapshotIndex = snapshots.findIndex((s) => s.id === snapshotId);
  if (snapshotIndex < snapshots.length - 1) {
    const previousSnapshot = snapshots[snapshotIndex + 1];
    changeSummary = getChangeSummary(previousSnapshot.id, snapshotId);
  }

  return {
    snapshot,
    snapshots,
    files,
    changeSummary,
    currentPath,
  };
}

export default function Browse({ loaderData }: Route.ComponentProps) {
  const { snapshot, snapshots, files, changeSummary, currentPath } = loaderData;

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

      {currentPath && (
        <Breadcrumbs
          snapshotId={snapshot.id}
          currentPath={currentPath}
        />
      )}

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
