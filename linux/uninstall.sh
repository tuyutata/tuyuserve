#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 执行卸载" >&2
  exit 1
fi
systemctl disable --now tuyuserve 2>/dev/null || true
systemctl disable --now tuyuserve-postgresql 2>/dev/null || true
rm -f /etc/systemd/system/tuyuserve.service \
  /etc/systemd/system/tuyuserve-postgresql.service
rm -rf /opt/tuyuserve /opt/tuyuserve.rollback /opt/tuyuserve.next /opt/tuyuserve.failed
systemctl daemon-reload
echo "程序与服务已卸载；PostgreSQL、对象数据和 /etc/tuyuserve 配置仍保留"
