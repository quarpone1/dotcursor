#!/usr/bin/env bash
# Скрипт обновления сайта на сервере.
# Использование: ssh на сервер → bash /var/www/dotcursor/deploy/deploy.sh
set -euo pipefail

APP_DIR="/var/www/dotcursor"

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
