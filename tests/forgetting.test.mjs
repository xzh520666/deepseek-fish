import test from 'node:test';
import assert from 'node:assert/strict';
import { retentionOf, scoreOf, applyMention, applyNegative, tierAfter, stabilityOf, DAY } from '../mcp/forgetting.mjs';

const NOW = new Date('2026-11-01T12:00:00').getTime();

test('hard facts never decay (retention = 1)', () => {
  const fact = { tier: 'hard', lastAt: NOW - 365 * DAY };
  assert.equal(retentionOf(fact, NOW), 1);
  assert.equal(stabilityOf(fact, NOW), Infinity);
});

test('general facts decay with half-life', () => {
  const fact = { tier: 'general', lastAt: NOW - 3 * DAY }; // 3 天 = 一个半衰期
  assert.ok(Math.abs(retentionOf(fact, NOW) - 0.5) < 1e-9);
});

test('score = 100 × I × R', () => {
  const fact = { tier: 'general', I: 0.8, lastAt: NOW - 3 * DAY };
  assert.equal(scoreOf(fact, NOW), Math.round(100 * 0.8 * 0.5));
});

test('applyMention strengthens stability (spacing effect)', () => {
  // 快忘了的事实（R<1）被再次提及时，稳定度 S 拉长（间隔效应）
  const fact = { tier: 'general', I: 0.8, lastAt: NOW - 3 * DAY, hits: 0 };
  const after = applyMention(fact, NOW);
  assert.equal(after.hits, 1);
  assert.ok(after.s > 3);
});

test('applyNegative penalizes importance and marks suspect', () => {
  const fact = { tier: 'general', I: 1, lastAt: NOW };
  const once = applyNegative(fact, NOW);
  assert.equal(once.negatives, 1);
  assert.ok(once.I < 1);
  assert.equal(once.suspect, false);
  const twice = applyNegative(once, NOW);
  assert.equal(twice.suspect, true); // 2 次标 suspect
});

test('tierAfter promotes/demotes by score and hits', () => {
  const promoted = { tier: 'general', I: 1, hits: 3, lastAt: NOW };
  assert.equal(tierAfter(promoted, NOW), 'long'); // hits>=3 且 score>=55 → long
  const demoted = { tier: 'general', I: 0.1, lastAt: NOW };
  assert.equal(tierAfter(demoted, NOW), 'temp'); // 分数低 → temp
});
