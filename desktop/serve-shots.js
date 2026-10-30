// serve-shots.js —— 把手机截图目录用只读 HTTP 暴露给服务器。
// 服务器上的 qq-bridge 会通过反向隧道访问 http://127.0.0.1:8898/<文件名>，
// 再把图片作为 base64 交给 QQ 网关发出去。
//
// 安全约束：
//  - 只监听 127.0.0.1（不对外网开放）
//  - 只允许读取 SHOT_DIR 下的图片文件（jpg/jpeg/png/gif/webp），禁止目录穿越和非图片文件
//  - 不列目录
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = Number(process.env.PHONE_SHOT_PORT || 8898);
const HOST = process.env.PHONE_SHOT_HOST || '127.0.0.1';
const DIR = process.env.PHONE_SHOT_DIR || path.join(os.tmpdir(), 'phone-mcp-shots');
const ALLOW_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function log(msg) {
  console.log(`${new Date().toISOString()} [serve-shots] ${msg}`);
}

const server = http.createServer((req, res) => {
  const deny = (code, msg) => {
    res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(msg);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return deny(405, 'method not allowed');
  let name;
  try {
    const u = new URL(req.url, `http://${HOST}:${PORT}`);
    name = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  } catch {
    return deny(400, 'bad request');
  }
  if (!name) return deny(404, 'not found');
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return deny(403, 'forbidden');
  const ext = path.extname(name).toLowerCase();
  if (!ALLOW_EXT.has(ext)) return deny(403, 'only image files');
  const full = path.join(DIR, name);
  if (!path.resolve(full).startsWith(path.resolve(DIR))) return deny(403, 'forbidden');
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return deny(404, 'not found');
  }
  if (!stat.isFile()) return deny(404, 'not found');
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(full).pipe(res);
});

server.on('error', (e) => {
  log(`listen failed: ${e?.message ?? e}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => log(`serving ${DIR} on http://${HOST}:${PORT}`));
