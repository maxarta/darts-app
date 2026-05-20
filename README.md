# Darts Score — Telegram Mini App

Подсчёт очков в дартс (301/501) для Telegram-канала: реестр игроков, турниры (круг + плей-офф), общая статистика.

## Стек

- Next.js 16, React 19
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
npm run dev          # порт 5001 (на Mac порт 5000 часто занят AirPlay)
npm run dev:5000     # только если 5000 свободен
```

**Порт 5000 на Mac:** часто занят «Приёмником AirPlay». Отключите:  
*Системные настройки → Основные → AirDrop и Handoff → Приёмник AirPlay → Выкл.*, затем `npm run dev`.

**Локально в браузере** (без Telegram): в `.env.local` включите `ALLOW_DEV_AUTH=true` и `NEXT_PUBLIC_DEV_MODE=true` → откройте **http://localhost:5001**

**Миграция БД (один раз):** Supabase Dashboard → [SQL Editor](https://supabase.com/dashboard) → вставьте файл `supabase/migrations/001_initial.sql` → Run.

Тесты правил игры:

```bash
npm test
```

## Деплой: GitHub → Vercel

GitHub **нужен** для хранения кода и автосборки, но связка делается **в интерфейсах**, а не через `GITHUB_TOKEN` в `.env` приложения.

```text
git push → GitHub (maxarta/darts-app) → Vercel (webhook) → npm run build → production
```

1. Репозиторий на GitHub: `https://github.com/maxarta/darts-app`
2. [Vercel](https://vercel.com) → **Add New Project** → Import из GitHub → выбрать `darts-app`
3. В Vercel → **Settings → Environment Variables** добавить:
   `BOT_TOKEN`, `WEBAPP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
4. Каждый `git push` в `main` (или выбранную ветку) запускает новый деплой

**`GITHUB_TOKEN` в `.env.local`** — только если вы из терминала вызываете [`gh`](https://cli.github.com/) (создать PR, issues). Для обычного `git push` он **не нужен**: Git использует SSH-ключ или credential helper macOS.

Участники канала должны **один раз открыть** мини-апп из канала, чтобы попасть в список игроков (ограничение Telegram Bot API).
