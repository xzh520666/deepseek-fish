import test from 'node:test';
import assert from 'node:assert/strict';
import { EmotionPolicy } from '../persona/emotion-policy.mjs';

const msg = (text, time = 1000, sender = 'A') => ({ text, time, sender, messageId: `${sender}:${time}:${text}` });
test('explicit support choices and closing', () => {
  const p = new EmotionPolicy({ clock: () => 1000 });
  assert.equal(p.observe('private:1', [msg('我难过，别安慰，帮我想办法')]).strategy, 'solve');
  assert.equal(p.observe('private:1', [msg('别讲道理，听我说')]).strategy, 'listen');
  assert.equal(p.observe('private:1', [msg('我先去洗澡')]).strategy, 'close');
});
test('same message cannot repeatedly amplify tension', () => {
  const p = new EmotionPolicy({ clock: () => 1000 });
  const messages = [msg('我好委屈')];
  for (let i = 0; i < 20; i++) assert.equal(p.observe('group:1', messages).tension, 0.25);
});
test('speakers and conversations do not share emotional state', () => {
  const p = new EmotionPolicy({ clock: () => 1000 });
  p.observe('group:1', [msg('我好委屈')]);
  assert.equal(p.observe('group:1', [msg('今天天气不错', 1000, 'B')]).strategy, 'chat');
  assert.equal(p.observe('group:2', [msg('今天天气不错')]).strategy, 'chat');
});
test('elapsed time reduces tension, self messages are ignored', () => {
  let now = 1000;
  const p = new EmotionPolicy({ clock: () => now, halfLifeMs: 1000 });
  p.observe('private:1', [msg('我好委屈')]);
  now += 1000;
  assert.equal(p.observe('private:1', [msg('今天不错', now)]).tension, 0.125);
  assert.equal(p.observe('private:2', [{ ...msg('难过', now), isSelf: true }]), null);
});
test('old/future messages do not produce fresh mood hints', () => {
  const p = new EmotionPolicy({ clock: () => 2000000 });
  assert.equal(p.prompt('private:1', [msg('难过')]), '');
  assert.equal(p.prompt('private:1', [msg('难过', 3000000)]), '');
});
test('state is bounded and prompt labels uncertainty', () => {
  const p = new EmotionPolicy({ clock: () => 1000, maxScopes: 2 });
  for (const id of ['1', '2', '3']) p.observe(id, [msg('难过')]);
  assert.equal(p.scopes.size, 2);
  assert.match(p.prompt('3', [msg('难过')]), /弱提示/);
});
