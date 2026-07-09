#!/usr/bin/env bash
# Скрипт обновления сайта на сервере.
# Использование: ssh на сервер → bash /var/www/dotcursor/deploy/deploy.sh
set -euo pipefail

APP_DIR="/var/www/dotcursor"

# На VDS с 1 ГБ RAM дефолтный лимит кучи V8 (~512 МБ) роняет проверку
# TypeScript при сборке. Поднимаем лимит — своп подхватит.
export NODE_OPTIONS="--max-old-space-size=2048"

cd "$APP_DIR"

echo "→ Забираем свежий код…"
git pull origin main

echo "→ Ставим зависимости…"
npm ci

echo "→ Собираем production-сборку…"
npm run build

echo "→ Перезапускаем сервис…"
sudo systemctl restart dotcursor

echo "✓ Готово: https://dotcursor.ru"
