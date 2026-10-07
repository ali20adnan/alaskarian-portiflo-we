import http from 'node:http';
import { readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { validateSite, MAX_SITE_BYTES } from '../dist/assets/site-model.js';

const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const hash = value => createHash('sha256').update(value).digest();

export function createApp({ root = defaultRoot, dataFile = path.join(root, 'data/site.json'), password = '', publicOrigin = '', localOnly = true } = {}) {
  if (!localOnly && password.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters before listening outside localhost.');
  if (password && password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
  if (publicOrigin && !/^https?:\/\/[^/]+$/.test(publicOrigin)) throw new Error('PUBLIC_ORIGIN must be an http(s) origin without a trailing slash.');
  const sessions = new Map();
  const attempts = new Map();
  let writing = false;
  const json = (response, status, body, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); response.end(JSON.stringify(body)); };
  const cookie = (value, clear = false) => `alaskariannet_session=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 28800}${publicOrigin.startsWith('https:') ? '; Secure' : ''}`;
  const token = request => /(?:^|;\s*)alaskariannet_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
  const authenticated = request => !password || (sessions.get(token(request)) || 0) > Date.now();
  async function body(request, maxBytes = 128000) {
    if (!request.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Send JSON content.'), { status: 415 });
    let size = 0; const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON content.'), { status: 400 }); }
  }
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'SAMEORIGIN');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
    try {
      const host = request.headers.host || '';
      if (localOnly && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return json(response, 403, { error: 'Use the localhost address to access this workspace.' });
      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { return json(response, 400, { error: 'Invalid URL.' }); }
      if (pathname.startsWith('/api/')) {
        if (request.method !== 'GET') {
          const allowedOrigin = publicOrigin || `http://${host}`;
          if (request.headers.origin !== allowedOrigin || request.headers['x-admin-request'] !== '1') return json(response, 403, { error: 'This request must come from your admin dashboard.' });
        }
        if (pathname === '/api/session' && request.method === 'GET') return json(response, 200, { authenticated: authenticated(request), protected: Boolean(password) });
        if (pathname === '/api/login' && request.method === 'POST') {
          const now = Date.now();
          for (const [key, value] of attempts) if (value.expires < now) attempts.delete(key);
          for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key);
          const address = request.socket.remoteAddress;
          const attempt = attempts.get(address) || { count: 0, expires: now + 15 * 60 * 1000 };
          if (attempt.count >= 8) return json(response, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
          const input = await body(request);
          if (typeof input?.password !== 'string' || !timingSafeEqual(hash(input.password), hash(password))) {
            attempt.count++; attempts.set(address, attempt); return json(response, 401, { error: 'That password is not correct. Please try again.' });
          }
          attempts.delete(address);
          const session = randomBytes(32).toString('hex'); sessions.set(session, now + 8 * 60 * 60 * 1000);
          return json(response, 200, { ok: true }, { 'Set-Cookie': cookie(session) });
        }
        if (!authenticated(request)) return json(response, 401, { error: 'Please sign in before publishing changes.' });
        if (pathname === '/api/logout' && request.method === 'POST') { sessions.delete(token(request)); return json(response, 200, { ok: true }, { 'Set-Cookie': cookie('', true) }); }
        if (pathname === '/api/site' && request.method === 'PUT') {
          const input = await body(request, MAX_SITE_BYTES);
          let next;
          try { next = validateSite(input?.site); } catch (error) { return json(response, 400, { error: error.message }); }
          if (writing) return json(response, 409, { error: 'Another publish is in progress. Try again in a moment.' });
          writing = true;
          try {
            const current = JSON.parse(await readFile(dataFile, 'utf8'));
            if (input.baseUpdatedAt !== current.updatedAt) return json(response, 409, { error: 'The published page has changed in another session. Download your draft as a backup, then reload and discard the older draft before publishing.' });
            next.updatedAt = new Date(Math.max(Date.now(), (Date.parse(current.updatedAt) || 0) + 1)).toISOString();
            const temporary = `${dataFile}.tmp`;
            await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8');
            await rename(temporary, dataFile);
            return json(response, 200, next);
          } finally { writing = false; }
        }
        return json(response, 404, { error: 'Unknown admin endpoint.' });
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
      if (pathname === '/admin') { response.writeHead(302, { Location: '/admin/' }).end(); return; }
      if (pathname === '/data/site.json') {
        const content = await readFile(dataFile);
        response.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : content); return;
      }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment.startsWith('.')) || pathname.endsWith('.tmp')) return json(response, 403, { error: 'Forbidden path.' });
      const filename = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
      const relative = path.relative(root, filename);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return json(response, 403, { error: 'Forbidden path.' });
      const resolved = await realpath(filename);
      const resolvedRoot = await realpath(root);
      const actualRelative = path.relative(resolvedRoot, resolved);
      if (actualRelative.startsWith('..') || path.isAbsolute(actualRelative) || !(await stat(resolved)).isFile()) return json(response, 403, { error: 'Forbidden path.' });
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : await readFile(resolved));
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const status = error.status || (error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500);
      json(response, status, { error: status === 500 ? 'Could not save or load the page. Check that the server can access the content file.' : error.status ? error.message : 'Not found.' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  const localOnly = ['localhost', '127.0.0.1', '::1'].includes(host);
  const app = createApp({ password: process.env.ADMIN_PASSWORD || '', publicOrigin: process.env.PUBLIC_ORIGIN || '', localOnly });
  app.listen(port, host, () => {
    console.log(`Public page: http://localhost:${port}`);
    console.log(`Admin dashboard: http://localhost:${port}/admin/`);
    console.log(process.env.ADMIN_PASSWORD ? 'Admin password protection is enabled.' : 'Local workspace: publishing is restricted to this machine.');
  });
}
