#!/usr/bin/env bash
set -euo pipefail

machine="$(uname -m)"
if [[ "$machine" != "aarch64" && "$machine" != "arm64" ]]; then
  echo "TuyuServe 只允许安装在 Linux ARM64 主机" >&2
  exit 1
fi
if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 执行安装" >&2
  exit 1
fi

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install_root="/opt/tuyuserve"
next_root="/opt/tuyuserve.next"
rollback_root="/opt/tuyuserve.rollback"
failed_root="/opt/tuyuserve.failed"
data_root="/var/lib/tuyuserve"
postgres_data="$data_root/postgresql"
postgres_socket="/run/tuyuserve-postgresql"
environment_file="/etc/tuyuserve/env"
app_was_active=0
database_was_active=0
swap_complete=0

restore_services() {
  install -m 0644 "$install_root/system/tuyuserve-postgresql.service" \
    /etc/systemd/system/tuyuserve-postgresql.service
  install -m 0644 "$install_root/system/tuyuserve.service" \
    /etc/systemd/system/tuyuserve.service
  systemctl daemon-reload
}

recover_failed_install() {
  status="$?"
  trap - ERR
  set +e
  systemctl stop tuyuserve 2>/dev/null
  systemctl stop tuyuserve-postgresql 2>/dev/null
  if [[ "$swap_complete" -eq 1 && -d "$rollback_root" ]]; then
    rm -rf "$failed_root"
    mv "$install_root" "$failed_root"
    mv "$rollback_root" "$install_root"
    restore_services
    if [[ "$database_was_active" -eq 1 || "$app_was_active" -eq 1 ]]; then
      systemctl start tuyuserve-postgresql
    fi
    if [[ "$app_was_active" -eq 1 ]]; then systemctl start tuyuserve; fi
    echo "途遇服务端安装失败，已恢复上一版程序；数据和配置未覆盖" >&2
  else
    echo "途遇服务端安装失败；不存在可自动恢复的上一版程序" >&2
  fi
  exit "$status"
}

rollback() {
  if [[ ! -d "$rollback_root" ]]; then
    echo "不存在可回滚的上一版途遇服务端" >&2
    exit 1
  fi
  app_was_active=0
  database_was_active=0
  if systemctl is-active --quiet tuyuserve; then app_was_active=1; fi
  if systemctl is-active --quiet tuyuserve-postgresql; then database_was_active=1; fi
  systemctl stop tuyuserve 2>/dev/null || true
  systemctl stop tuyuserve-postgresql 2>/dev/null || true
  rm -rf "$failed_root"
  mv "$install_root" "$failed_root"
  mv "$rollback_root" "$install_root"
  restore_services
  if [[ "$database_was_active" -eq 1 || "$app_was_active" -eq 1 ]]; then
    systemctl start tuyuserve-postgresql
  fi
  if [[ "$app_was_active" -eq 1 ]] && ! systemctl start tuyuserve; then
    systemctl stop tuyuserve-postgresql 2>/dev/null || true
    mv "$install_root" "$rollback_root"
    mv "$failed_root" "$install_root"
    restore_services
    systemctl start tuyuserve-postgresql
    systemctl start tuyuserve
    echo "途遇服务端回滚启动失败，已恢复回滚前版本" >&2
    exit 1
  fi
  mv "$failed_root" "$rollback_root"
  echo "途遇服务端已回滚，PostgreSQL、对象数据和配置未改变"
}

if [[ "${1:-}" == "rollback" ]]; then
  rollback
  exit 0
fi
if [[ "$#" -ne 0 ]]; then
  echo "用法: install.sh [rollback]" >&2
  exit 1
fi

rm -rf "$next_root"
install -d -m 0755 "$next_root" /etc/tuyuserve
install -d -m 0750 "$data_root"
cp -a \
  "$source_dir/lib" \
  "$source_dir/node" \
  "$source_dir/postgresql" \
  "$source_dir/share" \
  "$source_dir/system" \
  "$next_root/"
install -m 0755 "$source_dir/install.sh" "$next_root/install.sh"
install -m 0755 "$source_dir/uninstall.sh" "$next_root/uninstall.sh"
if [[ ! -x "$next_root/node/bin/node" \
      || ! -x "$next_root/postgresql/bin/postgres" \
      || ! -x "$next_root/postgresql/bin/initdb" \
      || ! -x "$next_root/postgresql/bin/psql" \
      || ! -x "$next_root/postgresql/bin/pg_dump" \
      || ! -s "$next_root/share/schema.sql" \
      || ! -s "$next_root/share/postgresql.runtime.lock.json" \
      || ! -s "$next_root/share/licenses/PostgreSQL-COPYRIGHT" \
      || ! -s "$next_root/share/licenses/npm-packages.json" \
      || ! -s "$next_root/share/release.json" ]]; then
  rm -rf "$next_root"
  echo "途遇服务端安装包不完整" >&2
  exit 1
fi

if ! getent group tuyuserve >/dev/null 2>&1; then
  groupadd --system tuyuserve
fi
if ! id tuyuserve >/dev/null 2>&1; then
  useradd --system --gid tuyuserve --home-dir "$data_root" \
    --shell /usr/sbin/nologin tuyuserve
else
  usermod --append --groups tuyuserve tuyuserve
fi
if ! id tuyuserve-db >/dev/null 2>&1; then
  useradd --system --gid tuyuserve --home-dir "$postgres_data" \
    --shell /usr/sbin/nologin tuyuserve-db
else
  usermod --append --groups tuyuserve tuyuserve-db
fi
chown root:tuyuserve "$data_root"
chmod 0750 "$data_root"
install -d -m 0750 -o tuyuserve-db -g tuyuserve "$postgres_data"
install -d -m 0750 -o tuyuserve -g tuyuserve "$data_root/objects"

if [[ ! -f "$environment_file" ]]; then
  install -m 0640 -o root -g tuyuserve /dev/null "$environment_file"
  {
    echo 'TUYUSERVE_TLS_CERT=/etc/tuyuserve/tls.crt'
    echo 'TUYUSERVE_TLS_KEY=/etc/tuyuserve/tls.key'
    echo 'TUYUSERVE_PORT=8443'
  } >> "$environment_file"
fi
postgres_password="$(sed -n 's/^TUYUSERVE_POSTGRES_PASSWORD=//p' "$environment_file")"
if [[ -z "$postgres_password" ]]; then
  postgres_password="$(openssl rand -hex 32)"
  echo "TUYUSERVE_POSTGRES_PASSWORD=$postgres_password" >> "$environment_file"
fi
if [[ ! "$postgres_password" =~ ^[0-9a-f]{64}$ ]]; then
  echo "TUYUSERVE_POSTGRES_PASSWORD 必须是 64 位小写十六进制值" >&2
  exit 1
fi
chown root:tuyuserve "$environment_file"
chmod 0640 "$environment_file"

if systemctl is-active --quiet tuyuserve; then app_was_active=1; fi
if systemctl is-active --quiet tuyuserve-postgresql; then database_was_active=1; fi
trap recover_failed_install ERR
systemctl stop tuyuserve 2>/dev/null || true
systemctl stop tuyuserve-postgresql 2>/dev/null || true
rm -rf "$rollback_root"
if [[ -d "$install_root" ]]; then mv "$install_root" "$rollback_root"; fi
mv "$next_root" "$install_root"
swap_complete=1
restore_services

export LD_LIBRARY_PATH="$install_root/postgresql/lib"
if [[ ! -f "$postgres_data/PG_VERSION" ]]; then
  if [[ -n "$(find "$postgres_data" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "PostgreSQL 数据目录非空但缺少 PG_VERSION，拒绝覆盖" >&2
    false
  fi
  runuser -u tuyuserve-db -- env LD_LIBRARY_PATH="$LD_LIBRARY_PATH" \
    "$install_root/postgresql/bin/initdb" \
    --pgdata="$postgres_data" --username=postgres --encoding=UTF8 --no-locale \
    --auth-local=peer --auth-host=reject
  {
    echo "listen_addresses = ''"
    echo "port = 5432"
    echo "unix_socket_directories = '$postgres_socket'"
    echo 'unix_socket_permissions = 0770'
    echo "password_encryption = 'scram-sha-256'"
  } >> "$postgres_data/postgresql.conf"
  {
    echo 'local all postgres peer map=tuyuserve-admin'
    echo 'local tuyuserve tuyuserve_app scram-sha-256'
    echo 'local all all reject'
    echo 'host all all 0.0.0.0/0 reject'
    echo 'host all all ::/0 reject'
  } > "$postgres_data/pg_hba.conf"
  echo 'tuyuserve-admin tuyuserve-db postgres' > "$postgres_data/pg_ident.conf"
  chown tuyuserve-db:tuyuserve \
    "$postgres_data/postgresql.conf" "$postgres_data/pg_hba.conf" "$postgres_data/pg_ident.conf"
  chmod 0600 \
    "$postgres_data/postgresql.conf" "$postgres_data/pg_hba.conf" "$postgres_data/pg_ident.conf"
fi

systemctl start tuyuserve-postgresql
psql=(runuser -u tuyuserve-db -- env LD_LIBRARY_PATH="$LD_LIBRARY_PATH" \
  "$install_root/postgresql/bin/psql" \
  --host="$postgres_socket" --port=5432 --username=postgres --dbname=postgres \
  --no-password --set=ON_ERROR_STOP=1)
if [[ "$("${psql[@]}" --tuples-only --no-align \
  --command="SELECT 1 FROM pg_roles WHERE rolname = 'tuyuserve_app'")" != "1" ]]; then
  "${psql[@]}" --command='CREATE ROLE tuyuserve_app LOGIN'
fi
# 中文注释：密码只经标准输入送入 psql，不进入进程参数或日志。
printf "ALTER ROLE tuyuserve_app PASSWORD '%s';\n" "$postgres_password" | "${psql[@]}"
if [[ "$("${psql[@]}" --tuples-only --no-align \
  --command="SELECT 1 FROM pg_database WHERE datname = 'tuyuserve'")" != "1" ]]; then
  runuser -u tuyuserve-db -- env LD_LIBRARY_PATH="$LD_LIBRARY_PATH" \
    "$install_root/postgresql/bin/createdb" \
    --host="$postgres_socket" --port=5432 --username=postgres --owner=tuyuserve_app tuyuserve
fi

if [[ "$app_was_active" -eq 1 ]]; then
  if ! systemctl start tuyuserve; then
    systemctl stop tuyuserve-postgresql 2>/dev/null || true
    rm -rf "$failed_root"
    mv "$install_root" "$failed_root"
    if [[ -d "$rollback_root" ]]; then
      mv "$rollback_root" "$install_root"
      restore_services
      systemctl start tuyuserve-postgresql
      systemctl start tuyuserve
    fi
    echo "途遇服务端新版启动失败，已恢复上一版程序" >&2
    exit 1
  fi
elif [[ "$database_was_active" -eq 0 ]]; then
  systemctl stop tuyuserve-postgresql
fi

trap - ERR
echo "安装完成。首次部署放置 TLS 证书和私钥后执行: systemctl enable --now tuyuserve-postgresql tuyuserve"
echo "需要回滚程序时执行: /opt/tuyuserve/install.sh rollback"
