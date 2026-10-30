// flip-collector.mjs —— 反翻车：从群消息里采集"被戳穿/AI味"的负反馈信号，落盘成翻车语料库。
// 接入：bridge 在收到每条群消息时调用 detectFlip(messages)，命中就 appendFlipLog 到 state/flip-log.jsonl。
// 定期分析：把语料聚类，反哺 role-dafeiyu.md（哪些话术最容易露馅）。
import fs from 'node:fs';
import path from 'node:path';

// 戳穿/翻车信号：群友质疑是 AI、说 AI 味重、戳穿等
const FLIP_PATTERNS = [
  /你是机器人/,
  /你是.?AI/,
  /机器人吧/,
  /AI.?味/,
  /是不是.?人工智能/,
  /太像.?AI/,
  /不像人|不像真人/,
  /AI.?写的|机器人写的/,
  /露馅/,
  /回答得?太?正经/,
  /你是不是.?假的/,
  /人工智能/,
];

// 从一批消息里挑出翻车信号（只留非本人发的、含戳穿关键词的）。
export function detectFlip(messages = []) {
  const flips = [];
  for (const m of messages) {
    if (m?.isSelf) continue;
    const text = String(m?.text ?? m?.plain ?? '').trim();
    if (!text) continue;
    if (FLIP_PATTERNS.some(re => re.test(text))) {
      flips.push({
        at: Date.now(),
        messageId: m.messageId ?? null,
        userId: m.userId ?? m.senderId ?? m.sender ?? null,
        text,
      });
    }
  }
  return flips;
}

// 追加到 JSONL 语料库。只 append，不截断（清理交给上层定期任务，类似 serve-shots 的 Clear-OldShots）。
export function appendFlipLog(dir, entries, { file = 'flip-log.jsonl' } = {}) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, file);
  const body = entries.map(e => JSON.stringify(e) + '\n').join('');
  fs.appendFileSync(fp, body);
  return entries.length;
}
