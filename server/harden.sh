#!/bin/bash
# harden.sh - 收尾：去掉手机工具白名单 + 稳定性加固
set -e

echo "===== 1) preset whitelist: remove mcp__phone__ ====="
F=/root/.dsh/.agent-presets/qq-chat-v2/qq-tool-restrict.mjs
cp "$F" "$F.bak.$(date +%s)"
python3 - <<'PY'
p = '/root/.dsh/.agent-presets/qq-chat-v2/qq-tool-restrict.mjs'
s = open(p, encoding='utf-8').read()
s2 = s.replace("  'mcp__phone__',\n", "")
open(p, 'w', encoding='utf-8').write(s2)
print('phone prefix removed' if s2 != s else 'no mcp__phone__ found')
PY
grep -n "SAFE_PREFIXES" -A8 "$F"

echo
echo "===== 2) swap -> 4G ====="
if ! swapon --show | grep -q swap2; then
  if [ ! -f /swap2.img ]; then
    fallocate -l 2G /swap2.img || dd if=/dev/zero of=/swap2.img bs=1M count=2048
    chmod 600 /swap2.img
    mkswap /swap2.img >/dev/null
  fi
  swapon /swap2.img
  grep -q '/swap2.img' /etc/fstab || echo '/swap2.img none swap sw 0 0' >> /etc/fstab
  echo "added /swap2.img"
else
  echo "swap2 already active"
fi
sysctl -w vm.swappiness=20 >/dev/null
grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=20' >> /etc/sysctl.conf
free -m | head -3

echo
echo "===== 3) SnowLuma container memory cap ====="
C=$(docker ps --format '{{.Names}}' | grep -i snowluma | head -1)
echo "container: $C"
if [ -n "$C" ]; then
  docker update --memory 900m --memory-swap 1600m "$C" >/dev/null && echo "capped at 900M"
fi

echo
echo "===== 4) dsh-web memory cap ====="
mkdir -p /etc/systemd/system/dsh-web.service.d
cat > /etc/systemd/system/dsh-web.service.d/memory.conf <<'EOF'
[Service]
MemoryHigh=620M
MemoryMax=820M
EOF
systemctl daemon-reload
echo "MemoryHigh=620M MemoryMax=820M written"

echo
echo "===== 5) nightly restart 04:10 ====="
cat > /etc/cron.d/qqbot-nightly <<'EOF'
10 4 * * * root /bin/systemctl restart dsh-web qq-bridge >> /var/log/qqbot-nightly.log 2>&1
EOF
chmod 644 /etc/cron.d/qqbot-nightly
echo "cron installed"

echo
echo "===== 6) restart services ====="
systemctl restart dsh-web
sleep 12
systemctl restart qq-bridge
sleep 10
systemctl is-active dsh-web qq-bridge
