import type { Route } from './+types/api.file-content';
import { getFileContent } from '~/services/file-listing.server';

/**
 * GET /api/file-content?snapshot=/@snapshots/...&file=/path/to/file
 *
 * Get file content from a specific snapshot
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const snapshot = url.searchParams.get('snapshot');
  const file = url.searchParams.get('file');

  if (!snapshot || !file) {
    throw new Response('Missing required parameters: snapshot and file', { status: 400 });
  }

  try {
    const content = await getFileContent(snapshot, file);
    return ({
      snapshot,
      file,
      ...content
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('not found')) {
      throw new Response(message, { status: 404 });
    }
    if (message.includes('Permission denied')) {
      throw new Response(message, { status: 403 });
    }
    if (message.includes('Cannot read directory')) {
      throw new Response(message, { status: 400 });
    }

    throw new Response(message, { status: 500 });
  }
}
