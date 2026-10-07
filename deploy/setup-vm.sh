#!/usr/bin/env bash
# Sets up the Pursuits server and its SQLite database on an Ubuntu VM, for the "App Service in front, VM behind"
# deployment (see README). Safe to run again: later runs update the app and keep the database, key and settings.
#
#   sudo ./setup-vm.sh /path/to/pursuits.zip      # or a project folder; omit to rebuild what is in /opt/pursuits
#
# Optional settings (put them before the command, e.g. sudo ALLOW_FROM=10.17.140.0/24 ./setup-vm.sh pursuits.zip):
#   ALLOW_FROM   CIDR of the App Service VNet-integration subnet: the only network allowed to reach the port
#   IMPORT_DB    an existing pursuits.db to start from, instead of building a new one from the CSVs
#   FORCE_IMPORT 1 = replace a database that already exists with IMPORT_DB (the old one is backed up first)
#   GATEWAY_KEY  use this key instead of generating one (it must match the App Service setting)
#   PORT         default 4100
#   APP_DIR      default /opt/pursuits        (the code)
#   DATA_DIR     default /var/lib/pursuits    (the database — never touched by updates)
#   BACKUP_DIR   default /var/backups/pursuits
set -euo pipefail

APP_SRC="${1:-}"
SELF="$(realpath "$0")"   # before any cd, for the closing hint
PORT="${PORT:-4100}"
APP_DIR="${APP_DIR:-/opt/pursuits}"
DATA_DIR="${DATA_DIR:-/var/lib/pursuits}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pursuits}"
APP_USER=pursuits
ENV_DIR=/etc/pursuits
ENV_FILE="$ENV_DIR/pursuits.env"
DB="$DATA_DIR/pursuits.db"
SERVICE=pursuits

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok() { printf '    \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run with sudo: sudo $0 ${APP_SRC:-<pursuits.zip>}"
command -v apt-get >/dev/null || fail "This script is for Ubuntu/Debian (apt-get not found)."
[[ "$PORT" =~ ^[0-9]+$ ]] || fail "PORT must be a number (got '$PORT')."
if [[ -n "${ALLOW_FROM:-}" && ! "$ALLOW_FROM" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$ ]]; then
  fail "ALLOW_FROM must be a subnet like 10.17.140.0/24 (got '$ALLOW_FROM')."
fi
if [[ -n "${IMPORT_DB:-}" && ! -f "$IMPORT_DB" ]]; then fail "IMPORT_DB file not found: $IMPORT_DB"; fi

# ---------------------------------------------------------------------------------------------------------------
step "1/9  System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates unzip sqlite3 openssl rsync >/dev/null
ok "curl, unzip, sqlite3, openssl, rsync"

step "2/9  Node.js 24 (the database uses Node's built-in SQLite)"
node_major() { command -v node >/dev/null && node -p 'process.versions.node.split(".")[0]' || echo 0; }
if (( $(node_major) < 24 )); then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
(( $(node_major) >= 24 )) || fail "Node.js 24 or newer is required; found $(node --version 2>/dev/null || echo none)."
ok "node $(node --version), npm $(npm --version)"

step "3/9  Service account and folders"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR" "$BACKUP_DIR"
ok "user '$APP_USER'; code in $APP_DIR, database in $DATA_DIR, backups in $BACKUP_DIR"

# ---------------------------------------------------------------------------------------------------------------
step "4/9  Application code"
if [[ -n "$APP_SRC" ]]; then
  SRC="$APP_SRC"
  if [[ -f "$APP_SRC" ]]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
    unzip -q "$APP_SRC" -d "$TMP"
    # Accept a zip with package.json at the top, or inside one folder (e.g. a GitHub "Download ZIP").
    SRC="$TMP"
    [[ -f "$SRC/package.json" ]] || SRC="$(dirname "$(find "$TMP" -maxdepth 2 -name package.json | head -n1)")"
  fi
  [[ -f "$SRC/package.json" && -f "$SRC/server/index.ts" ]] || fail "No Pursuits project found in $APP_SRC (package.json and server/index.ts expected)."
  # Copy the code; never copy over node_modules, the build output, git data or any database file.
  rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude 'data/*.db*' --exclude 'data/runtime' "$SRC/" "$APP_DIR/"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  ok "copied from $APP_SRC"
else
  [[ -f "$APP_DIR/package.json" ]] || fail "No code in $APP_DIR yet. Pass the project zip: sudo $0 pursuits.zip"
  ok "using the code already in $APP_DIR"
fi

step "5/9  Install, build and test"
as_app() { sudo -u "$APP_USER" env HOME="$APP_DIR" npm_config_update_notifier=false "$@"; }
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then as_app npm ci --no-audit --no-fund >/dev/null; else as_app npm install --no-audit --no-fund >/dev/null; fi
as_app npm run build >/dev/null
as_app npm test >/tmp/pursuits-test.log 2>&1 || { tail -n 30 /tmp/pursuits-test.log; fail "Tests failed — see above. Nothing was started."; }
ok "built; $(grep -Eo 'pass [0-9]+' /tmp/pursuits-test.log | tail -n1) tests"

# ---------------------------------------------------------------------------------------------------------------
step "6/9  Settings and gateway key"
install -d -m 750 -o root -g "$APP_USER" "$ENV_DIR"
existing_key=""
[[ -f "$ENV_FILE" ]] && existing_key="$(sed -n 's/^GATEWAY_KEY=//p' "$ENV_FILE")"
KEY="${GATEWAY_KEY:-${existing_key:-$(openssl rand -hex 32)}}"
cat >"$ENV_FILE" <<EOF
# Pursuits server settings. Change, then: sudo systemctl restart $SERVICE
PORT=$PORT
PURSUITS_DB=$DB
# Must equal GATEWAY_KEY on the App Service; requests without it are refused.
GATEWAY_KEY=$KEY
# Requests arrive through the App Service gateway: take the visitor's address from X-Forwarded-For.
TRUST_PROXY=1
EOF
chown root:"$APP_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"
ok "$ENV_FILE (readable only by root and $APP_USER)"

step "7/9  Database"
systemctl is-active --quiet "$SERVICE" && systemctl stop "$SERVICE"
if [[ -n "${IMPORT_DB:-}" ]]; then
  if [[ -f "$DB" && "${FORCE_IMPORT:-0}" != 1 ]]; then
    fail "A database already exists at $DB. To replace it with $IMPORT_DB run again with FORCE_IMPORT=1 (the current one is backed up first)."
  fi
  if [[ -f "$DB" ]]; then
    cp -p "$DB" "$BACKUP_DIR/pursuits-before-import-$(date +%F-%H%M%S).db"
    ok "backed up the current database"
  fi
  [[ "$(sqlite3 "$IMPORT_DB" 'PRAGMA integrity_check;')" == ok ]] || fail "$IMPORT_DB failed SQLite's integrity check."
  rm -f "$DB" "$DB-wal" "$DB-shm"
  sqlite3 "$IMPORT_DB" ".backup '$DB'"
  chown "$APP_USER:$APP_USER" "$DB"; chmod 640 "$DB"
  ok "imported $IMPORT_DB"
elif [[ -f "$DB" ]]; then
  ok "keeping the existing database ($(du -h "$DB" | cut -f1))"
else
  ok "none yet — the server creates it from the project's CSVs on first start"
fi

# ---------------------------------------------------------------------------------------------------------------
step "8/9  Service (starts on boot, restarts on failure)"
cat >"/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Pursuits server (API + SQLite database)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) node_modules/tsx/dist/cli.mjs server/start.ts
Restart=always
RestartSec=5
# Hardening: the server may write only to its database folder.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

printf '    waiting for the server'
code=000
for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "x-pursuits-gateway-key: $KEY" "http://127.0.0.1:$PORT/api/status" || true)"
  [[ "$code" == 200 ]] && break
  printf '.'; sleep 1
done
echo
[[ "$code" == 200 ]] || { journalctl -u "$SERVICE" -n 40 --no-pager; fail "The server did not come up (last status $code) — log above."; }
ok "answering on port $PORT"
nokey="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/status" || true)"
[[ "$nokey" == 401 ]] || fail "The server answered a request without the gateway key ($nokey) — check GATEWAY_KEY in $ENV_FILE."
ok "refuses requests without the gateway key"
counts="$(sqlite3 -readonly "$DB" "SELECT (SELECT COUNT(*) FROM opportunities) + (SELECT COUNT(*) FROM opportunities_added), (SELECT COUNT(*) FROM dim_employee), (SELECT COUNT(*) FROM dim_client), (SELECT COUNT(*) FROM dim_skill);")"
IFS='|' read -r n_opp n_emp n_cli n_skill <<<"$counts"
ok "database $DB: $n_opp opportunities, $n_emp employees, $n_cli clients, $n_skill skills"

step "9/9  Backups and firewall"
cat >/etc/cron.d/pursuits-backup <<EOF
# Nightly consistent copy of the Pursuits database at 02:00; copies older than 30 days are removed.
0 2 * * * $APP_USER sqlite3 $DB ".backup '$BACKUP_DIR/pursuits-\$(date +\%F).db'" && find $BACKUP_DIR -name 'pursuits-*.db' -mtime +30 -delete
EOF
chmod 644 /etc/cron.d/pursuits-backup
ok "nightly backup to $BACKUP_DIR (kept 30 days)"
if [[ -n "${ALLOW_FROM:-}" ]]; then
  if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
    ufw allow from "$ALLOW_FROM" to any port "$PORT" proto tcp >/dev/null
    ok "ufw: port $PORT open to $ALLOW_FROM only"
  else
    ok "ufw is not active; allow $ALLOW_FROM → port $PORT in the VM's network security group instead"
  fi
else
  ok "no ALLOW_FROM given: allow ONLY the App Service integration subnet → TCP $PORT in the VM's network security group"
fi

# ---------------------------------------------------------------------------------------------------------------
IP="$(hostname -I | awk '{print $1}')"
printf '\n\033[1;32mPursuits server is running.\033[0m Set these two App Service settings:\n\n'
printf '    API_UPSTREAM = http://%s:%s\n' "$IP" "$PORT"
printf '    GATEWAY_KEY  = %s\n\n' "$KEY"
printf 'Keep the key secret. Useful commands:\n'
printf '    sudo systemctl status %s          # is it running\n' "$SERVICE"
printf '    sudo journalctl -u %s -f          # live log\n' "$SERVICE"
printf '    sudo %s <new-pursuits.zip>        # update the app (database and key are kept)\n' "$SELF"
