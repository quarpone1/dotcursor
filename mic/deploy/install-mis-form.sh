#!/usr/bin/env bash
# Установка/обновление формы заявок МИС на сервере, где уже живут dotcursor.ru и onco.
# Запускать от root:  bash /var/www/dotcursor/mic/deploy/install-mis-form.sh
#
# Форма встаёт на http://<IP>/zayavka/ — корень по IP остаётся за onco.
set -euo pipefail

APP=/var/www/mis-form
SRC="${1:-/var/www/dotcursor/mic}"
ENV_FILE=/etc/mis-form.env
SNIPPET=/etc/nginx/snippets/mis-form.conf

say() { echo -e "\n→ $*"; }

[ -d "$SRC" ] || { echo "Нет исходников: $SRC (сначала git pull в /var/www/dotcursor)"; exit 1; }

say "Копирую код в $APP"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
mkdir -p "$APP"
rsync -a --delete \
  --exclude node_modules --exclude .env --exclude data --exclude 'test/.tmp' \
  "$SRC"/ "$APP"/
chown -R deploy:deploy "$APP"

say "Ставлю зависимости"
sudo -u deploy bash -lc "cd $APP && npm ci --omit=dev"

# --- настройки ---
if [ ! -f "$ENV_FILE" ]; then
  install -m640 -o root -g deploy "$APP/env.example" "$ENV_FILE"
  echo
  echo "‼  Создан $ENV_FILE — заполните в нём:"
  echo "     YANDEX_DISK_TOKEN=   (токен Яндекс.Диска)"
  echo "     SMTP_USER / MAIL_FROM = cursordot@yandex.ru"
  echo "     SMTP_PASS=           (пароль приложения для почты)"
  echo "   и запустите скрипт ещё раз."
  exit 1
fi
# Файл читают двое: systemd (от root) и проверочные скрипты (от deploy),
# поэтому не 600 root, а 640 root:deploy — миру по-прежнему не видно.
chown root:deploy "$ENV_FILE"
chmod 640 "$ENV_FILE"

MISSING=$(grep -E '^(YANDEX_DISK_TOKEN|SMTP_USER|SMTP_PASS|MAIL_FROM|MAIL_TO)=[[:space:]]*$' "$ENV_FILE" | cut -d= -f1 || true)
if [ -n "$MISSING" ]; then
  echo "‼  В $ENV_FILE не заполнено:"; echo "$MISSING" | sed 's/^/     /'
  exit 1
fi

# Подставные значения из шаблона — частая причина «Invalid user or password»
if grep -qE '^(SMTP_USER|MAIL_FROM)=.*example\.(ru|com)' "$ENV_FILE"; then
  echo "‼  В $ENV_FILE остался адрес-заглушка из шаблона:"
  grep -nE '^(SMTP_USER|MAIL_FROM)=' "$ENV_FILE" | sed 's/^/     /'
  echo "   Впишите реальный ящик, с которого уходят заявки."
  exit 1
fi

say "Проверяю связь с Яндекс.Диском и почтой"
# --env-file, а не сорсинг шеллом: так значения читаются буквально,
# как их потом прочитает systemd, и пароль не поедет от лишних символов.
sudo -u deploy bash -lc "cd $APP && node --env-file=$ENV_FILE tools/check-disk.mjs"
sudo -u deploy bash -lc "cd $APP && node --env-file=$ENV_FILE tools/check-mail.mjs"

# --- сервис ---
say "Ставлю systemd-сервис"
mkdir -p /var/lib/mis-form && chown deploy:deploy /var/lib/mis-form
install -m644 "$APP/deploy/mis-form.service" /etc/systemd/system/mis-form.service
systemctl daemon-reload
systemctl enable mis-form >/dev/null
systemctl restart mis-form
sleep 2
systemctl is-active --quiet mis-form || { journalctl -u mis-form -n 30 --no-pager; exit 1; }

# --- nginx ---
say "Настраиваю nginx"
mkdir -p /etc/nginx/snippets
cat > "$SNIPPET" <<'NGINX'
# Форма заявки в техподдержку МИС — http://<IP>/zayavka/
# Файлы обычно уходят напрямую в Яндекс.Диск мимо nginx; резервный канал
# (/api/upload-proxy) гонит их через нас — отсюда лимит тела и таймауты.

location = /zayavka { return 301 /zayavka/; }

location /zayavka/ {
    proxy_pass http://127.0.0.1:3210/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    client_max_body_size 110m;
    proxy_request_buffering off;
    proxy_buffering off;

    proxy_connect_timeout 60s;
    proxy_send_timeout    600s;
    proxy_read_timeout    600s;
}
NGINX

# Ищем блок с default_server — это тот, что отвечает по IP
DEFAULT_CONF=$(grep -rlE 'listen\s+80\s+default_server' /etc/nginx/sites-enabled/ | head -1 || true)
[ -n "$DEFAULT_CONF" ] || { echo "Не нашёл default_server в /etc/nginx/sites-enabled/"; exit 1; }
DEFAULT_CONF=$(readlink -f "$DEFAULT_CONF")
echo "   default_server: $DEFAULT_CONF"

if grep -q 'snippets/mis-form.conf' "$DEFAULT_CONF"; then
  echo "   include уже на месте"
else
  cp "$DEFAULT_CONF" "$DEFAULT_CONF.bak-$(date +%Y%m%d%H%M%S)"
  # вставляем include первой строкой внутрь server-блока с default_server
  python3 - "$DEFAULT_CONF" <<'PY'
import re, sys
path = sys.argv[1]
src = open(path, encoding='utf-8').read()
m = re.search(r'server\s*\{', src)
if not m:
    sys.exit('не нашёл server { в ' + path)
i = m.end()
open(path, 'w', encoding='utf-8').write(
    src[:i] + '\n    include snippets/mis-form.conf;\n' + src[i:])
print('   include добавлен')
PY
fi

if nginx -t; then
  systemctl reload nginx
else
  echo "‼  nginx -t не прошёл — откатываю конфиг"
  LAST_BAK=$(ls -t "$DEFAULT_CONF".bak-* 2>/dev/null | head -1 || true)
  [ -n "$LAST_BAK" ] && cp "$LAST_BAK" "$DEFAULT_CONF" && nginx -t && systemctl reload nginx
  exit 1
fi

IP=$(hostname -I | awk '{print $1}')
say "Готово: http://${IP}/zayavka/"
echo "   статус:  systemctl status mis-form"
echo "   логи:    journalctl -u mis-form -f"
echo "   заявки:  /var/lib/mis-form/tickets.jsonl"
