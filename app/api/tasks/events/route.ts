import { NextRequest } from 'next/server';
import { subscribeTaskEvents } from '@/lib/events/taskEvents';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  let unsubscribe: (() => void) | null = null;
  let keepAliveTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      // Send initial connect ping
      controller.enqueue(encoder.encode(': connected\n\n'));

      // Keep connection alive through proxies/firewalls every 25s with a comment
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          if (keepAliveTimer) clearInterval(keepAliveTimer);
        }
      }, 25_000);

      // Listen for task update notifications
      unsubscribe = subscribeTaskEvents(() => {
        try {
          controller.enqueue(encoder.encode('data: task-updated\n\n'));
        } catch {
          if (unsubscribe) unsubscribe();
        }
      });
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

