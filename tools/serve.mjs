import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../dist'));
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const server = createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400).end('Bad request'); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
  try {
    const actual = realpathSync(target);
    if (actual !== root && !actual.startsWith(root + sep)) throw new Error('outside dist');
    if (!statSync(actual).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': types[extname(actual)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    createReadStream(actual).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(4179, '127.0.0.1', () => console.log('serving dist/ at http://127.0.0.1:4179'));
