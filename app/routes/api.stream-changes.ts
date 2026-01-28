import type { Route } from "./+types/api.stream-changes";
import { streamChanges, clearCache } from "~/services/btrfs-stream.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const oldSnapshotPath = url.searchParams.get("old");
  const newSnapshotPath = url.searchParams.get("new");
  const noCache = url.searchParams.get("nocache") === "1";

  if (!oldSnapshotPath || !newSnapshotPath) {
    return new Response("Missing required parameters", { status: 400 });
  }

  // Clear cache if requested
  if (noCache) {
    clearCache(oldSnapshotPath, newSnapshotPath);
  }

  // Create a readable stream that sends SSE events
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of streamChanges(oldSnapshotPath, newSnapshotPath)) {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
      } catch (error) {
        const errorEvent = JSON.stringify({ type: "error", message: String(error) });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
