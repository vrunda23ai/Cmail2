---
title: Cmail
emoji: 📨
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# Cmail — AI Email Summarizer (Next.js + Supabase + Grok / HuggingFace)

A clean-rewritten, GitHub-ready version of the original Lovable/TanStack app. All Lovable dependencies removed. Gemini replaced with **Grok (xAI)** with a fallback to **Hugging Face**. Ships as a plain Next.js 15 App-Router app that deploys to **Vercel** OR **Hugging Face Spaces** in one click, and uses **Supabase** for auth + Postgres.

## Features
- Google sign-in via Supabase (with Gmail scope for reading email)
- One-click Gmail sync of the last 7 days on first run; incremental afterwards
- LLM importance score (0-100), summary, and action items
- Emails with `importance > 50` and concrete tasks auto-create todos with brief + due date
- Every todo has a calendar-add icon that drops it onto the calendar
- Feedback loop (thumbs up/down) trains per-user feature weights
- Demo mode when you don't want to connect a real Gmail

## Fixes applied vs. original
1. SSR-safe Supabase clients using `@supabase/ssr`.
2. OAuth code exchange happens in a **server route** at `/auth/callback` — no more redirect loop.
3. Clean Next.js code, no TanStack Start compiler issues.
4. Provider-agnostic AI layer (Grok / HF toggle via `AI_PROVIDER`).

## Local setup
```bash
yarn install
cp .env.example .env.local  # fill it in
yarn dev
```

## Deploy options
- **Vercel** → see bottom of this README
- **Hugging Face Spaces** → see `HUGGINGFACE.md` for the full guide (Docker-based)

## Environment variables
See `.env.example`.

| Var | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | https://app.supabase.com → Project Settings → API |
| `AI_PROVIDER` | `grok` or `hf` |
| `GROK_API_KEY` / `GROK_MODEL` | https://console.x.ai (`grok-2-latest`) |
| `HF_API_KEY` / `HF_MODEL` | https://huggingface.co/settings/tokens |

### Supabase setup
1. Create project, run `supabase/schema.sql` in SQL editor.
2. Auth → Providers → Google → paste Google OAuth client ID/secret.
3. Auth → URL Configuration → add `http://localhost:3000/**` (plus your prod URL later).
4. Google Cloud → OAuth consent screen → add `gmail.readonly` scope. Google Cloud → Credentials → OAuth client → authorized redirect URI = `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.

### Vercel deploy
1. Push to GitHub.
2. Import repo on vercel.com/new.
3. Add every env var from `.env.example`.
4. After first deploy, set `NEXT_PUBLIC_BASE_URL` to your Vercel URL and add it to Supabase redirect URLs.

### Hugging Face Spaces deploy
See `HUGGINGFACE.md`. TL;DR: create a Docker Space, add env vars in settings, `git push` to the Space remote. Dockerfile in this repo handles the rest.

## Project layout
```
app/
  api/[[...path]]/route.js  # all backend endpoints
  auth/page.js
  auth/callback/route.js    # server route that exchanges OAuth code
  dashboard/page.js  inbox/page.js  todos/page.js  calendar/page.js
components/AppShell.js
lib/ai.js  lib/gmail.js  lib/supabase/*.js
middleware.js
supabase/schema.sql
Dockerfile  HUGGINGFACE.md
```

## License
MIT.
