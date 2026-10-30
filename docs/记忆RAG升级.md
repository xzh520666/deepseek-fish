# 小肥鱼记忆升级 v2

保留原版 `persona/role-dafeiyu.md` 和 `persona/agent.cordis.yml`，不改变说话规则。

## 已实现

- 相关性先过门槛，重要度/时效只给相关候选小幅加分，无命中时不硬塞无关记忆。
- 会话隔离：先按 group/private 会话过滤，再进行关键词或本地向量检索。
- 人物可用真实 QQ ID 标识，写入时校验当前消息证据；不凭昵称推测身份。
- 记忆纠正：用 `replacesId` 明确替换同会话、同人物、同类型的事实，旧版本不再检索。
- 约定可设置 `expiresAt`（Unix 毫秒时间戳），过期不检索；不自动猜截止日期。
- 去重按会话、人物、类型和规范化正文进行，不再因重复提炼就不断提高重要度。
- 删除清理对应版本链和向量缓存，记录来源消息的遗忘标记，阻止自动摘要重新学回。
- 删除/纠正后，下一轮启用新 DSH 会话；不能撤回已经发出的回复或正在进行的回复。
- 存储满时拒绝新写入，不再静默淘汰旧记忆。默认容量 5000，可配置。
- 摘要使用临时独立学习会话，避免复用黑话研究上下文造成跨群信息污染。

## 原记忆迁移与回滚

首次读取 `state/long-memory.json`，保留原文件不动；第一次新写入时保存
`state/long-memory-v2.json`，以后只读写 v2。文件损坏时启动报错，不用空数组覆盖。
旧记录有合法 key 就归属该会话；无来源记录隔离，只有 `game-study` 非用户游戏知识可全局使用。
未带人物 ID 的旧记忆不会自动猜人，可先在原会话检索，再用新证据纠正。

回滚应停止服务，备份 v2 文件与 `memory-forgotten.json`，再恢复旧程序和旧配置。
原 v1 文件仍包含历史数据：它是回滚备份，不会随在线“忘记”物理删除。
完整擦除还需管理员处理备份、聊天日志和 DSH 旧会话；本次不自动删除这些文件。

## 隔离也覆盖模型上下文

`longMemory.isolation` 默认 true：强制不同 QQ 会话使用独立 DSH session，
忽略旧的 `sharedSession.enabled=true`，停止注入跨会话时间线和全局交接摘要。
升级前的混合 session 不再复用，旧 DSH 历史仍保留在服务端。
此模式保证本次记忆检索不跨群/私聊，不代表整个机器人所有模块都经过隐私审计：
原有黑话、游戏学习、日志与第三方 QQ/DSH 服务仍需分别管理。

## 可选本地语义向量

默认关闭 embedding，基础检索、隔离、更新立即生效。开启后采用本地
Transformers.js feature-extraction（mean pooling + normalize），与关键词检索混合排序。
缓存只存在进程内，按记忆ID/正文/模型区分，删除或更新时清空。
模型首次加载或推理超时会回退关键词；低配机器首次建缓存可能较慢。
此实现是小规模内存向量扫描，不是大规模向量数据库，不承诺固定召回提升百分比。

先在 `/opt/qq-bridge` 安装可选依赖并锁定版本：

```bash
npm install --save-exact @huggingface/transformers
```

另行准备与 Transformers.js 兼容、支持中文的本地 ONNX embedding 模型目录，
包括 tokenizer、config、onnx 权重。模型许可证、磁盘和内存需求应在部署前确认。
程序本身禁止远端模型下载，也不调用远端 embedding API。配置示例：

```json
{
  "longMemory": {
    "enabled": true,
    "isolation": true,
    "maxLines": 6,
    "maxRecords": 5000,
    "embedding": {
      "enabled": true,
      "modelPath": "/opt/models/your-local-embedding-model",
      "dtype": "q8",
      "timeoutMs": 1500
    }
  }
}
```

不同模型的余弦分数分布不同，当前语义阈值为 0.7；上线前用实际中文问题评测。
本次测试使用可控向量验证检索与降级行为，未下载真实权重或验证真实模型效果。
本地模型加载设置依据官方文档：
https://github.com/huggingface/transformers.js/blob/main/README.md

## 安装与验证

上游代码未在本仓库再分发。新部署由 `server/install.sh` 拉取 qq-bridge v0.1.0，
依次应用四个补丁并复制自研模块；任一补丁冲突将停止安装。
已有部署应在独立目录用干净 v0.1.0 重建并测试，备份 config/state 后停服切换，
不要直接覆盖正在运行的实例，也不要把示例配置覆盖到真实凭据配置。
安装脚本不会替已有 config.json 自动补齐字段；本次补丁的 isolation 默认 true。

```bash
node --test tests/*.test.mjs
BRIDGE_TEST_ROOT=/opt/qq-bridge node --test tests/*.test.mjs
```

第二条额外运行实际桥接路由与持久化集成测试；未设置路径时集成测试明确跳过。
测试不连接 QQ、不发送消息、不调用外部模型。
尚未在真实 QQ/DSH 实例部署，不应把本地测试结果视为线上效果验证。
