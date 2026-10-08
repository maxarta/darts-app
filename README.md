# Darts Score

Подсчёт очков в дартс (301/501): реестр игроков, турниры (круг + плей-офф), статистика. Веб-приложение + опциональный iOS-шелл с LiDAR autoscore.

## Стек

- Vite + React 19 + React Router
- Hono (API `/api/*`)
- Supabase (Postgres)

## Настройка

1. Скопируйте `.env.example` в `.env.local` и заполните переменные.  
   **Не храните секреты в `.env.example`** — только в `.env.local` и в Vercel Environment Variables.
2. Примените миграцию в Supabase: `supabase/migrations/001_initial.sql`

## Разработка

```bash
npm install
npm run dev          # Vite :5001 + API :5002 (прокси /api)
```

Откройте **http://localhost:5001** — web-сессия через заголовок `x-web-auth: local`.

**Миграция БД (один раз):** Supabase Dashboard → SQL Editor → `supabase/migrations/001_initial.sql` → Run.

```bash
npm test
```

## Деплой: GitHub → Vercel

```text
git push → GitHub → Vercel → npm run build → dist/ + api/index.js
```

1. Репозиторий: `https://github.com/maxarta/darts-app`
2. Vercel → Import `darts-app`
3. Environment Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBAPP_URL`
4. Framework Preset можно оставить Other / Vite; `vercel.json` задаёт `dist` и rewrite на SPA + `/api`
