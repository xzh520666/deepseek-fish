import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { migrate, remember, search, digest, validKey } from '../mcp/memory-store.mjs';
import { MemoryRetriever, localEncoder } from '../mcp/memory-retriever.mjs';

const root = process.env.BRIDGE_TEST_ROOT;
const source = root ? fs.readFileSync(path.join(root, 'src/bridge.js'), 'utf8') : '';
const block = source.slice(source.indexOf('  const LONG_MEMORY_FILE ='), source.indexOf('  // 让学习 agent 把一段聊天提炼'));
const initialize = root ? new Function('ctx', `with (ctx) { ${block}
 return { addLongMemory, retrieveLongMemory, commitLongMemory, get records() { return longMemory; } }; }`) : null;
const contexts = dir => ({
  fs, path, crypto, STATE_DIR: dir, cfg: { longMemory: { maxRecords: 5000 } },
  migrate, remember, search, digest, validKey, MemoryRetriever, localEncoder,
  log: () => {}, readJsonSafe: (p, fallback) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback,
  atomicWriteText: (p, text) => { fs.writeFileSync(p + '.tmp', text); fs.renameSync(p + '.tmp', p); },
});

test('actual bridge migrates v1 without modifying backup and persists v2 across restart', { skip: !root }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fish-memory-'));
  try {
    const old = JSON.stringify([{ id: 'old', text: '私聊喜欢篮球', key: 'private:11', type: 'pref', ts: Date.now() }]);
    fs.writeFileSync(path.join(dir, 'long-memory.json'), old);
    const store = initialize(contexts(dir));
    assert.equal((await store.retrieveLongMemory({ key: 'group:1', query: '篮球' })).length, 0);
    store.addLongMemory({ key: 'group:1', text: '群友喜欢篮球', source: 'agent' });
    assert.equal(fs.readFileSync(path.join(dir, 'long-memory.json'), 'utf8'), old);
    assert.equal(initialize(contexts(dir)).records.length, 2);
  } finally { for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); }
});
test('actual bridge does not silently replace corrupt v2 with empty memory', { skip: !root }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fish-memory-'));
  try {
    const file = path.join(dir, 'long-memory-v2.json'); fs.writeFileSync(file, '{bad');
    assert.throws(() => initialize(contexts(dir)));
    assert.equal(fs.readFileSync(file, 'utf8'), '{bad');
  } finally { fs.unlinkSync(path.join(dir, 'long-memory-v2.json')); fs.rmdirSync(dir); }
});
test('actual bridge suppresses automatic relearning from forgotten evidence', { skip: !root }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fish-memory-'));
  try {
    fs.writeFileSync(path.join(dir, 'memory-forgotten.json'), JSON.stringify([{ key: 'group:1', hash: 'unrelated', sourceMessageIds: ['e1'] }]));
    const store = initialize(contexts(dir));
    assert.equal(store.addLongMemory({ key: 'group:1', text: '被重新转述的旧事实', source: 'auto', sourceMessageIds: ['e1'] }), null);
    assert.equal(store.addLongMemory({ key: 'group:1', text: '没有证据的自动提炼', source: 'auto' }), null);
    assert.equal(store.records.length, 0);
  } finally { for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); }
});
