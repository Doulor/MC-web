addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const ORIGIN = 'http://13.75.68.60:22225' // <- change if your map origin changes
// If your origin is fronted by frp/http routing that expects a specific Host header (e.g. 'firef.cc.cd' or 'firef.cc.cd:22225'),
// set PROXY_HOST to that value. If empty, the worker will set Host to the ORIGIN host (e.g. '13.75.68.60:22225').
const PROXY_HOST = 'firef.cc.cd' // or 'firef.cc.cd:22225' if your routing requires the port

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

async function handleRequest(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Build target URL by preserving path and query
  const incoming = new URL(request.url)
  const targetUrl = ORIGIN + incoming.pathname + incoming.search

  // Forward the request to the origin
  // Build a clean header set: copy incoming headers but override Host and remove hop-by-hop headers
  const newHeaders = new Headers()
  for (const [k, v] of request.headers.entries()) {
    newHeaders.set(k, v)
  }

  // Set Host to the origin's host so origin server sees expected Host header
  // Prefer PROXY_HOST if provided (useful when origin is reached by IP but routing expects the site's Host)
  newHeaders.set('Host', PROXY_HOST || (new URL(ORIGIN)).host)

  // Remove headers that may cause issues
  newHeaders.delete('cf-connecting-ip')
  newHeaders.delete('x-forwarded-for')
  newHeaders.delete('x-real-ip')
  newHeaders.delete('connection')
  newHeaders.delete('expect')
  newHeaders.delete('keep-alive')

  const forwarded = new Request(targetUrl, {
    method: request.method,
    headers: newHeaders,
    body: request.body,
    redirect: 'follow',
  })

  let resp
  try {
    resp = await fetch(forwarded)
  } catch (err) {
    return new Response('Upstream fetch error: ' + String(err), { status: 502 })
  }

  // Copy response headers and add CORS
  const headers = new Headers(resp.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', '*')

  // Optional: set cache-control for images to reduce origin load
  if (!headers.has('Cache-Control')) {
    // You can tune this value or remove it
    headers.set('Cache-Control', 'public, max-age=60')
  }

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  })
}
