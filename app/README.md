# Tixcast web app

The installable web app at tixcast.app. React + TypeScript + Vite + Tailwind, with Supabase for sign-in and data.

It reads one table, `app_games`, which `collector/feed.py` rebuilds every 30 minutes with the beta Buy now / Wait / Watch calls. Alerts are checked and sent by `collector/alerts.py` in the same GitHub Actions run.

## Run it

```bash
cd app
pnpm install
pnpm dev          # http://localhost:5173
```

With no `.env.local`, the app runs in **demo mode** on sample games, and everything you save stays in your browser. Copy `.env.example` to `.env.local` and fill in your Supabase URL and anon key to use real data.

## Deploy to Vercel

1. Import the GitHub repo in Vercel and set **Root Directory** to `app`. Framework preset: Vite.
2. Add the environment variables from `.env.example`.
3. Add `tixcast.app` under **Settings, Domains**, then add the DNS records Vercel shows you in Cloudflare with the proxy off (grey cloud).

`vercel.json` sends every page path to the app and serves the service worker uncached.
