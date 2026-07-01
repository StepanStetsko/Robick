# RobikServer — розгортання на сервері

Монорепо: `apps/server` (Fastify + Prisma + Twitch EventSub) і `apps/admin` (React + Vite).
Нижче — повний шлях від чистого Ubuntu/Debian до запущеного бота під PM2.

---

## 0. Передумови на сервері (разово)

```bash
# Node.js LTS (22.x)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# PM2
sudo npm install -g pm2
pm2 startup        # виконай команду, яку вона підкаже (реєструє автозапуск)
```

Створити БД і користувача:

```bash
sudo -u postgres psql
```
```sql
CREATE USER robik WITH PASSWORD 'надійний_пароль';
CREATE DATABASE robikserver OWNER robik;
GRANT ALL PRIVILEGES ON DATABASE robikserver TO robik;
\q
```

---

## 1. Забрати код

```bash
cd ~
git clone https://github.com/StepanStetsko/Robick.git robikserver
cd robikserver
```

Оновлення надалі: `git pull` у цій теці.

---

## 2. Налаштувати env

**Сервер** — `apps/server/.env` (скопіюй із прикладу й заповни):

```bash
cp apps/server/.env.example apps/server/.env
nano apps/server/.env
```
Обовʼязково задай:
- `DATABASE_URL` — з логіном/паролем/БД із кроку 0 (спецсимволи в паролі **URL-кодуй**).
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` — з https://dev.twitch.tv/console/apps.
- `TWITCH_REDIRECT_URI` — має збігатися з redirect у Twitch-застосунку.
- `ADMIN_ALLOWED_LOGINS` — твій Twitch-логін (кому пускати в адмінку).
- `ADMIN_SESSION_SECRET` — довгий випадковий рядок:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- Для прод-режиму — `NODE_ENV=production` (тоді cookie сесії стає `Secure` → **потрібен HTTPS**, див. розділ 6).

**Адмінка** — `apps/admin/.env`:

```bash
cp apps/admin/.env.example apps/admin/.env
nano apps/admin/.env      # VITE_API_BASE_URL = адреса API, напр. http://SERVER_IP:4000
```

---

## 3. Встановити залежності

```bash
(cd apps/server && npm install)
(cd apps/admin  && npm install)
```

---

## 4. Prisma: міграції + клієнт

```bash
cd apps/server
npx prisma migrate deploy    # застосовує всі міграції на прод-БД (без інтерактиву)
npx prisma generate
cd ../..
```

---

## 5. Білд

Бекенд **не потребує** окремого білду — він запускається через `tsx` (той самий
резолвер, що й `npm run dev`), тому bundler-style / безрозширеннєві імпорти
працюють без компіляції. `npm run build` (tsc) лишається лише для перевірки типів.

Адмінку білдимо (статика для роздачі):

```bash
(cd apps/admin && npm run build)    # vite → apps/admin/dist
```

---

## 6. Запуск

**Бекенд під PM2** (з кореня репо — там `ecosystem.config.cjs`):

```bash
pm2 start ecosystem.config.cjs
pm2 save                     # зафіксувати список для автозапуску після ребута
pm2 logs robikserver         # подивитись логи
```

**Адмінка (статика з `apps/admin/dist`)** — обери варіант:

- **nginx (рекомендовано):** віддавай `apps/admin/dist` як статику і проксі `/api` → `http://127.0.0.1:4000`.
- **Швидкий варіант через PM2:** розкоментуй блок `robik-admin` в `ecosystem.config.cjs`
  (`vite preview`), потім `pm2 restart ecosystem.config.cjs`.

> ⚠️ Cookie-сесія адмінки при `NODE_ENV=production` стає `SameSite=None; Secure` —
> працює **лише через HTTPS**. Для доступу ззовні постав домен + TLS (nginx + certbot)
> або тримай доступ через WireGuard і `NODE_ENV=development` у локальній мережі.

---

## 7. Оновлення після змін у коді

```bash
cd ~/robikserver
git pull
(cd apps/server && npm install && npx prisma migrate deploy && npx prisma generate)
(cd apps/admin  && npm install && npm run build)
pm2 restart robikserver
```

---

## Примітки

- `apps/server/storage/` і `dist/` — не у git; storage створюється застосунком при старті.
- Порт бекенда — `PORT` (деф. 4000). WS-мости Unity/Unreal слухають лише `127.0.0.1`.
- Джерело правди по фічах/архітектурі — `docs/HANDOFF.md`.
