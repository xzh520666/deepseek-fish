#!/usr/bin/env node
// embedding-calibrate.mjs —— 用真实本地 embedding 模型，扫语义阈值，找最优 minSemantic。
// 用法：
//   EMBED_MODEL_PATH=/path/to/bge-small-zh-v1.5 node scripts/embedding-calibrate.mjs
// 输出：每组句对的 cosine，以及 0.30~0.90 阈值下相关句对的召回率/误召率/F1，最后推荐最优阈值。
import path from 'node:path';
import fs from 'node:fs';

const MODEL_PATH = process.env.EMBED_MODEL_PATH || '';
if (!path.isAbsolute(MODEL_PATH) || !fs.existsSync(MODEL_PATH)) {
  console.error('请设置 EMBED_MODEL_PATH 指向本地 ONNX 模型目录');
  process.exit(1);
}

const { env, pipeline } = await import('@huggingface/transformers');
env.allowRemoteModels = false;
env.localModelPath = path.dirname(MODEL_PATH) + path.sep;
const model = await pipeline('feature-extraction', path.basename(MODEL_PATH), {
  local_files_only: true,
  device: 'cpu',
  dtype: process.env.EMBED_DTYPE || 'q8',
});

async function embed(text) {
  const r = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(r.data);
}
function cosine(a, b) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return dot / Math.sqrt(aa * bb);
}

// query = 当前消息，memory = 记忆文本（第三人称）。label 1 = 相关（应召回），0 = 无关（不应召回）。
const PAIRS = [
  ['你玩英雄联盟吗', '张三主玩英雄联盟，周末常开黑', 1],
  ['今晚有没有人开黑', '约定周五晚上一起开黑', 1],
  ['LOL最近什么英雄强', '他主玩英雄联盟，擅长打野', 1],
  ['原神新版本出了吗', '他喜欢玩原神，天天上线', 1],
  ['你一般几点睡觉', '他作息规律，晚上十一点睡', 1],
  ['周末要不要去网吧', '他周末经常去网吧开黑', 1],
  ['云顶这版本什么阵容', '他喜欢玩云顶之弈，会玩九五', 1],
  ['考试复习得怎么样', '他最近在准备期末考试', 1],
  ['中午吃什么', '他喜欢点川菜外卖', 1],
  ['明天有事吗', '他明天约了朋友打球', 1],
  ['你玩英雄联盟吗', '今天天气不错适合出门散步', 0],
  ['你玩英雄联盟吗', '他养了一只橘猫很可爱', 0],
  ['今晚开黑不', '他最近在找工作面试', 0],
  ['原神新版本出了吗', '他昨天买了双新球鞋', 0],
  ['你几点睡觉', '他喜欢听周杰伦的歌', 0],
  ['云顶什么阵容', '他家最近在装修房子', 0],
  ['周末去网吧吗', '他最近在研究股票', 0],
  ['考试复习了吗', '他上个月去了趟三亚旅游', 0],
  ['中午吃什么', '他每天早上跑步五公里', 0],
  ['明天有事吗', '他家的猫刚生了小猫', 0],
];

console.log('=== 各句对 cosine ===');
const scored = [];
for (const [q, m, label] of PAIRS) {
  const vq = await embed(q);
  const vm = await embed(m);
  const c = cosine(vq, vm);
  scored.push({ q, m, label, c });
  console.log(`  [${label === 1 ? '相关' : '无关'}] ${c.toFixed(3)}  "${q}"  <=>  "${m}"`);
}

const pos = scored.filter(x => x.label === 1);
const neg = scored.filter(x => x.label === 0);

console.log('\n=== 阈值扫描 ===');
console.log(' 阈值    召回率  误召率   F1');
let best = { t: 0, f1: -1, recall: 0, fpr: 0 };
for (let t = 0.30; t <= 0.90; t += 0.05) {
  const tp = pos.filter(x => x.c >= t).length;
  const fp = neg.filter(x => x.c >= t).length;
  const recall = tp / pos.length;
  const fpr = fp / neg.length;
  const f1 = (2 * tp) / (2 * tp + fp + (pos.length - tp));
  console.log(` ${t.toFixed(2)}   ${(recall * 100).toFixed(0).padStart(3)}%    ${(fpr * 100).toFixed(0).padStart(3)}%    ${f1.toFixed(3)}`);
  if (f1 > best.f1) best = { t, f1, recall, fpr };
}

console.log('\n=== 推荐 ===');
console.log(`最优阈值（F1 最高）: minSemantic ≈ ${best.t.toFixed(2)}  （召回 ${(best.recall * 100).toFixed(0)}%，误召 ${(best.fpr * 100).toFixed(0)}%，F1=${best.f1.toFixed(3)}）`);
console.log('提示：这是基于 20 组人工句对的初测；正式上线前建议扩充到 100+ 组真实记忆/问题再定。');
