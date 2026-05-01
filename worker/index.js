export default {
  async fetch(request) {
    // 从请求头 teleconpo 读取目标真实域名
    const ORIGIN = request.headers.get('teleconpo') || '';

    // 如果没有传这个 header，直接返回错误
    if (!ORIGIN) {
      return new Response('Missing teleconpo header', { status: 400 });
    }

    const url = new URL(request.url);
    const targetUrl = new URL(url.pathname + url.search, ORIGIN);

    // 构造转发请求
    const upstreamRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: (request.method === 'GET' || request.method === 'HEAD') ? null : request.body,
      redirect: 'manual'
    });

    const resp = await fetch(upstreamRequest);
    const headers = new Headers(resp.headers);

    // 修复 301/302 跳转
    if (headers.has('location')) {
      const location = headers.get('location').replace(ORIGIN, url.origin);
      headers.set('location', location);
    }

    // 修复 HTML 里的绝对地址
    const contentType = headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      let html = await resp.text();
      html = html.replaceAll(ORIGIN, url.origin);
      return new Response(html, {
        status: resp.status,
        headers
      });
    }

    // 其他资源直接流式返回
    return new Response(resp.body, {
      status: resp.status,
      headers
    });
  }
};
