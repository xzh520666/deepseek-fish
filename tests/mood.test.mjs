import test from 'node:test';
import assert from 'node:assert/strict';
import { energyOf, moodLabel, observe, activityFactor, moodPrompt, setEnergy, MOOD_DEFAULTS } from '../mcp/mood.mjs';

const NOW = new Date('2026-11-01T12:00:00').getTime();

test('energy decays back to neutral by half-life', () => {
  const state = { energy: 0.9, lastAt: NOW - 6 * 3600e3 }; // 6 小时前 energy=0.9
  // 6 小时 = 一个半衰期，偏离 (0.9-0.5)=0.4 减半 → 0.5 + 0.2 = 0.7
  assert.ok(Math.abs(energyOf(state, NOW) - 0.7) < 0.001);
});

test('moodLabel maps energy to label', () => {
  assert.equal(moodLabel(0.8), '开心');
  assert.equal(moodLabel(0.5), '平静');
  assert.equal(moodLabel(0.3), '疲惫');
});

test('observe shifts energy by positive/negative signals', () => {
  const state = { energy: 0.5, lastAt: NOW };
  const up = observe(state, [{ text: '太强了', isSelf: false }], { now: NOW });
  assert.ok(up.energy > 0.5);
  const down = observe(state, [{ text: '真菜', isSelf: false }], { now: NOW });
  assert.ok(down.energy < 0.5);
});

test('observe ignores self messages and clamps drift', () => {
  const state = { energy: 0.5, lastAt: NOW };
  const self = observe(state, [{ text: '真菜', isSelf: true }], { now: NOW });
  assert.equal(self.energy, 0.5);
  // 刷屏也不能一次漂移超过 maxDrift
  const spam = observe(state, Array.from({ length: 100 }, () => ({ text: '垃圾', isSelf: false })), { now: NOW });
  assert.ok(spam.energy >= 0.5 - MOOD_DEFAULTS.maxDrift);
});

test('activityFactor is 1 at neutral, >1 happy, <1 tired', () => {
  assert.equal(activityFactor({ energy: 0.5, lastAt: NOW }, NOW), 1);
  assert.ok(activityFactor({ energy: 0.9, lastAt: NOW }, NOW) > 1);
  assert.ok(activityFactor({ energy: 0.3, lastAt: NOW }, NOW) < 1);
});

test('moodPrompt injects only when far from neutral', () => {
  assert.equal(moodPrompt({ energy: 0.5, lastAt: NOW }, NOW), '');
  assert.match(moodPrompt({ energy: 0.9, lastAt: NOW }, NOW), /心情不错/);
  assert.match(moodPrompt({ energy: 0.3, lastAt: NOW }, NOW), /有点累/);
});

test('setEnergy manually overrides mood', () => {
  const s = setEnergy({}, 0.9, NOW);
  assert.equal(s.energy, 0.9);
  assert.equal(s.mood, '开心');
});
