import path from 'node:path';
import fs from 'node:fs';
import { search, visible, validVector } from './memory-store.mjs';

// 可选本地推理；模型文件必须预先准备好，永不下载、不调用远端 embedding API。
export function localEncoder(config = {}, load = () => import('@huggingface/transformers')) {
  let ready;
  return async text => {
    if (!ready) ready = (async () => {
      if (!path.isAbsolute(config.modelPath ?? '') || !fs.existsSync(config.modelPath)) throw new Error('本地 embedding 模型目录不存在');
      const { env, pipeline } = await load();
      env.allowRemoteModels = false;
      env.localModelPath = path.dirname(config.modelPath) + path.sep;
      const model = await pipeline('feature-extraction', path.basename(config.modelPath), {
        local_files_only: true, device: 'cpu', dtype: config.dtype ?? 'q8',
      });
      return model;
    })();
    const model = await ready;
    const result = await model(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(result.data);
    if (!validVector(vector)) throw new Error('embedding 返回无效向量');
    return vector;
  };
}

// 远端 embedding：通过 http 调用电脑端 embed-server（经反向隧道暴露到服务器 127.0.0.1），
// 服务器不再本地加载模型。契约同 localEncoder：text -> number[]。
export function httpEncoder(config = {}) {
  const base = String(config.url ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('embedding.url 未配置');
  const timeoutMs = Math.max(100, Math.min(10000, Number(config.timeoutMs) || 1500));
  return async text => {
    const res = await fetch(`${base}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: String(text) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`embed 服务返回 ${res.status}`);
    const data = await res.json();
    if (!validVector(data.vector)) throw new Error('embed 返回无效向量');
    return data.vector;
  };
}

export class MemoryRetriever {
  constructor({ embed, model = 'local', timeoutMs = 1500, cacheSize = 512, minSemantic, onError = () => {} } = {}) {
    this.embed = embed;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.cacheSize = cacheSize;
    this.minSemantic = Number.isFinite(Number(minSemantic)) ? Math.max(0, Math.min(1, Number(minSemantic))) : 0.4;
    this.cache = new Map();
    this.busy = false;
    this.onError = onError;
  }

  clear() { this.cache.clear(); this.generation = (this.generation ?? 0) + 1; }

  async retrieve(records, options) {
    const fallback = () => search(records, options);
    if (!this.embed || !options.query?.trim() || this.busy) return fallback();
    this.busy = true;
    const generation = this.generation;
    const run = async () => {
      const queryVector = await this.embed(options.query);
      const entries = [];
      // 权限过滤发生在 embedding 之前，私聊内容也不会进入其他会话的向量计算。
      for (const record of records.filter(m => visible(m, options.key, options.now)
        && (!options.subjectId || m.subjectId === String(options.subjectId)))) {
        const cacheKey = JSON.stringify([record.id, record.text, this.model]);
        let embedding = this.cache.get(cacheKey);
        // 优先复用记录里已持久化的向量，重启/换进程后无需对同一批记忆重新编码。
        if (!embedding && record.embeddingModel === this.model && validVector(record.embedding)) {
          embedding = record.embedding;
        }
        if (!embedding) {
          embedding = await this.embed(record.text);
          if (generation === this.generation) this.cache.set(cacheKey, embedding);
          while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
        }
        entries.push({ ...record, embedding, embeddingModel: this.model });
      }
      // 忘记或更新发生在异步推理期间时，调用方还须用当前存储重新过滤结果。
      return search(entries, { ...options, queryVector, embeddingModel: this.model, minSemantic: this.minSemantic });
    };
    let timer;
    const pending = run().finally(() => { this.busy = false; });
    try {
      return await Promise.race([pending, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('本地向量检索超时，已回退关键词检索')), this.timeoutMs);
      })]);
    } catch (error) {
      this.onError(error.message);
      return fallback();
    } finally { clearTimeout(timer); }
  }
}
