import type { Route } from './+types/api.file-history';
import {
  getFileHistory,
  getIndexMetadata,
  buildFileIndex,
  needsInitialBuild
} from '~/services/file-history.server';

/**
 * GET /api/file-history?subvolume=/@snapshots&file=/path/to/file&stream=true
 *
 * Get file history timeline. If index is not built, optionally stream build progress.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const subvolume = url.searchParams.get('subvolume');
  const file = url.searchParams.get('file');
  const stream = url.searchParams.get('stream') === 'true';

  if (!subvolume || !file) {
    throw new Response('Missing required parameters: subvolume and file', {
      status: 400
    });
  }

  try {
    // Check if index needs to be built
    const needsBuild = await needsInitialBuild(subvolume);
    const metadata = await getIndexMetadata(subvolume);

    // If index is incomplete and streaming is requested, stream the build progress
    if ((needsBuild || metadata?.status !== 'complete') && stream) {
      return streamIndexBuilding(subvolume, file);
    }

    // If index is incomplete and streaming is not requested, return status
    if (needsBuild || metadata?.status !== 'complete') {
      return ({
        indexStatus: {
          exists: !!metadata,
          complete: false,
          needsBuild,
          progress: {
            current: metadata?.indexed_snapshots || 0,
            total: metadata?.total_snapshots || 0
          }
        },
        timeline: null
      });
    }

    // Index is complete, return file history
    const timeline = await getFileHistory(subvolume, file);

    if (!timeline) {
      throw new Response('File not found in history', { status: 404 });
    }

    return ({
      indexStatus: {
        exists: true,
        complete: true,
        needsBuild: false,
        progress: {
          current: metadata.indexed_snapshots,
          total: metadata.total_snapshots
        }
      },
      timeline
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Response(message, { status: 500 });
  }
}

/**
 * Stream index building progress using Server-Sent Events
 */
function streamIndexBuilding(subvolume: string, file: string) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (type: string, data: any) => {
        const event = { type, ...data };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        sendEvent('start', { message: 'Building file history index...' });

        // Build index with progress updates
        await buildFileIndex(subvolume, {
          onProgress: (current, total) => {
            sendEvent('progress', {
              current,
              total,
              percentage: Math.round((current / total) * 100)
            });
          }
        });

        // Get file history after index is complete
        const timeline = await getFileHistory(subvolume, file);

        if (!timeline) {
          sendEvent('error', { message: 'File not found in history' });
        } else {
          sendEvent('complete', { timeline });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
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
}
