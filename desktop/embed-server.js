// embed-server.js —— 电脑端本地 embedding 服务，经反向隧道暴露给服务器。
// 服务器上的 qq-bridge 在 embedding.url 配置时，通过 http 调用本服务对记忆做向量检索，
// 从而把 embedding 模型从 2核2G 服务器搬到这台有余力的电脑上。
//
// 用法（见 run-embed.bat）：
//   set EMBED_MODEL_PATH=D:\...\bge-small-zh-v1.5   (含 tokenizer/config/onnx 的目录)
//   set EMBED_PORT=8897
//   node embed-server.js
//
// 安全约束：
//  - 只监听 127.0.0.1（不对外网开放；服务器靠反向隧道 -R 8897 访问）
//  - 只接受 POST /embed 和 GET /health，其余 404
//  - 单条文本长度上限，拒绝异常请求
//  - 模型文件必须本地存在，禁止联网下载（env.allowRemoteModels = false）
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const PORT = Number(process.env.EMBED_PORT || 8897);
const HOST = process.env.EMBED_HOST || '127.0.0.1';
const MODEL_PATH = process.env.EMBED_MODEL_PATH || '';
const DTYPE = process.env.EMBED_DTYPE || 'q8';
const MAX_TEXT_LEN = 500;
const CACHE_SIZE = 2048;

function log(msg) {
  console.log(`${new Date().toISOString()} [embed-server] ${msg}`);
}

// 懒加载 + 预加载：服务先起来能响应 /health，模型在后台加载。
// 加载失败不退出，让 /health 和 /embed 各自反映真实状态。
let pipelinePromise = null;
async function loadModel() {
  if (!path.isAbsolute(MODEL_PATH) || !fs.existsSync(MODEL_PATH)) {
    throw new Error('EMBED_MODEL_PATH 未配置或目录不存在');
  }
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.localModelPath = path.dirname(MODEL_PATH) + path.sep;
  return await pipeline('feature-extraction', path.basename(MODEL_PATH), {
    local_files_only: true,
    device: 'cpu',
    dtype: DTYPE,
  });
}

function getModel() {
  if (!pipelinePromise) {
    pipelinePromise = loadModel().catch((e) => {
      log(`model load failed: ${e?.message ?? e}`);
      pipelinePromise = null;
      throw e;
    });
  }
  return pipelinePromise;
}

// 进程内缓存：按文本 -> 向量，限制条数（近似 LRU）。重复的文本（如重复的记忆）不再重复算。
const cache = new Map();
const inflight = new Map();
async function embedCached(text) {
  const hit = cache.get(text);
  if (hit) return hit;
  const pending = inflight.get(text);
  if (pending) return pending;
  const run = getModel().then(async (model) => {
    const result = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  });
  inflight.set(text, run);
  try {
    const vector = await run;
    cache.set(text, vector);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    return vector;
  } finally {
    inflight.delete(text);
  }
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  let u;
  try {
    u = new URL(req.url, `http://${HOST}:${PORT}`);
  } catch {
    return sendJson(res, 400, { error: 'bad request' });
  }
  if (req.method === 'GET' && u.pathname === '/health') {
    return sendJson(res, 200, { ok: true, model: pipelinePromise ? 'loaded' : 'loading' });
  }
  if (req.method !== 'POST' || u.pathname !== '/embed') {
    return sendJson(res, 404, { error: 'not found' });
  }
  try {
    const body = await readBody(req);
    let text;
    try {
      text = String(JSON.parse(body).text ?? '');
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    if (!text.trim()) return sendJson(res, 400, { error: 'text is empty' });
    if (text.length > MAX_TEXT_LEN) return sendJson(res, 400, { error: 'text too long' });
    const vector = await embedCached(text);
    return sendJson(res, 200, { vector });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message ?? String(e) });
  }
});

server.on('error', (e) => {
  log(`listen failed: ${e?.message ?? e}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  log(`embedding server on http://${HOST}:${PORT} (model: ${MODEL_PATH || '未配置'})`);
  // 预加载模型：让首次 /embed 不因模型加载而超时。
  if (MODEL_PATH) {
    getModel().then(() => log('model ready')).catch(() => log('model not ready yet'));
  }
});
