import type { Route } from './+types/api.rebuild-index';
import { rebuildIndex, getIndexStatus } from '~/services/file-history.server';

/**
 * POST /api/rebuild-index
 * Body: { "subvolume": "/@snapshots" }
 *
 * Force rebuild the file history index from scratch
 * Returns Server-Sent Events stream for progress updates
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

    // Stream rebuild progress
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (type: string, data: any) => {
          const event = { type, ...data };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          sendEvent('start', { message: 'Starting index rebuild...' });

          // Clear old index and rebuild
          await rebuildIndex(subvolume);

          sendEvent('complete', { message: 'Index rebuilt successfully' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error('Error rebuilding index:', error);
          sendEvent('error', { message });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        message,
        error: message
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * GET /api/rebuild-index?subvolume=/@snapshots
 *
 * Get current index status (check if rebuild is needed)
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const subvolume = url.searchParams.get('subvolume');

  if (!subvolume) {
    throw new Response('Missing required parameter: subvolume', { status: 400 });
  }

  try {
    const status = await getIndexStatus(subvolume);

    return ({
      subvolume,
      ...status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Response(message, { status: 500 });
  }
}
