import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeibo, parseZhihu, fetchHot } from '../mcp/hot-search.mjs';

test('parseWeibo extracts rank/title/hot/url', () => {
  const json = { data: { realtime: [
    { word: '某事件', num: 1234567, label_name: '爆' },
    { word: '', num: 1 },
  ] } };
  const items = parseWeibo(json);
  assert.equal(items.length, 1);
  assert.equal(items[0].rank, 1);
  assert.equal(items[0].title, '某事件');
  assert.equal(items[0].label, '爆');
  assert.match(items[0].url, /s\.weibo\.com/);
});

test('parseZhihu extracts title/hot', () => {
  const json = { data: [{ target: { title: '某问题', id: 123 }, detail_text: '1000 万热度' }] };
  const items = parseZhihu(json);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '某问题');
  assert.equal(items[0].hot, '1000 万热度');
  assert.match(items[0].url, /zhihu\.com\/question\/123/);
});

test('fetchHot uses injected fetchFn and slices limit', async () => {
  const fake = async (url, opts) => {
    assert.equal(url, 'https://weibo.com/ajax/side/hotSearch');
    return { ok: true, json: async () => ({ data: { realtime: [
      { word: 'a' }, { word: 'b' }, { word: 'c' },
    ] } }) };
  };
  const items = await fetchHot('weibo', 2, { fetchFn: fake });
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'a');
});

test('fetchHot rejects unknown source and non-ok response', async () => {
  await assert.rejects(() => fetchHot('unknown', 10, { fetchFn: async () => ({}) }));
  await assert.rejects(() => fetchHot('weibo', 10, { fetchFn: async () => ({ ok: false, status: 403 }) }));
});
