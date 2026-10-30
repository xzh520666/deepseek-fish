import test from 'node:test';
import assert from 'node:assert/strict';
import { scanDue, checkDuePrompt, weekdayOf } from '../mcp/proactive-memory.mjs';

const mem = (text, type = 'promise', extra = {}) => ({
  id: 'lm-' + Math.random().toString(36).slice(2, 8), text, type, status: 'active',
  expiresAt: null, ...extra,
});

test('weekdayOf returns correct weekday name', () => {
  // 2026-10-31 是周六
  assert.equal(weekdayOf(new Date('2026-10-31T00:00:00')), '周六');
  assert.equal(weekdayOf(new Date('2026-11-02T00:00:00')), '周一');
});

test('scanDue surfaces near-term and matching-weekday promises', () => {
  const now = new Date('2026-10-31T12:00:00'); // 周六
  const list = [
    mem('今晚开黑', 'promise'),
    mem('周六下午打篮球', 'promise'),
    mem('明天要上班', 'event'),
    mem('以后一起玩', 'promise'),
  ];
  const hit = scanDue(list, { now }).map(m => m.text);
  assert.deepEqual(hit.sort(), ['今晚开黑', '明天要上班', '周六下午打篮球'].sort());
});

test('scanDue surfaces event keywords regardless of date', () => {
  const now = new Date('2026-10-31T12:00:00');
  const list = [mem('张三下个月生日', 'event'), mem('普通闲聊内容', 'event')];
  const hit = scanDue(list, { now }).map(m => m.text);
  assert.deepEqual(hit, ['张三下个月生日']);
});

test('scanDue ignores non-promise/event and inactive memories', () => {
  const now = new Date('2026-10-31T12:00:00');
  const list = [
    mem('今晚开黑', 'pref'),                 // 类型不对
    mem('今晚开黑', 'promise', { status: 'superseded' }), // 非 active
  ];
  assert.equal(scanDue(list, { now }).length, 0);
});

test('scanDue surfaces soon-expiring memory', () => {
  const now = new Date('2026-10-31T12:00:00');
  const list = [
    mem('临时约定', 'promise', { expiresAt: now.getTime() + 3600 * 1000 }), // 1 小时后过期
    mem('远期约定', 'promise', { expiresAt: now.getTime() + 30 * 86400 * 1000 }), // 30 天后
  ];
  const hit = scanDue(list, { now }).map(m => m.text);
  assert.deepEqual(hit, ['临时约定']);
});

test('checkDuePrompt asks for JSON array of ids', () => {
  const p = checkDuePrompt([mem('今晚开黑'), mem('张三生日', 'event')]);
  assert.match(p, /只输出 JSON 数组/);
  assert.match(p, /今晚开黑/);
});
