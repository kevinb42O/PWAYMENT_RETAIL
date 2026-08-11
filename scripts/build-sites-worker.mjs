import { mkdir, writeFile } from 'node:fs/promises';

const worker = `const htmlRequest = (request) => {
  const accept = request.headers.get('accept') || '';
  return request.method === 'GET' && accept.includes('text/html');
};

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || !htmlRequest(request)) return response;

    const fallbackUrl = new URL('/index.html', request.url);
    return env.ASSETS.fetch(new Request(fallbackUrl, request));
  },
};
`;

await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/server/index.js', import.meta.url), worker, 'utf8');
