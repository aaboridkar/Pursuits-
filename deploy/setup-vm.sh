#!/usr/bin/env bash
# Sets up the Pursuits server on an Ubuntu VM. Its database is either Azure SQL (when AZURE_SQL_SERVER is given)
# or a SQLite file on the VM. Safe to run again: later runs update the app and keep the data, key and settings.
#
#   sudo ./setup-vm.sh /path/to/pursuits.zip      # or a project folder; omit to rebuild what is in /opt/pursuits
#
# Settings: put them before the command, e.g.
#   sudo AZURE_SQL_SERVER=myserver.database.windows.net AZURE_SQL_DATABASE=mydb AZURE_SQL_AUTH=sql \
#        AZURE_SQL_USER=pursuits_app AZURE_SQL_PASSWORD='…' ./setup-vm.sh pursuits.zip
# They are saved in /etc/pursuits/pursuits.env, so later runs don't need them again.
#
#   MODE           direct  (default) people open http://<vm>:PORT themselves
#                  gateway the VM only answers an App Service gateway carrying GATEWAY_KEY (see README)
#   AZURE_SQL_SERVER, AZURE_SQL_DATABASE, AZURE_SQL_SCHEMA (default AIT_SC_Gov),
#   AZURE_SQL_AUTH (entra | sql), AZURE_SQL_USER, AZURE_SQL_PASSWORD, AZURE_SQL_CLIENT_ID
#                  use Azure SQL; without AZURE_SQL_SERVER the database is a SQLite file in DATA_DIR
#   ALLOW_FROM     CIDR allowed to reach the port: your users' network (direct) or the App Service subnet (gateway)
#   IMPORT_DB      SQLite only: an existing pursuits.db to start from (FORCE_IMPORT=1 replaces one already there)
#   GATEWAY_KEY    gateway mode: use this key instead of generating one
#   PORT           default 4100
#   APP_DIR        default /opt/pursuits        (the code)
#   DATA_DIR       default /var/lib/pursuits    (the SQLite database — never touched by updates)
#   BACKUP_DIR     default /var/backups/pursuits
set -euo pipefail

APP_SRC="${1:-}"
SELF="$(realpath "$0")"   # before any cd, for the closing hint
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

# A value given on this run wins; otherwise keep what the previous run saved in the settings file.
saved() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1 | sed "s/^'\(.*\)'$/\1/" || true; }
# One KEY='value' line. Single quotes keep spaces, # and $ in passwords literal for both systemd and the app.
kv() { [[ "$2" != *"'"* && "$2" != *$'\n'* ]] || fail "$1 cannot contain a single quote or a line break."; echo "$1='$2'"; }
setting() { local v="${!1:-}"; [[ -n "$v" ]] && echo "$v" || saved "$1"; }

PORT="$(setting PORT)"; PORT="${PORT:-4100}"
MODE="$(setting MODE)"; MODE="${MODE:-direct}"
AZURE_SQL_SERVER="$(setting AZURE_SQL_SERVER)"
AZURE_SQL_DATABASE="$(setting AZURE_SQL_DATABASE)"
AZURE_SQL_SCHEMA="$(setting AZURE_SQL_SCHEMA)"; AZURE_SQL_SCHEMA="${AZURE_SQL_SCHEMA:-AIT_SC_Gov}"
AZURE_SQL_AUTH="$(setting AZURE_SQL_AUTH)"; AZURE_SQL_AUTH="${AZURE_SQL_AUTH:-entra}"
AZURE_SQL_USER="$(setting AZURE_SQL_USER)"
AZURE_SQL_PASSWORD="$(setting AZURE_SQL_PASSWORD)"
AZURE_SQL_CLIENT_ID="$(setting AZURE_SQL_CLIENT_ID)"
USE_AZURE=0; [[ -n "$AZURE_SQL_SERVER" ]] && USE_AZURE=1

[[ "$PORT" =~ ^[0-9]+$ ]] || fail "PORT must be a number (got '$PORT')."
[[ "$MODE" == direct || "$MODE" == gateway ]] || fail "MODE must be direct or gateway (got '$MODE')."
if [[ -n "${ALLOW_FROM:-}" && ! "$ALLOW_FROM" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$ ]]; then
  fail "ALLOW_FROM must be a subnet like 10.17.140.0/24 (got '$ALLOW_FROM')."
fi
if (( USE_AZURE )); then
  [[ -n "$AZURE_SQL_DATABASE" ]] || fail "AZURE_SQL_DATABASE is required with AZURE_SQL_SERVER."
  [[ "$AZURE_SQL_AUTH" == entra || "$AZURE_SQL_AUTH" == sql ]] || fail "AZURE_SQL_AUTH must be entra or sql."
  if [[ "$AZURE_SQL_AUTH" == sql && ( -z "$AZURE_SQL_USER" || -z "$AZURE_SQL_PASSWORD" ) ]]; then
    fail "AZURE_SQL_AUTH=sql needs AZURE_SQL_USER and AZURE_SQL_PASSWORD."
  fi
  [[ -z "${IMPORT_DB:-}" ]] || fail "IMPORT_DB is for SQLite. To load a pursuits.db into Azure SQL use: npm run db:copy-to-azure (README)."
fi
if [[ -n "${IMPORT_DB:-}" && ! -f "$IMPORT_DB" ]]; then fail "IMPORT_DB file not found: $IMPORT_DB"; fi

# ---------------------------------------------------------------------------------------------------------------
step "1/9  System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates unzip sqlite3 openssl rsync >/dev/null
ok "curl, unzip, sqlite3, openssl, rsync"

step "2/9  Node.js 24"
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
ok "user '$APP_USER'; code in $APP_DIR"

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
  # Copy the code; never node_modules, the build, git data, a database file or a local settings file.
  rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude '.env' \
    --exclude 'data/*.db*' --exclude 'data/runtime' "$SRC/" "$APP_DIR/"
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
step "6/9  Settings ($ENV_FILE)"
install -d -m 750 -o root -g "$APP_USER" "$ENV_DIR"
KEY=""
if [[ "$MODE" == gateway ]]; then KEY="$(setting GATEWAY_KEY)"; KEY="${KEY:-$(openssl rand -hex 32)}"; fi
{
  echo "# Pursuits server settings. Change, then: sudo systemctl restart $SERVICE"
  echo "MODE=$MODE"
  echo "PORT=$PORT"
  if (( USE_AZURE )); then
    kv AZURE_SQL_SERVER "$AZURE_SQL_SERVER"
    kv AZURE_SQL_DATABASE "$AZURE_SQL_DATABASE"
    kv AZURE_SQL_SCHEMA "$AZURE_SQL_SCHEMA"
    kv AZURE_SQL_AUTH "$AZURE_SQL_AUTH"
    if [[ -n "$AZURE_SQL_USER" ]]; then kv AZURE_SQL_USER "$AZURE_SQL_USER"; fi
    if [[ -n "$AZURE_SQL_PASSWORD" ]]; then kv AZURE_SQL_PASSWORD "$AZURE_SQL_PASSWORD"; fi
    if [[ -n "$AZURE_SQL_CLIENT_ID" ]]; then kv AZURE_SQL_CLIENT_ID "$AZURE_SQL_CLIENT_ID"; fi
  else
    echo "PURSUITS_DB=$DB"
  fi
  if [[ "$MODE" == gateway ]]; then
    echo "# Must equal GATEWAY_KEY on the App Service; requests without it are refused."
    echo "GATEWAY_KEY=$KEY"
    echo "TRUST_PROXY=1"
  else
    echo "TRUST_PROXY=0"
  fi
} >"$ENV_FILE"
chown root:"$APP_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"
ok "mode $MODE; database: $( (( USE_AZURE )) && echo "Azure SQL $AZURE_SQL_SERVER / $AZURE_SQL_DATABASE [$AZURE_SQL_SCHEMA], sign-in $AZURE_SQL_AUTH" || echo "SQLite $DB")"
ok "readable only by root and $APP_USER (it may hold a password)"

step "7/9  Database"
systemctl is-active --quiet "$SERVICE" && systemctl stop "$SERVICE"
if (( USE_AZURE )); then
  # Connects with the saved settings, checks the AIT_SC_Gov tables exist, lists their rows. Changes nothing.
  sudo -u "$APP_USER" env HOME="$APP_DIR" PURSUITS_CONFIG="$ENV_FILE" node node_modules/tsx/dist/cli.mjs scripts/db-check.ts \
    || fail "Azure SQL check failed — see the message above. Nothing was started."
elif [[ -n "${IMPORT_DB:-}" ]]; then
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
  ok "keeping the existing SQLite database ($(du -h "$DB" | cut -f1))"
else
  ok "SQLite: none yet — the server creates it from the project's CSVs on first start"
fi

# ---------------------------------------------------------------------------------------------------------------
step "8/9  Service (starts on boot, restarts on failure)"
cat >"/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Pursuits server
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
# Hardening: the server may write only to its data folder.
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

auth_header=(); [[ -n "$KEY" ]] && auth_header=(-H "x-pursuits-gateway-key: $KEY")
printf '    waiting for the server'
code=000
for _ in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${auth_header[@]}" "http://127.0.0.1:$PORT/api/status" || true)"
  [[ "$code" == 200 ]] && break
  printf '.'; sleep 1
done
echo
[[ "$code" == 200 ]] || { journalctl -u "$SERVICE" -n 40 --no-pager; fail "The server did not come up (last status $code) — log above."; }
ok "answering on port $PORT"
if [[ "$MODE" == gateway ]]; then
  nokey="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/status" || true)"
  [[ "$nokey" == 401 ]] || fail "The server answered a request without the gateway key ($nokey) — check GATEWAY_KEY in $ENV_FILE."
  ok "refuses requests without the gateway key"
fi
n_opp="$(curl -s "${auth_header[@]}" "http://127.0.0.1:$PORT/api/opportunities" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).length)}catch{console.log("?")}})')"
ok "the app reads $n_opp opportunities from its database"

step "9/9  Backups and firewall"
if (( USE_AZURE )); then
  ok "backups: Azure SQL takes automatic backups (point-in-time restore in the Azure portal)"
  rm -f /etc/cron.d/pursuits-backup
else
  cat >/etc/cron.d/pursuits-backup <<EOF
# Nightly consistent copy of the Pursuits database at 02:00; copies older than 30 days are removed.
0 2 * * * $APP_USER sqlite3 $DB ".backup '$BACKUP_DIR/pursuits-\$(date +\%F).db'" && find $BACKUP_DIR -name 'pursuits-*.db' -mtime +30 -delete
EOF
  chmod 644 /etc/cron.d/pursuits-backup
  ok "nightly SQLite backup to $BACKUP_DIR (kept 30 days)"
fi
who_reaches="$( [[ "$MODE" == gateway ]] && echo 'the App Service integration subnet' || echo "your users' network" )"
if [[ -n "${ALLOW_FROM:-}" ]]; then
  if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
    ufw allow from "$ALLOW_FROM" to any port "$PORT" proto tcp >/dev/null
    ok "ufw: port $PORT open to $ALLOW_FROM only"
  else
    ok "ufw is not active; allow $ALLOW_FROM → TCP $PORT in the VM's network security group"
  fi
else
  ok "no ALLOW_FROM given: allow only $who_reaches → TCP $PORT in the VM's network security group"
fi

# ---------------------------------------------------------------------------------------------------------------
IP="$(hostname -I | awk '{print $1}')"
printf '\n\033[1;32mPursuits is running.\033[0m\n\n'
if [[ "$MODE" == gateway ]]; then
  printf 'Set these two App Service settings:\n\n    API_UPSTREAM = http://%s:%s\n    GATEWAY_KEY  = %s\n\nKeep the key secret.\n' "$IP" "$PORT" "$KEY"
else
  printf 'Open:  http://%s:%s/opportunities\n' "$IP" "$PORT"
  printf 'The app has no login of its own — keep the port reachable only from the company network.\n'
fi
printf '\nUseful commands:\n'
printf '    sudo systemctl status %s          # is it running\n' "$SERVICE"
printf '    sudo journalctl -u %s -f          # live log\n' "$SERVICE"
printf '    sudo %s <new-pursuits.zip>        # update the app (data and settings are kept)\n' "$SELF"
