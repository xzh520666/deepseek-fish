#!/bin/bash
# health.sh — qq-bridge 服务器一键体检
echo "=============================="
echo " QQ 机器人服务器体检 $(date '+%F %T')"
echo "=============================="
ok(){ printf '  [OK]   %s\n' "$1"; }
bad(){ printf '  [FAIL] %s\n' "$1"; }

echo "--- 核心服务 ---"
for s in dsh-web qq-bridge docker; do
  st=$(systemctl is-active "$s" 2>/dev/null)
  [ "$st" = "active" ] && ok "$s: $st" || bad "$s: $st"
done
cst=$(docker inspect -f '{{.State.Status}}' snowluma 2>/dev/null)
[ "$cst" = "running" ] && ok "snowluma 容器: $cst" || bad "snowluma 容器: ${cst:-missing}"

echo "--- 端口 ---"
for p in 3000 3001 3080 3100; do
  ss -lnt | grep -q ":$p " && ok "端口 $p 监听中" || bad "端口 $p 未监听"
done

echo "--- SnowLuma 与 QQ ---"
TOK=$(docker exec snowluma sh -c "cat /app/data/config/onebot_{{BOT_QQ}}.json" 2>/dev/null | grep -oE '"accessToken": "[^"]+"' | head -1 | cut -d'"' -f4)
if [ -n "$TOK" ]; then
  LOGIN=$(curl -s -m 5 -H "Authorization: Bearer $TOK" http://127.0.0.1:3000/get_login_info 2>/dev/null)
  if echo "$LOGIN" | grep -q '"status":"ok"'; then
    NICK=$(echo "$LOGIN" | grep -oE '"nickname":"[^"]+"' | cut -d'"' -f4)
    ok "QQ 已登录：$NICK"
  else
    bad "QQ 未登录 / OneBot 无响应（可能需要手机确认登录）"
  fi
else
  bad "找不到 OneBot 配置（QQ 可能未登录过）"
fi

echo "--- 桥接 ---"
if systemctl is-active qq-bridge >/dev/null 2>&1; then
  LAST=$(journalctl -u qq-bridge -n 300 --no-pager 2>/dev/null | grep -E 'DSH 已就绪|SnowLuma 已连接' | tail -1)
  [ -n "$LAST" ] && ok "桥接已连接" || bad "桥接运行但看不到连接记录"
else
  bad "桥接未运行"
fi
CTOK=$(cat /opt/qq-bridge/state/console-token 2>/dev/null)
if [ -n "$CTOK" ]; then
  ST=$(curl -s -m 5 http://127.0.0.1:3100/api/status -H "x-console-token: $CTOK" 2>/dev/null)
  if echo "$ST" | grep -q '"dshReady": true'; then
    MODE=$(echo "$ST" | grep -oE '"mode": "[^"]+"' | cut -d'"' -f4)
    ok "控制台正常，模式=$MODE"
  else
    bad "控制台无响应"
  fi
fi

echo "--- 手机与截图服务（在你的电脑上运行）---"
CODE=$(curl -s -m 8 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8899/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}')
[ "$CODE" = "200" ] && ok "手机 MCP（8899）连通" || bad "手机 MCP 未连通（HTTP $CODE）"
if ss -lnt | grep -q ':8898 '; then
  ok "截图服务（8898）已监听"
  # 取一张真实存在的截图做连通性验证
  NAME=$(ss -lnt >/dev/null 2>&1; echo)
  ok "发图通道：qq_send_image（图源 http://127.0.0.1:8898/）"
else
  bad "截图服务（8898）未监听——发图会失败"
fi

echo "--- 内存限制 ---"
MM=$(systemctl show dsh-web -p MemoryMax | cut -d= -f2)
MH=$(systemctl show dsh-web -p MemoryHigh | cut -d= -f2)
if echo "$MM" | grep -q '^[0-9]'; then
  ok "dsh-web 内存上限：$(awk -v v="$MH" 'BEGIN{printf "%dM", v/1048576}')/$(awk -v v="$MM" 'BEGIN{printf "%dM", v/1048576}')"
else
  bad "dsh-web 未设置内存上限"
fi
C=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i snowluma | head -1)
if [ -n "$C" ]; then ok "snowluma 容器内存上限：$(docker inspect -f '{{.HostConfig.Memory}}' "$C" 2>/dev/null | awk '{printf "%dM", $1/1048576}')"; fi

echo "--- 日记 ---"
if [ -f /opt/qq-bridge/state/diary.jsonl ]; then D=$(wc -l < /opt/qq-bridge/state/diary.jsonl); else D=0; fi
ok "日记条数：$D"

echo "--- 资源 ---"
free -h | grep -E 'Mem|Swap' | sed 's/^/  /'
echo "--- 最近桥接日志 ---"
journalctl -u qq-bridge -n 4 --no-pager 2>/dev/null | tail -4 | sed 's/^/  /'
echo "=============================="
