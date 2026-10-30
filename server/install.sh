#!/usr/bin/env bash
# install.sh —— 在 Ubuntu 22.04+ 服务器上部署「小肥鱼」QQ 机器人
# 用法：sudo bash server/install.sh
#
# 本脚本不会复制上游源码：它先拉取 qq-bridge v0.1.0，再打上本仓库的补丁。
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QQ_BRIDGE_DIR="${QQ_BRIDGE_DIR:-/opt/qq-bridge}"
DSH_PRESET_DIR="${DSH_PRESET_DIR:-/root/.dsh/.agent-presets/qq-chat-v2}"
PROFILE_PATCH="/root/.dsh/profiles/web/cordis.patch.yml"
DSH_VERSION="${DSH_VERSION:-0.1.1-rc.2}"
UPSTREAM_TAG="${UPSTREAM_TAG:-v0.1.0}"
UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/Derpyu520/qq-bridge}"

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()  { printf '  \033[1;32m[OK]\033[0m %s\n' "$*"; }
warn(){ printf '  \033[1;33m[!]\033[0m %s\n' "$*"; }
die() { printf '  \033[1;31m[X]\033[0m %s\n' "$*"; exit 1; }

say "0/9 环境检查"
command -v node >/dev/null || die "没装 Node.js 22：curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"
command -v docker >/dev/null || die "没装 Docker：curl -fsSL https://get.docker.com | sh"
command -v patch >/dev/null || { warn "缺 patch，正在安装"; apt-get install -y patch >/dev/null 2>&1 || die "装 patch 失败"; }
ok "node $(node -v) / docker 已就绪"

say "1/9 获取 qq-bridge 上游源码（$UPSTREAM_TAG）"
if [ -f "$QQ_BRIDGE_DIR/src/bridge.js" ]; then
  ok "$QQ_BRIDGE_DIR 已存在，跳过下载（如需重装请先移走）"
else
  mkdir -p "$(dirname "$QQ_BRIDGE_DIR")"
  if git clone --depth 1 --branch "$UPSTREAM_TAG" "$UPSTREAM_REPO" "$QQ_BRIDGE_DIR" 2>/dev/null; then
    ok "git clone 成功"
  else
    warn "git clone 失败（可能被墙），改用 codeload 下载"
    tmp="$(mktemp -d)"
    curl -sL -o "$tmp/up.zip" "https://codeload.github.com/Derpyu520/qq-bridge/zip/refs/tags/$UPSTREAM_TAG" \
      || die "下载上游失败，请手动放置源码到 $QQ_BRIDGE_DIR"
    (command -v unzip >/dev/null && unzip -q "$tmp/up.zip" -d "$tmp") \
      || python3 -c "import zipfile;zipfile.ZipFile('$tmp/up.zip').extractall('$tmp')"
    mv "$tmp"/qq-bridge-* "$QQ_BRIDGE_DIR"
    rm -rf "$tmp"
    ok "codeload 下载成功"
  fi
  ( cd "$QQ_BRIDGE_DIR" && npm i --no-audit --no-fund ) || warn "npm i 失败，请手动在 $QQ_BRIDGE_DIR 执行 npm i"
fi

say "2/9 应用本项目补丁"
cd "$QQ_BRIDGE_DIR"
for p in "$REPO_DIR"/patches/*.patch; do
  name="$(basename "$p")"
  if patch -p1 --forward --dry-run -i "$p" >/dev/null 2>&1; then
    patch -p1 --forward -i "$p" >/dev/null && ok "已应用 $name"
  else
    if patch -p1 --forward --dry-run -R -i "$p" >/dev/null 2>&1; then
      ok "$name 已应用过，跳过"
    else
      die "$name 无法应用（上游版本可能不符），停止安装，请检查 UPSTREAM_TAG"
    fi
  fi
done
node --check src/bridge.js && ok "语法检查通过"

cp "$REPO_DIR/persona/emotion-policy.mjs" "$QQ_BRIDGE_DIR/src/emotion-policy.mjs"
node --check "$QQ_BRIDGE_DIR/src/emotion-policy.mjs"
cp "$REPO_DIR/mcp/memory-store.mjs" "$QQ_BRIDGE_DIR/src/memory-store.mjs"
cp "$REPO_DIR/mcp/memory-retriever.mjs" "$QQ_BRIDGE_DIR/src/memory-retriever.mjs"
node --check "$QQ_BRIDGE_DIR/src/memory-store.mjs"
node --check "$QQ_BRIDGE_DIR/src/memory-retriever.mjs"

say "3/9 安装 DSH 并准备 profile"
command -v dsh >/dev/null || npm i -g "@deepseek-ai/dsh@$DSH_VERSION"
mkdir -p /root/.dsh/profiles/web
if [ ! -f "$PROFILE_PATCH" ]; then
  cp "$REPO_DIR/server/cordis.patch.yml" "$PROFILE_PATCH"
  ok "已写入 profile patch（记得把占位符换成真值）"
else
  warn "profile patch 已存在，未覆盖：$PROFILE_PATCH（自行比对 server/cordis.patch.yml）"
fi

say "4/9 部署 preset（人设 + 工具白名单）"
mkdir -p "$DSH_PRESET_DIR"
cp -v "$REPO_DIR/persona/agent.cordis.yml" "$DSH_PRESET_DIR/agent.cordis.yml"
cp -v "$REPO_DIR/persona/qq-tool-restrict.mjs" "$DSH_PRESET_DIR/qq-tool-restrict.mjs"
cat > "$DSH_PRESET_DIR/preset.yml" <<'YML'
id: qq-chat-v2
title: QQ 聊天（小肥鱼）
description: 二代仿真模式：QQ 群聊/私聊，长期记忆 / 日记 / 空间 / 游戏功课
YML
ok "preset 已部署"

say "5/9 部署人设卡"
mkdir -p "$QQ_BRIDGE_DIR/roles"
cp -v "$REPO_DIR/persona/role-dafeiyu.md" "$QQ_BRIDGE_DIR/roles/大肥鱼.md"
ok "人设卡就位（role 名「大肥鱼」）"

say "6/9 部署日记与热搜 MCP"
mkdir -p /opt/diary-mcp /opt/hot-search-mcp
cp -v "$REPO_DIR/mcp/diary-mcp.js" /opt/diary-mcp/diary-mcp.js
cp -v "$REPO_DIR/mcp/hot-search-mcp.js" /opt/hot-search-mcp/hot-search-mcp.js
cp -v "$REPO_DIR/mcp/hot-search.mjs" /opt/hot-search-mcp/hot-search.mjs
ok "日记与热搜 MCP 就位"

say "7/9 生成 config.json"
if [ -f "$QQ_BRIDGE_DIR/config.json" ]; then
  warn "config.json 已存在，未覆盖（请对照 config.example.json 补齐新字段）"
else
  cp -v "$REPO_DIR/config.example.json" "$QQ_BRIDGE_DIR/config.json"
  warn "请编辑 $QQ_BRIDGE_DIR/config.json：SnowLuma token / ownerQQ / 白名单"
fi

say "8/9 安装 systemd 服务"
cp -v "$REPO_DIR/server/dsh-web.service" /etc/systemd/system/dsh-web.service
cp -v "$REPO_DIR/server/qq-bridge.service" /etc/systemd/system/qq-bridge.service
systemctl daemon-reload
systemctl enable --now dsh-web qq-bridge
sleep 3
systemctl --no-pager --lines=0 status dsh-web qq-bridge || true

say "9/9 完成"
cat <<'EOF'

=================== 还需要你手动做的 ===================
1) 起 SnowLuma（自行获取镜像、亲自接受 EULA，本项目不包含）：
   docker run -d --name snowluma --restart unless-stopped \
     -p 3000:3000 -p 3001:3001 -p 5099:5099 -p 6081:6081 \
     -e SNOWLUMA_ACCEPT_EULA=1 -e SNOWLUMA_ACCEPT_PRIVACY=1 \
     -e SNOWLUMA_HOOK_AUTOLOAD=1 \
     -v qq-gateway-data:/app/data/config \
     -v qq-client-config:/app/data/QQ \
     <你的 SnowLuma 镜像>

2) 开 QQ 小号，在 noVNC（6081）扫码登录

3) 编辑 /opt/qq-bridge/config.json：
     snowluma.accessToken / ownerQQ / allow.private / allow.groups

4) 填 DeepSeek Key：
     mkdir -p /root/.dsh
     cat > /root/.dsh/.credentials.yaml <<'YML'
     version: 1
     refs:
       DEEPSEEK_API_KEY: sk-你的key
     YML

5) 重启并体检：
     systemctl restart dsh-web qq-bridge
     bash server/health.sh

6) （可选）电脑侧手机能力：见 desktop/README.md
========================================================
EOF
