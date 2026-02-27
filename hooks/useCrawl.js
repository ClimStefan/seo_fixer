/**
 * hooks/useCrawl.js — Custom React hook for the full site crawl
 *
 * This hook handles everything related to starting a crawl and
 * receiving its progress and results via Server-Sent Events.
 *
 * It abstracts away the SSE connection logic so that the UI
 * components just call startCrawl(url) and read state values.
 *
 * Returns:
 *   startCrawl(url) — starts a new crawl
 *   reset()         — clears all state back to idle
 *   status          — 'idle' | 'discovering' | 'auditing' | 'complete' | 'error'
 *   progress        — { current, total, message } — live progress numbers
 *   result          — the full crawl result object (when status === 'complete')
 *   error           — error message string (when status === 'error')
 */

import { useState, useCallback, useRef } from 'react';

export function useCrawl() {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // We keep a ref to the fetch reader so we could cancel it if needed
  const readerRef = useRef(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress({ current: 0, total: 0, message: '' });
    setResult(null);
    setError(null);
  }, []);

  const startCrawl = useCallback(async (url) => {
    // Clear previous state
    setStatus('discovering');
    setProgress({ current: 0, total: 0, message: 'Starting crawl...' });
    setResult(null);
    setError(null);

    try {
      /**
       * Start the POST request to /api/crawl.
       * We DON'T use EventSource here because EventSource only supports GET.
       * Instead we use fetch() and read the response body as a stream,
       * which gives us the same SSE events via a ReadableStream reader.
       */
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        // Non-SSE error response (e.g. 400 bad request)
        const data = await response.json();
        setError(data.error || 'Failed to start crawl.');
        setStatus('error');
        return;
      }

      // Get a reader for the response body stream
      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();

      // Buffer for incomplete SSE lines — a single chunk may contain
      // partial events if the network splits them across TCP packets
      let buffer = '';

      // Read the stream chunk by chunk until it closes
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Decode the bytes and add to our line buffer
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines (\n\n)
        // We split on that and process each complete event
        const events = buffer.split('\n\n');

        // The last element may be an incomplete event — keep it in the buffer
        buffer = events.pop() || '';

        for (const eventText of events) {
          // Each event line starts with "data: "
          const dataLine = eventText.split('\n').find(line => line.startsWith('data: '));
          if (!dataLine) continue;

          const jsonStr = dataLine.slice(6); // Remove "data: " prefix
          let event;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue; // Malformed JSON — skip
          }

          // Handle each event type
          if (event.type === 'progress') {
            setStatus(event.phase); // 'discovering' or 'auditing'
            setProgress({
              current: event.current,
              total: event.total,
              message: event.message,
            });
          } else if (event.type === 'complete') {
            setResult(event.result);
            setStatus('complete');
          } else if (event.type === 'error') {
            setError(event.error);
            setStatus('error');
          }
        }
      }
    } catch (err) {
      // Network error or stream read failure
      setError(`Connection error: ${err.message}`);
      setStatus('error');
    }
  }, []);

  return { startCrawl, reset, status, progress, result, error };
}
