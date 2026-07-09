# Деплой dotcursor.ru на Ubuntu VDS

Стек на сервере: **Node 22 + Next.js (next start, порт 3000) + nginx (reverse-proxy) + Let's Encrypt (HTTPS)**.

## 0. DNS (в панели регистратора домена)

| Тип | Имя | Значение        |
|-----|-----|-----------------|
| A   | @   | IP_твоего_VDS   |
| A   | www | IP_твоего_VDS   |

Подожди, пока записи разъедутся (проверка: `dig +short dotcursor.ru`).

## 1. Подготовка сервера (один раз)

```bash
ssh root@IP_твоего_VDS

# базовые пакеты
apt update && apt upgrade -y
apt install -y nginx git curl ufw

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v   # v22.x

# certbot для SSL
apt install -y certbot python3-certbot-nginx

# файрвол
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable

# отдельный пользователь для приложения
adduser --disabled-password --gecos "" deploy
```

## 2. Код и сборка

```bash
mkdir -p /var/www/dotcursor
chown deploy:deploy /var/www/dotcursor

su - deploy
git clone https://github.com/quarpone1/dotcursor.git /var/www/dotcursor
cd /var/www/dotcursor
npm ci
npm run build
exit   # обратно в root
```

## 3. Systemd-сервис (автозапуск Next.js)

```bash
cp /var/www/dotcursor/deploy/dotcursor.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dotcursor
systemctl status dotcursor   # должно быть active (running)
curl -I http://127.0.0.1:3000   # HTTP/1.1 200 OK
```

## 4. Nginx

```bash
cp /var/www/dotcursor/deploy/nginx-dotcursor.conf /etc/nginx/sites-available/dotcursor.conf
ln -s /etc/nginx/sites-available/dotcursor.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Проверка: `http://dotcursor.ru` должен открывать сайт.

## 5. HTTPS (Let's Encrypt)

```bash
certbot --nginx -d dotcursor.ru -d www.dotcursor.ru
```

Certbot сам допишет HTTPS-блоки в конфиг и настроит автопродление
(проверить: `certbot renew --dry-run`).

## 6. Обновление сайта после изменений

Локально: закоммитить и запушить в `main`. Затем на сервере:

```bash
ssh root@IP_твоего_VDS
sudo -u deploy bash /var/www/dotcursor/deploy/deploy.sh
```

(скрипт делает `git pull → npm ci → npm run build → restart`)

## Диагностика

```bash
journalctl -u dotcursor -f          # логи Next.js
tail -f /var/log/nginx/error.log    # логи nginx
systemctl restart dotcursor         # перезапуск приложения
```
