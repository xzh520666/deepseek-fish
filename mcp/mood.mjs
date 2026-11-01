// mood.mjs —— AI 自己的情绪状态：energy（精力 0~1）+ mood（情绪标签），随对话和时间漂移。
// 区别于 emotion-policy.mjs（算对方情绪），这个算 AI 自己，用于：
//   1) 影响被动模式活跃度（energy 高更爱说话，低更想潜水）
//   2) 注入 prompt（"有点累，少说点"）
//   3) 后台「情绪状态管理」仪表盘展示 / 调节
//
// 状态模型：energy 偏离中性 0.5 后按半衰期回中性（复用 forgetting 的半衰思路）。
// 纯函数，不读盘、不联网；持久化由调用方（bridge）负责写 state 文件。

export const MOOD_DEFAULTS = Object.freeze({
  halfLifeMs: 6 * 3600e3,   // energy 偏离中性后，6 小时回一半
  neutral: 0.5,             // 中性 energy
  step: 0.08,               // 每条信号漂移步长
  happyAbove: 0.7,          // > 0.7 开心
  tiredBelow: 0.4,          // < 0.4 疲惫
  maxDrift: 0.5,            // 单次 observe 最大漂移（防刷屏）
});

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// 正向信号：被夸、被 @、聊得开心、接住梗
const POSITIVE_RE = /厉害|牛逼|强|666|赞|哈哈|笑死|有意思|好玩|喜欢|爱你|谢谢|太强|可以|牛/;
// 负向信号：被怼、被阴阳、冷场、戳穿
const NEGATIVE_RE = /菜|垃圾|废|傻|滚|闭嘴|无语|服了|ai味|机器人|太假|别装|这都/;

/** energy 半衰回中性：返回当前实际 energy。 */
export function energyOf(state = {}, now = Date.now(), cfg = MOOD_DEFAULTS) {
  const lastAt = Number(state.lastAt) || now;
  const elapsed = Math.max(0, now - lastAt);
  const decay = Math.pow(0.5, elapsed / cfg.halfLifeMs);
  const base = clamp01(Number.isFinite(state.energy) ? state.energy : cfg.neutral);
  return cfg.neutral + (base - cfg.neutral) * decay;
}

/** energy → 情绪标签。 */
export function moodLabel(energy, cfg = MOOD_DEFAULTS) {
  if (energy > cfg.happyAbove) return '开心';
  if (energy < cfg.tiredBelow) return '疲惫';
  return '平静';
}

/** 观察一批群友消息，算漂移后的新状态（不改变原 state）。 */
export function observe(state = {}, messages = [], { now = Date.now(), cfg = MOOD_DEFAULTS } = {}) {
  const energy = energyOf(state, now, cfg);
  let delta = 0;
  for (const m of messages) {
    if (!m || m.isSelf) continue; // 只看群友的话，不看 AI 自己说的
    const text = String(m.text ?? m.plain ?? '');
    if (!text) continue;
    if (POSITIVE_RE.test(text)) delta += cfg.step;
    if (NEGATIVE_RE.test(text)) delta -= cfg.step;
  }
  delta = Math.max(-cfg.maxDrift, Math.min(cfg.maxDrift, delta));
  const next = clamp01(energy + delta);
  return { energy: next, mood: moodLabel(next, cfg), lastAt: now };
}

/** 影响被动模式：中性=1，开心>1 更活跃，疲惫<1 更沉默。 */
export function activityFactor(state = {}, now = Date.now(), cfg = MOOD_DEFAULTS) {
  return energyOf(state, now, cfg) / cfg.neutral;
}

/** 注入 prompt：偏离中性较多时给提示，中性返回空串。 */
export function moodPrompt(state = {}, now = Date.now(), cfg = MOOD_DEFAULTS) {
  const energy = energyOf(state, now, cfg);
  if (energy > cfg.happyAbove) return '【当前状态】心情不错，可以主动一点、多接梗。';
  if (energy < cfg.tiredBelow) return '【当前状态】有点累，少说点，想潜水就潜。';
  return '';
}

/** 手动调节（后台「情绪状态管理」用）：直接设 energy。 */
export function setEnergy(state = {}, energy, now = Date.now(), cfg = MOOD_DEFAULTS) {
  const e = clamp01(Number(energy));
  return { energy: e, mood: moodLabel(e, cfg), lastAt: now };
}
