# Agent notes

This app uses **Vite + React Router** for the SPA and **Hono** for `/api/*`.

- Frontend: `src/`, `components/`, `lib/` (client-safe pieces)
- API handlers: `app/api/**/route.ts` (Request/Response handlers)
- API router: `server/app.ts` (Hono)
- Local: `npm run dev` → Vite `:5001` + API `:5002` (proxy `/api`)
- Production: Vite `dist/` + bundled `api/index.js` on Vercel

Shims for legacy imports: `src/shims/next-{image,link,navigation}.*`
