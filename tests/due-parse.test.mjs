import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDue, reminderWindow } from '../mcp/due-parse.mjs';

// 固定一个已知的"今天"：2026-11-01 是周日
const NOW = new Date('2026-11-01T12:00:00').getTime();

test('parse absolute date', () => {
  const d = parseDue('11月9日', NOW);
  assert.ok(d);
  assert.equal(d.due, '2026-11-09');
  assert.equal(d.source, 'date');
});

test('parse weekday with prefix', () => {
  const d = parseDue('下周五', NOW);
  assert.ok(d);
  assert.equal(d.due, '2026-11-06'); // 11/01 周日，下周五 = 11/06
  assert.equal(d.source, 'week');
});

test('parse relative days', () => {
  const tomorrow = parseDue('明天下午三点', NOW);
  assert.ok(tomorrow);
  assert.equal(tomorrow.due, '2026-11-02');
  assert.equal(tomorrow.hasTime, true);
  assert.equal(new Date(tomorrow.dueAt).getHours(), 15);
});

test('parse N days later', () => {
  const d = parseDue('三天后', NOW);
  assert.ok(d);
  assert.equal(d.due, '2026-11-04');
});

test('returns null for non-time text', () => {
  assert.equal(parseDue('以后一起玩', NOW), null);
  assert.equal(parseDue('', NOW), null);
});

test('reminderWindow only fires in horizon and once', () => {
  const dueAt = NOW + 12 * 3600e3; // 12 小时后
  const fact = { task: true, dueAt, notifiedAt: 0 };
  assert.equal(reminderWindow(fact, NOW), true);
  const notified = { ...fact, notifiedAt: NOW };
  assert.equal(reminderWindow(notified, NOW), false); // 已提醒过
  const notTask = { task: false, dueAt, notifiedAt: 0 };
  assert.equal(reminderWindow(notTask, NOW), false);
});
