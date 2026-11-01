// server.mjs —— 小肥鱼后台管理服务：独立 node 服务，直接读写 state 文件，不依赖 bridge。
// 提供：记忆 CRUD + reinstate/badHit/遗忘打分、mood 读写、以及同源托管 web/ 前端（解决 CORS）。
// 用法：
//   STATE_DIR=/opt/qq-bridge/state node web/server.mjs --port 8081
//   （STATE_DIR 默认 ../state；端口默认 8081）
// 复用 mcp/ 下的纯函数（memory-store / forgetting / mood），零第三方依赖。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, forget, reinstate, applyBadHit } from '../mcp/memory-store.mjs';
import { retentionOf, scoreOf } from '../mcp/forgetting.mjs';
import { energyOf, moodLabel, setEnergy } from '../mcp/mood.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = __dirname;
const STATE_DIR = process.env.STATE_DIR || '/opt/qq-bridge/state';
const MEMORY_FILE = path.join(STATE_DIR, 'long-memory-v2.json');
const MOOD_FILE = path.join(STATE_DIR, 'mood.json');
const PORT = Number(process.env.PORT || process.argv[process.argv.indexOf('--port') + 1] || 8081);

function log(msg) { console.log(`${new Date().toISOString()} [management] ${msg}`); }

// ---- 文件读写（原子写） ----
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function atomicWrite(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
function loadMemories() {
  if (!fs.existsSync(MEMORY_FILE)) return [];
  return migrate(JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')));
}
function saveMemories(records) { atomicWrite(MEMORY_FILE, records); }

// ---- 遗忘打分（和前端内联公式一致） ----
function tierOf(m) {
  return { person:'hard', fact:'hard', pref:'general', promise:'long', event:'long' }[m.type] ?? 'general';
}
function withScores(m, now = Date.now()) {
  const fact = { tier: tierOf(m), I: (Number(m.importance) || 3) / 5, lastAt: m.lastTs ?? m.ts };
  return { ...m, retention: retentionOf(fact, now), score: scoreOf(fact, now) };
}

// ---- 工具 ----
function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };

// ---- 静态文件 ----
function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (rel.includes('..')) return sendJson(res, 403, { ok: false, error: 'forbidden' });
  const full = path.join(WEB_DIR, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return sendJson(res, 404, { ok: false, error: 'not found' });
  res.writeHead(200, { 'content-type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}

// ---- API 路由 ----
async function handleApi(req, res, url) {
  const p = url.pathname;

  // 记忆：列出（含遗忘打分）
  if (p === '/api/memories' && req.method === 'GET') {
    const records = loadMemories();
    const q = String(url.searchParams.get('q') ?? '').toLowerCase();
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 100));
    let list = q ? records.filter(m => String(m.text ?? '').toLowerCase().includes(q)) : records;
    list = [...list].sort((a, b) => (b.lastTs || b.ts || 0) - (a.lastTs || a.ts || 0));
    return sendJson(res, 200, { ok: true, total: list.length, entries: list.slice(0, limit).map(m => withScores(m)) });
  }

  // 记忆：作废（墓碑）
  if (p === '/api/memories/forget' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const records = loadMemories();
    const result = forget(records, String(body.id ?? ''), { admin: true });
    if (result.removed) saveMemories(result.records);
    return sendJson(res, 200, { ok: result.removed > 0, removed: result.removed });
  }

  // 记忆：恢复作废（reinstate）
  if (p === '/api/memories/reinstate' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const records = loadMemories();
    const result = reinstate(records, String(body.id ?? ''), { admin: true });
    if (result.restored) saveMemories(result.records);
    return sendJson(res, 200, { ok: result.restored > 0, restored: result.restored });
  }

  // 记忆：标记召回错（badHit）
  if (p === '/api/memories/badhit' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const records = loadMemories();
    const result = applyBadHit(records, String(body.id ?? ''), { admin: true });
    if (result.badHit) saveMemories(result.records);
    return sendJson(res, 200, { ok: result.badHit });
  }

  // mood：读
  if (p === '/api/mood' && req.method === 'GET') {
    const state = readJson(MOOD_FILE, { energy: 0.5, lastAt: Date.now() });
    const energy = energyOf(state);
    return sendJson(res, 200, { ok: true, energy, mood: moodLabel(energy), raw: state });
  }

  // mood：设（后台情绪仪表盘调节）
  if (p === '/api/mood' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const state = setEnergy({}, body.energy);
    atomicWrite(MOOD_FILE, state);
    return sendJson(res, 200, { ok: true, ...state });
  }

  // 状态：服务自检
  if (p === '/api/status' && req.method === 'GET') {
    const memCount = fs.existsSync(MEMORY_FILE) ? loadMemories().length : 0;
    return sendJson(res, 200, { ok: true, memoryCount: memCount, stateDir: STATE_DIR });
  }

  return sendJson(res, 404, { ok: false, error: 'unknown api: ' + p });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e?.message ?? String(e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  log(`management server on http://127.0.0.1:${PORT}（STATE_DIR=${STATE_DIR}）`);
});
