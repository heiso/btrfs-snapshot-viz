import type { Route } from './+types/api.files';
import { getDirectoryContents } from '~/services/file-listing.server';

/**
 * GET /api/files/:snapshotPath?path=/some/dir
 *
 * List files in a directory at a specific snapshot
 */
export async function loader({ params, request }: Route.LoaderArgs) {
  const { snapshotPath } = params;
  const url = new URL(request.url);
  const dirPath = url.searchParams.get('path') || '/';
  const includeSize = url.searchParams.get('includeSize') !== 'false';

  if (!snapshotPath) {
    throw new Response('Missing snapshot path', { status: 400 });
  }

  try {
    const decodedSnapshotPath = decodeURIComponent(snapshotPath);
    const files = await getDirectoryContents(decodedSnapshotPath, dirPath, includeSize);

    return {
      snapshot: decodedSnapshotPath,
      directory: dirPath,
      files,
      count: files.length
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('not found')) {
      throw new Response(message, { status: 404 });
    }
    if (message.includes('Permission denied')) {
      throw new Response(message, { status: 403 });
    }

    throw new Response(message, { status: 500 });
  }
}
