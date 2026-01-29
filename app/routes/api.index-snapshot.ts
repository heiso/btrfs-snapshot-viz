import type { Route } from './+types/api.index-snapshot';
import { json } from 'react-router';
import { indexLatestSnapshot } from '~/services/file-history.server';

/**
 * POST /api/index-snapshot
 * Body: { "subvolume": "/@snapshots" }
 *
 * Auto-index the latest snapshot for a subvolume
 * This endpoint is designed to be called after snapshot creation
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const { subvolume } = body;

    if (!subvolume) {
      throw new Response('Missing required parameter: subvolume', { status: 400 });
    }

    await indexLatestSnapshot(subvolume);

    return json({
      success: true,
      message: 'Latest snapshot indexed successfully',
      subvolume
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error indexing latest snapshot:', error);

    return json(
      {
        success: false,
        message,
        error: message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/index-snapshot?subvolume=/@snapshots
 *
 * Check if latest snapshot is indexed
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const subvolume = url.searchParams.get('subvolume');

  if (!subvolume) {
    throw new Response('Missing required parameter: subvolume', { status: 400 });
  }

  try {
    const { getSnapshots } = await import('~/services/index.server');
    const { getIndexMetadata } = await import('~/services/file-history.server');

    const snapshots = await getSnapshots(subvolume);
    const metadata = await getIndexMetadata(subvolume);

    const latestSnapshot = snapshots[snapshots.length - 1];
    const isLatestIndexed =
      metadata?.last_indexed_snapshot === latestSnapshot?.path;

    return json({
      subvolume,
      latestSnapshot: latestSnapshot?.path,
      lastIndexedSnapshot: metadata?.last_indexed_snapshot,
      isLatestIndexed,
      totalSnapshots: snapshots.length,
      indexedSnapshots: metadata?.indexed_snapshots || 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Response(message, { status: 500 });
  }
}
