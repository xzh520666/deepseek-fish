// proactive-memory.mjs —— 主动回忆：定时扫描 promise/event 类记忆，粗筛"可能到点"的约定/事件。
// 只做启发式粗筛（纯逻辑、可测试），精判交给便宜模型（见 checkDuePrompt）。
// 接入：bridge 定时任务（建议每小时）调用 scanDue，命中后用 checkDuePrompt 让模型精判，
// 精判通过的触发一次"主动回忆"唤醒（在群里主动问一句约定/祝福生日）。
// 注意：纯启发式判断中文时间表达不可靠，scanDue 只负责"粗筛缩小范围"，最终"到没到"由模型定。

// 明确近期词：表示"就是最近"，不是泛指
const NEAR_TERMS = ['今天', '今晚', '明天', '明晚', '后天'];
// 事件类关键词：不管哪天，都值得提醒关注
const EVENT_TERMS = ['生日', '纪念日', '周年'];

export function weekdayOf(date = new Date()) {
  return '周' + '日一二三四五六'[date.getDay()];
}

// 粗筛：返回"可能到点"的活跃 promise/event 记忆（不改变原数组）。
export function scanDue(memories, { now = new Date(), nearWindowMs = 6 * 3600 * 1000 } = {}) {
  if (!Array.isArray(memories)) return [];
  const nowMs = now.getTime();
  const today = weekdayOf(now);
  return memories.filter(m => {
    if (!m || m.status !== 'active') return false;
    if (m.type !== 'promise' && m.type !== 'event') return false;
    const text = String(m.text ?? '');
    // 1) 明确近期词（"今晚开黑"）
    if (NEAR_TERMS.some(t => text.includes(t))) return true;
    // 2) 提到"今天星期几"（约定就是今天）
    if (text.includes(today)) return true;
    // 3) 事件类关键词（生日/纪念日/周年）
    if (m.type === 'event' && EVENT_TERMS.some(t => text.includes(t))) return true;
    // 4) 快过期（expiresAt 在 nearWindowMs 内）
    if (m.expiresAt != null && Number(m.expiresAt) > nowMs && Number(m.expiresAt) - nowMs < nearWindowMs) return true;
    return false;
  });
}

// 生成"精判"提示词：让便宜模型从粗筛结果里挑出真正到点、值得主动想起的。
export function checkDuePrompt(dueMemories, { today } = {}) {
  const d = today || weekdayOf();
  const lines = (dueMemories ?? []).map((m, i) => `${i + 1}. [${m.type}] ${m.text}`).join('\n');
  return [
    `今天是 ${d}。下面是「可能到点」的约定/事件记忆，请判断哪些真的到了、值得主动在群里提一句：`,
    lines || '（无）',
    '',
    '只输出 JSON 数组，元素是值得主动想起的记忆 id。判断标准：',
    '- 约定/事件的时间确实就是今天或马上到，值得主动问一句/祝福',
    '- 过时的、不确定的、或只是泛指（如"以后一起玩"）不要',
    '- 没有就输出空数组 []',
  ].join('\n');
}
