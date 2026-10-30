import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { remember, search, forget, validKey } from '../mcp/memory-store.mjs';

// 上游未授权再分发，测试读取应用补丁后的本地上游目录。
const root = process.env.BRIDGE_TEST_ROOT;
const source = root ? fs.readFileSync(path.join(root, 'src/bridge.js'), 'utf8') : '';
const start = source.indexOf("        if (url.pathname.startsWith('/api/memory/long'))");
const end = source.indexOf('        const slangMatch', start);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const route = root ? new AsyncFunction('ctx', `with (ctx) { ${source.slice(start, end)} }`) : null;

function context({ key = 'group:1', token = 'valid', method = 'GET', endpoint = '/api/memory/long', body = {}, paused = false } = {}) {
  const ctx = {
    req: { method, headers: { 'x-agent-token': token } },
    url: new URL(`http://localhost${endpoint}?key=${key}&q=篮球`),
    readBody: async () => ({ key, ...body }),
    agentTokenOk: (k, t) => k === 'group:1' && t === 'valid',
    v2SessionAllowed: k => k === 'group:1', v2ToolEnabled: () => true,
    socialV2: { paused }, cfg: { longMemory: { enabled: true } },
    validKey, forget, longMemory: [],
    state: { sessions: { 'group:1': 'old-session' } }, memoryIsolatedSessions: { 'group:1': 'old-session' },
    forgottenMemory: [], memoryTextHash: x => x,
    MEMORY_FORGOTTEN_FILE: 'unused', MEMORY_SESSION_FILE: 'unused',
    atomicWriteJson: () => {}, saveState: () => {},
    getSocialV2State: () => ({ recentMessages: [{ messageId: 'e1', userId: '11', text: '喜欢篮球' }] }),
    queueMemoryTask: () => {}, runMemorySummary: () => {},
    sendJson: (body, status = 200) => { ctx.response = { body, status }; },
  };
  ctx.retrieveLongMemory = async opts => search(ctx.longMemory, opts);
  ctx.addLongMemory = input => {
    const result = remember(ctx.longMemory, input);
    ctx.longMemory = result.records;
    return result.entry;
  };
  ctx.commitLongMemory = records => { ctx.longMemory = records; };
  return ctx;
}

test('actual bridge memory routes bind every operation to authorized session', { skip: !root }, async () => {
  assert.ok(start > 0 && end > start);
  for (const opts of [
    { key: '' }, { key: 'private:11' }, { token: 'bad' }, { token: '' }, { paused: true },
    { key: 'private:11', method: 'POST', body: { text: '偷写另一条会话' } },
    { key: 'private:11', method: 'POST', endpoint: '/api/memory/long/forget', body: { id: 'x' } },
    { key: 'private:11', method: 'POST', endpoint: '/api/memory/long/summarize' },
  ]) {
    const ctx = context(opts); await route(ctx); assert.equal(ctx.response.status, 403);
  }
});
test('actual read route filters private memory and hides embedding fields', { skip: !root }, async () => {
  const ctx = context();
  ctx.longMemory = remember([], { key: 'private:11', text: '私聊喜欢篮球', source: 'agent' }).records;
  ctx.longMemory = remember(ctx.longMemory, { key: 'group:1', text: '群友喜欢篮球', source: 'agent', embedding: [1, 0], embeddingModel: 'test' }).records;
  await route(ctx);
  assert.equal(ctx.response.body.entries.length, 1);
  assert.equal(ctx.response.body.total, 1);
  assert.equal(ctx.response.body.entries[0].embedding, undefined);
});
test('actual update and forget routes preserve scope and reset future context', { skip: !root }, async () => {
  const ctx = context({ method: 'POST', body: { text: '小张喜欢篮球', subjectId: '11', sourceMessageIds: ['e1'] } });
  await route(ctx);
  const id = ctx.response.body.entry.id;
  assert.deepEqual(ctx.response.body.entry.sourceMessageIds, ['e1']);
  ctx.url = new URL('http://localhost/api/memory/long/forget');
  ctx.readBody = async () => ({ key: 'group:1', id });
  await route(ctx);
  assert.equal(ctx.response.body.removed, 1);
  assert.equal(ctx.longMemory.length, 0);
  assert.equal(ctx.state.sessions['group:1'], undefined);
  assert.equal(ctx.forgottenMemory.length, 1);
});
test('actual write route rejects fabricated subject without matching evidence', { skip: !root }, async () => {
  const ctx = context({ method: 'POST', body: { text: '小张喜欢篮球', subjectId: '22', sourceMessageIds: ['e1'] } });
  await route(ctx);
  assert.equal(ctx.response.status, 400);
  assert.equal(ctx.longMemory.length, 0);
});
test('isolation guards and asynchronous RAG are connected in actual bridge', { skip: !root }, () => {
  assert.match(source, /function sharedSessionEnabled\(\) \{\s+if \(cfg.longMemory.isolation !== false\) return false/);
  assert.match(source, /function buildHandoffDigest\(\) \{\s+if \(cfg.longMemory.isolation !== false\) return ''/);
  assert.match(source, /function buildCrossChatDigest\(currentKey\) \{\s+if \(cfg.longMemory.isolation !== false\) return ''/);
  assert.match(source, /const promptText = await buildWakePromptV2/);
  assert.match(source, /if \(revision !== memoryRevision\) return search/);
  assert.match(source, /if \(summaryRevision !== memoryRevision\) return/);
});
