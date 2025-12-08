#!/usr/bin/env bash
set -e

# ====== НАСТРОЙКИ ======
REMOTE_USER="gers"
REMOTE_HOST="87.242.101.169"

REMOTE_FRONT_DIR="/home/gers/cord/front"
REMOTE_APP_DIR="$REMOTE_FRONT_DIR/app/cord_react"

# Локальная директория React-приложения (где package.json)
LOCAL_APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TMP_TAR="front_src.tar.gz"
REMOTE_TAR="$REMOTE_FRONT_DIR/front_src.tar.gz"

echo "=== Packing frontend sources (src + public + package.json + package-lock.json) ==="

cd "$LOCAL_APP_DIR"

# Пакуем код и метаданные зависимостей
tar -czf "$TMP_TAR" \
  src \
  public \
  package.json \
  package-lock.json 2>/dev/null || true

if [ ! -f "$TMP_TAR" ]; then
  echo "ERROR: failed to create $TMP_TAR"
  exit 1
fi

echo "=== Uploading sources to server ==="
scp "$TMP_TAR" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_TAR}"

echo "=== Unpacking sources and running remote deploy ==="
ssh "${REMOTE_USER}@${REMOTE_HOST}" bash -c "'
  set -e
  cd \"$REMOTE_FRONT_DIR\"

  # Чистим старые src/public, чтобы не копился мусор
  rm -rf \"$REMOTE_APP_DIR/src\" \"$REMOTE_APP_DIR/public\"

  mkdir -p \"$REMOTE_APP_DIR\"
  tar -xzf \"$REMOTE_TAR\" -C \"$REMOTE_APP_DIR\"
  rm -f \"$REMOTE_TAR\"

  echo \"Sources updated in $REMOTE_APP_DIR\"

  ./deploy_front.sh
'"

echo "=== Cleaning local temp ==="
rm -f "$TMP_TAR"

echo "=== Frontend deploy DONE ==="
