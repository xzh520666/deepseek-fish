import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectFlip, appendFlipLog } from '../mcp/flip-collector.mjs';

test('detectFlip catches AI-skeptic signals', () => {
  const msgs = [
    { text: '你是机器人吧', sender: 'A' },
    { text: '怎么感觉AI味好重', sender: 'B' },
    { text: '今天天气不错', sender: 'C' },
  ];
  const flips = detectFlip(msgs);
  assert.equal(flips.length, 2);
  assert.equal(flips[0].text, '你是机器人吧');
  assert.equal(flips[1].userId, 'B');
});

test('detectFlip ignores self messages and empty text', () => {
  const msgs = [
    { text: '你是机器人吧', isSelf: true },  // 自己发的
    { text: '', sender: 'A' },               // 空
    { plain: null, sender: 'B' },            // 无文本
  ];
  assert.equal(detectFlip(msgs).length, 0);
});

test('appendFlipLog writes JSONL lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flip-'));
  const entries = [{ at: 1, text: '你是机器人吧' }, { at: 2, text: '太像AI了' }];
  assert.equal(appendFlipLog(dir, entries), 2);
  const fp = path.join(dir, 'flip-log.jsonl');
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).text, '你是机器人吧');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('appendFlipLog is a no-op for empty input', () => {
  assert.equal(appendFlipLog(os.tmpdir(), []), 0);
});
