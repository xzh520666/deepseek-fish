# 补丁说明

这三个文件是对 [qq-bridge v0.1.0](https://github.com/Derpyu520/qq-bridge) 的**修改**（unified diff）。
本仓库**不包含上游源码**，安装时由 `server/install.sh` 自动拉取上游再打补丁。

应用方式：

```bash
cd /opt/qq-bridge
for p in /path/to/dafeiyu-fish/patches/*.patch; do patch -p1 --forward -i "$p"; done
```

| 补丁 | 改动量 | 内容 |
|---|---|---|
| `0001-bridge-小肥鱼核心能力.patch` | +1453 / -18 | 角色卡注入（轻重交替）、跨会话时间线、长期记忆库、交接摘要与自动换线、被动模式与频率闸门、深夜省电、游戏功课、成本日报、日记定时、表情随机发送、400 自愈、学习会话降配与轮换 |
| `0002-mcp-snowluma-safe-空间与发图工具.patch` | +292 / -0 | 新增 `qq_qzone_*`（看动态/点赞/评论/发说说）、`qq_send_image`（把截图发到 QQ）、`qq_memory_remember/recall`（长期记忆读写） |
| `0003-sticker-lib-表情随机化.patch` | +12 / -1 | 表情列表加权随机排序，避免 AI 永远只发前几张 |

## 验证过的组合

- 上游 tag：`v0.1.0`
- 应用三个补丁后，与作者线上运行的文件**逐字节一致**
- `node --check` 全部通过

## 上游更新后怎么跟随

1. 拉新的上游 tag，把原文件复制一份；
2. 用 GitHub Desktop 或 `git apply --reject` 尝试打补丁；
3. 冲突通常集中在 `bridge.js` 的 `sendStickerV2` / `buildWakePromptV2` / `ensureSession` 附近；
4. 解决后重新生成补丁：
   ```bash
   python3 scripts/gen-patches.py <上游目录> <你的工作目录> patches/
   ```
