/**
 * Public share-page proxy.
 *
 * Keep the API Worker as the single source of truth for movie metadata,
 * Open Graph HTML and poster responses. Pages only provides the public URL.
 */
const UPSTREAM_ORIGIN = "https://findly-v3-api.berrchidcity99.workers.dev";

export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const upstream = new URL(incoming.pathname + incoming.search, UPSTREAM_ORIGIN);

  try {
    const upstreamRequest = new Request(upstream.toString(), context.request);
    return await fetch(upstreamRequest);
  } catch {
    return new Response("FINDLY share service is temporarily unavailable", {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
}
