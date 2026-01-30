const ORIGIN = 'ORIGIN_PLACEHOLDER';
let originHost = ORIGIN.replace(/^https?:\/\//, ''); // 去掉 http:// 或 https://
const ORIGIN_HTTP = 'http://' + originHost;
const ORIGIN_HTTPS = 'https://' + originHost;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 构造目标 URL
    const targetUrl = ORIGIN + url.pathname + url.search;

    const upstreamRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD'
        ? null
        : request.body,
      redirect: 'manual'
    });

    const resp = await fetch(upstreamRequest);
    const headers = new Headers(resp.headers);

    // 修正 302 / 301 跳转
    if (headers.has('location')) {
      headers.set(
        'location',
        headers.get('location').replace(ORIGIN, url.origin)
      );
    }

    const contentType = headers.get('content-type') || '';

    // 只替换 HTML
    if (contentType.includes('text/html')) {
      let html = await resp.text();

      html = html
        .replaceAll(ORIGIN_HTTP, url.origin)
        .replaceAll(ORIGIN_HTTPS, url.origin);

      return new Response(html, {
        status: resp.status,
        headers
      });
    }

    return new Response(resp.body, {
      status: resp.status,
      headers
    });
  }
};
