# 小肥鱼后台管理（web/）

可视化驾驶舱，管理远程服务器上的机器人。**独立管理服务** `server.mjs` 直接读写 state 文件，不依赖 bridge 的 3100 API（避免 CORS）。

## 部署（面向 owner）

```bash
cd <deepseek-fish 仓库目录>
# 默认 STATE_DIR=/opt/qq-bridge/state，端口 8081
STATE_DIR=/opt/qq-bridge/state node web/server.mjs --port 8081
```

浏览器打开 `http://<服务器IP>:8081` 即后台。

> 如需常驻，可配 systemd：
> ```ini
> [Service]
> ExecStart=/usr/bin/node /path/to/deepseek-fish/web/server.mjs --port 8081
> Environment=STATE_DIR=/opt/qq-bridge/state
> ```

## 管理服务提供的 API

| API | 说明 |
|---|---|
| `GET /api/memories?q=&limit=` | 列出记忆（含遗忘打分 retention/score） |
| `POST /api/memories/forget` | 作废（墓碑） |
| `POST /api/memories/reinstate` | 恢复作废 |
| `POST /api/memories/badhit` | 标记召回错 |
| `GET/POST /api/mood` | 读写 AI mood（energy + 标签） |
| `GET /api/status` | 服务自检（记忆数、state 目录） |

同源托管 `web/` 前端（`index.html` + 本地 `vue.global.prod.js`，不依赖 CDN）。

## 本地开发（非 owner）

本地没有真实 state 文件，起一个空目录测试：

```bash
mkdir -p /tmp/fish-state
STATE_DIR=/tmp/fish-state node web/server.mjs --port 8081
```

## ⚠️ 注意事项

1. **并发写**：管理服务和 bridge 都写 `long-memory-v2.json`。管理操作是低频的，风险可控；但不要在 bridge 高频写记忆的同时频繁手动改，可能覆盖。
2. **鉴权**：管理服务默认只监听 `127.0.0.1`，无鉴权。若要公网访问，用 nginx 反代 + 加鉴权（服务本身没做 token，是刻意的——内网工具）。
3. **记忆 schema**：服务用 `memory-store.mjs` 的 `migrate` 读记忆文件，兼容旧格式，首次读不会改写原文件。

## 三个中心进度

| 中心 | 状态 |
|---|---|
| 记忆中心 | ✅ 列表 + 遗忘打分可视化 + 作废（恢复/badHit 的按钮待接） |
| 配置中心 | ⬜ 占位（mood 仪表盘待接，人设/语气编辑待做） |
| 学习中心 | ⬜ 占位（通用学习任务框架待做） |

## 桌面封装（后置）

前端逻辑与 Tauri/Electron 共享，最后套壳打包 exe 即可。
