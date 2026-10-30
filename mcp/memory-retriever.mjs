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

export class MemoryRetriever {
  constructor({ embed, model = 'local', timeoutMs = 1500, cacheSize = 512, onError = () => {} } = {}) {
    this.embed = embed;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.cacheSize = cacheSize;
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
        if (!embedding) {
          embedding = await this.embed(record.text);
          if (generation === this.generation) this.cache.set(cacheKey, embedding);
          while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
        }
        entries.push({ ...record, embedding, embeddingModel: this.model });
      }
      // 忘记或更新发生在异步推理期间时，调用方还须用当前存储重新过滤结果。
      return search(entries, { ...options, queryVector, embeddingModel: this.model });
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
