/**
 * app/api/crawl/route.js — Full site crawl API endpoint
 *
 * A full crawl can take 30 seconds to 5 minutes depending on site size.
 * We can't use a regular JSON response because the browser would just
 * sit at a loading spinner with no feedback for minutes.
 *
 * Instead we use Server-Sent Events (SSE) — a simple protocol where the
 * server keeps the HTTP connection open and pushes text events down to
 * the browser as they happen. The browser reads them with EventSource.
 *
 * SSE format is just lines of text:
 *   data: {"type":"progress","message":"Found 12 pages..."}\n\n
 *
 * Each event ends with two newlines. The browser receives these in real
 * time and we update the UI progress bar as they arrive.
 *
 * At the end we send one final event with type "complete" and the full
 * crawl result as JSON, then close the stream.
 */

import { crawlSite } from '../../../lib/crawler.js';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { url } = body;

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Please provide a URL to crawl.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const cleaned = url.trim().replace(/^https?:\/\//, '');
  if (!cleaned.includes('.') || cleaned.length < 4) {
    return new Response(
      JSON.stringify({ error: "That doesn't look like a valid URL." }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  /**
   * Create a ReadableStream that we'll write SSE events into.
   * The stream stays open for the duration of the crawl.
   * We use a TransformStream internally to get a writer we can
   * push data into from outside the stream constructor.
   */
  const encoder = new TextEncoder();
  let streamController;

  const stream = new ReadableStream({
    start(controller) {
      // Save the controller so we can push events from the crawl callback
      streamController = controller;
    },
    cancel() {
      // Client disconnected — nothing to clean up since crawl is synchronous
    },
  });

  /**
   * Helper to send one SSE event.
   * Encodes the payload as JSON and writes it in SSE format.
   * Two newlines at the end are required by the SSE protocol.
   */
  function sendEvent(data) {
    try {
      const text = `data: ${JSON.stringify(data)}\n\n`;
      streamController.enqueue(encoder.encode(text));
    } catch {
      // Stream was closed — ignore
    }
  }

  /**
   * Run the crawl in the background.
   * We don't await it here — we just start it and let it push
   * events via sendEvent() as it progresses.
   * When it finishes (or errors), it sends the final event and closes the stream.
   */
  (async () => {
    try {
      const result = await crawlSite(url.trim(), (phase, current, total, message) => {
        // This callback is called by the crawler as it makes progress.
        // We forward it to the browser as an SSE event.
        sendEvent({
          type: 'progress',
          phase,         // 'discovering' or 'auditing'
          current,       // pages done so far
          total,         // total pages (0 if unknown)
          message,       // human-readable status string
        });
      });

      if (result.error) {
        // Crawl returned an error (e.g. site unreachable)
        sendEvent({ type: 'error', error: result.error });
      } else {
        // Crawl completed successfully — send the full result
        sendEvent({ type: 'complete', result });
      }
    } catch (err) {
      sendEvent({ type: 'error', error: `Crawl failed unexpectedly. (${err.message})` });
    } finally {
      // Close the stream — this ends the SSE connection
      try { streamController.close(); } catch { /* already closed */ }
    }
  })();

  // Return the stream immediately with SSE headers.
  // The browser will keep this connection open and read events as they arrive.
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Allow the browser to read SSE from a different origin if needed
      'X-Accel-Buffering': 'no', // Disables Nginx buffering (important for SSE on Vercel)
    },
  });
}

/**
 * Force this route to be dynamic — it cannot be statically generated
 * because it streams data. Without this Next.js 15 tries to pre-render it.
 */
export const dynamic = 'force-dynamic';
