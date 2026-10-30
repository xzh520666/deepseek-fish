#!/bin/bash
# sanitize-check.sh —— 上传前自检：扫一遍仓库里有没有泄露密钥/真实信息
# 用法：bash scripts/sanitize-check.sh
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

fail=0
check() {
  local desc="$1"; shift
  local pattern="$1"
  local hits
  hits=$(grep -rn --binary-files=without-match -E "$pattern" . \
    --exclude-dir=.git --exclude-dir=node_modules 2>/dev/null | grep -v 'sanitize-check.sh' | head -5)
  if [ -n "$hits" ]; then
    echo -e "\033[1;31m[FAIL]\033[0m $desc"
    echo "$hits" | sed 's/^/    /'
    fail=1
  else
    echo -e "\033[1;32m[ OK ]\033[0m $desc"
  fi
}

echo "扫描目录: $DIR"
echo
check "没有 DeepSeek API Key"        'sk-[A-Za-z0-9]{20,}'
check "没有 SnowLuma token"          '[A-Za-z0-9_-]{40,}'
check "没有真实 IPv4"                 '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b'
check "没有真实 QQ 号（10位数字）"     '\b[1-9][0-9]{8,10}\b'
check "没有本地绝对路径"              'D:\\\\?30675|/root/\.dsh/\.credentials'
check "没有私钥文件"                  'BEGIN (OPENSSH|RSA|EC) PRIVATE KEY'
check "没有 .credentials.yaml"        'DEEPSEEK_API_KEY: *sk'
check "没有聊天记录/状态文件"          '"recentMessages"|"agentToken"|"console-token"'

echo
echo "--- 目录里不该存在的文件 ---"
for f in config.json .credentials.yaml state node_modules edge-profile2; do
  if [ -e "$f" ]; then
    echo -e "\033[1;31m[FAIL]\033[0m 存在 $f"
    fail=1
  fi
done
[ "$fail" = "0" ] && echo -e "\033[1;32m[ OK ]\033[0m 没有敏感目录"

echo
if [ "$fail" = "0" ]; then
  echo -e "\033[1;32m全部通过，可以上传 ✅\033[0m"
else
  echo -e "\033[1;31m发现可疑内容，先处理再上传 ❌\033[0m"
fi
exit $fail
