import type { Route } from './+types/browse';
import { useLoaderData, useNavigate } from 'react-router';
import { getDirectoryContents } from '~/services/file-listing.server';
import { FileBrowser } from '~/components/FileBrowser';
import { Breadcrumbs } from '~/components/Breadcrumbs';

/**
 * Browse route: /browse/:snapshot/*
 * Example: /browse/@snapshots/2026-01-29_00:00:01/home/user
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  const { snapshot, '*': splat } = params;

  if (!snapshot) {
    throw new Response('Missing snapshot parameter', { status: 400 });
  }

  const snapshotPath = `/${snapshot}`;
  const dirPath = splat ? `/${splat}` : '/';

  try {
    const files = await getDirectoryContents(snapshotPath, dirPath);

    return ({
      snapshot: snapshotPath,
      directory: dirPath,
      files
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Response(message, { status: 500 });
  }
}

export default function Browse() {
  const { snapshot, directory, files } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleNavigate = (path: string, isDirectory: boolean) => {
    if (isDirectory) {
      // Navigate to directory
      const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
      navigate(`/browse${snapshot}/${normalizedPath}`);
    } else {
      // View file content (could open in modal or navigate to file viewer)
      // For now, we'll show an alert - we'll implement proper file viewer later
      console.log('View file:', path);
    }
  };

  const handleGoUp = () => {
    if (directory === '/') return;

    const parentPath = directory.split('/').slice(0, -1).join('/') || '/';
    const normalizedPath = parentPath === '/' ? '' : parentPath.slice(1);
    navigate(`/browse${snapshot}/${normalizedPath}`);
  };

  const handleViewHistory = (filePath: string) => {
    // Extract subvolume from snapshot path
    // Assuming snapshot path is like /@snapshots/2026-01-29_00:00:01
    const subvolume = snapshot.split('/').slice(0, 2).join('/');
    navigate(`/file-history?subvolume=${encodeURIComponent(subvolume)}&file=${encodeURIComponent(filePath)}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          File Browser
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Snapshot: {snapshot}
        </p>
      </div>

      {/* Breadcrumbs */}
      <div className="mb-4">
        <Breadcrumbs
          snapshot={snapshot}
          directory={directory}
          onNavigate={(path) => {
            const normalizedPath = path === '/' ? '' : path.slice(1);
            navigate(`/browse${snapshot}/${normalizedPath}`);
          }}
        />
      </div>

      {/* File Browser */}
      <FileBrowser
        files={files}
        directory={directory}
        onNavigate={handleNavigate}
        onGoUp={handleGoUp}
        onViewHistory={handleViewHistory}
      />

      {/* Back Button */}
      <div className="mt-6">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
