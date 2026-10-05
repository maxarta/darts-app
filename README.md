# Darts Score — Telegram Mini App

Подсчёт очков в дартс (301/501) для Telegram-канала: реестр игроков, турниры (круг + плей-офф), общая статистика.

## Стек

- Vite + React 19 + React Router
- Hono (API `/api/*`)
- Supabase (Postgres)
- Grammy (Telegram Bot)
- `@twa-dev/sdk`

## Настройка

1. Скопируйте `.env.example` в `.env.local` и заполните переменные.  
   **Не храните токены в `.env.example`** — только в `.env.local` и в Vercel Environment Variables.
2. Примените миграцию в Supabase: `supabase/migrations/001_initial.sql`
3. Создайте бота в [@BotFather](https://t.me/BotFather), укажите URL мини-приложения.
4. Добавьте бота **администратором канала**.
5. Установите webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEBAPP_URL>/api/telegram/webhook`

## Разработка

```bash
npm install
npm run dev          # Vite :5001 + API :5002 (прокси /api)
```

Локально в браузере (без Telegram): откройте **http://localhost:5001** — web-сессия работает через заголовок `x-web-auth: local`.

**Миграция БД (один раз):** Supabase Dashboard → SQL Editor → `supabase/migrations/001_initial.sql` → Run.

Тесты правил игры:

```bash
npm test
```

## Деплой: GitHub → Vercel

```text
git push → GitHub (maxarta/darts-app) → Vercel → npm run build → dist/ + api/index.js
```

1. Репозиторий: `https://github.com/maxarta/darts-app`
2. Vercel → Import `darts-app`
3. Environment Variables: `BOT_TOKEN`, `WEBAPP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
4. Framework Preset можно оставить Other / Vite; `vercel.json` задаёт `dist` и rewrite на SPA + `/api`

Участники канала должны **один раз открыть** мини-апп из канала, чтобы попасть в список игроков (ограничение Telegram Bot API).
