const PROXY_ROOT = 'ORIGIN_PLACEHOLDER';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;

    // Extract real target domain from subdomain (magic parsing)
    const targetHost = host.replace(`.${PROXY_ROOT}`, '');
    if (!targetHost || targetHost.includes(PROXY_ROOT)) {
      return new Response('Invalid proxy format', { status: 400 });
    }

    // Protocol setup (auto HTTPS)
    const TARGET_ORIGIN = `https://${targetHost}`;
    const TARGET_HTTP = `http://${targetHost}`;
    const TARGET_HTTPS = `https://${targetHost}`;
    const PROXY_ORIGIN = `https://${host}`;

    // Cloudflare edge region info
    const country = request.cf?.country || 'ZZ';
    const colo = request.cf?.colo || 'UNK';
    console.log(`Target: ${targetHost} | Country: ${country} | Edge: ${colo}`);

    try {
      // Build upstream request URL
      const upstreamUrl = TARGET_ORIGIN + url.pathname + url.search;

      // Create stealth proxy request
      const proxyReq = new Request(upstreamUrl, {
        method: request.method,
        headers: buildStealthHeaders(request.headers, targetHost),
        body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
        redirect: 'manual',
        // Cloudflare optimized routing
        cf: {
          cacheTtl: 0,
          cacheEverything: false,
          resolveOverride: null,
        }
      });

      // Fetch from target server
      const resp = await fetch(proxyReq);
      const respHeaders = new Headers(resp.headers);

      // Fix 301/302 redirects
      if (respHeaders.has('location')) {
        let location = respHeaders.get('location');
        location = location
          .replace(TARGET_HTTP, PROXY_ORIGIN)
          .replace(TARGET_HTTPS, PROXY_ORIGIN)
          .replace(targetHost, host);
        respHeaders.set('location', location);
      }

      // Unlock security restrictions
      respHeaders.delete('content-security-policy');
      respHeaders.delete('x-frame-options');
      respHeaders.set('access-control-allow-origin', '*');
      respHeaders.set('X-Proxy-Node', targetHost);

      // Rewrite HTML content
      const contentType = respHeaders.get('content-type') || '';
      if (contentType.includes('text/html')) {
        let html = await resp.text();
        html = html
          .replaceAll(TARGET_HTTP, PROXY_ORIGIN)
          .replaceAll(TARGET_HTTPS, PROXY_ORIGIN)
          .replaceAll(targetHost, host);

        return new Response(html, {
          status: resp.status,
          headers: respHeaders
        });
      }

      // Stream raw resources
      return new Response(resp.body, {
        status: resp.status,
        headers: respHeaders
      });

    } catch (err) {
      return new Response(`Proxy failed: ${err.message}`, { status: 502 });
    }
  }
};

// Build stealth request headers (bypass blocks)
function buildStealthHeaders(originalHeaders, targetHost) {
  const headers = new Headers(originalHeaders);
  headers.set('Host', targetHost);
  headers.set('Referer', `https://${targetHost}`);
  headers.delete('X-Forwarded-For');
  return headers;
}
