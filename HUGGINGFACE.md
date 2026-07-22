---
title: Cmail
emoji: 📨
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# Deploying Cmail on Hugging Face Spaces

Cmail runs as a Docker Space (Next.js standalone build inside a Node 20 Alpine
container). This guide walks you through it end-to-end.

---

## Prerequisites
- A working local copy (`.env.local` filled, `yarn dev` works)
- A Hugging Face account: https://huggingface.co/join
- Supabase project already set up (with the Google provider enabled and
  schema loaded)

---

## Step 1 - Create a new Space

1. Go to https://huggingface.co/new-space
2. Fill in:
   - **Space name**: `cmail` (or whatever)
   - **License**: `mit`
   - **Select the Space SDK**: **Docker** → **Blank**
   - **Space hardware**: `CPU basic` (free tier is fine)
   - **Visibility**: Public or Private (your call - Private is safer for now)
3. Click **Create Space**.

HF will give you a git URL like `https://huggingface.co/spaces/YOUR_USER/cmail`.

---

## Step 2 - Add environment variables in HF

On the Space page click **Settings** → **Variables and secrets**.

### As "Variables" (baked into the client bundle at build time)
These are the `NEXT_PUBLIC_*` ones - they end up in JS the browser sees, so
HF must have them at **build time**, not runtime.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BASE_URL` → set this to `https://YOUR_USER-cmail.hf.space` (the URL your Space is served on; you can update it after the first deploy)

### As "Secrets" (server-only)
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_PROVIDER` → `grok` or `hf`
- `GROK_API_KEY`
- `GROK_MODEL` → `grok-2-latest`
- `HF_API_KEY` (only if you set `AI_PROVIDER=hf`)
- `HF_MODEL` (default `meta-llama/Meta-Llama-3-8B-Instruct`)

> Note: HF Spaces re-builds the image whenever you push. If you only
> change a runtime **secret** (server-side), you must click **Restart** on
> the Space for it to take effect. If you change a `NEXT_PUBLIC_*` **variable**,
> you have to **Factory reboot** so the image rebuilds.

---

## Step 3 - Update Supabase redirect URLs

Supabase → Authentication → URL Configuration:
- **Site URL** → `https://YOUR_USER-cmail.hf.space`
- **Redirect URLs** → add both:
  - `https://YOUR_USER-cmail.hf.space/**`
  - `https://YOUR_USER-cmail.hf.space/auth/callback`

(Keep your `localhost:3000/**` entries too, so local dev still works.)

Google Cloud → Credentials → your OAuth client stays the same - it points
to the Supabase callback URL, not the app URL.

---

## Step 4 - Push the code to your Space

From your local project folder (the unzipped `cmail-export`):

```bash
# One-time: HF uses git; set up credentials
huggingface-cli login   # paste an access token from https://huggingface.co/settings/tokens

# Attach the Space repo as a remote
git init
git branch -M main
git add .
git commit -m "Initial Cmail deploy"
git remote add space https://huggingface.co/spaces/YOUR_USER/cmail
git push -u space main
```

If `git push` prompts for credentials, use your HF username and paste an
access token (from https://huggingface.co/settings/tokens - type: `Write`).

---

## Step 5 - Watch it build

On the Space page, open the **Logs** tab. You should see:

```
#1  FROM node:20-alpine AS deps ...
#2  yarn install
#3  yarn build
#4  starting server on 0.0.0.0:7860
```

First build takes ~3-5 minutes. When it says `Ready in ...ms`, click **App**
and you should see the Cmail landing page.

---

## Step 6 - Test the full flow

1. Open your Space URL in an incognito window.
2. Click **Get started** → **Continue with Google**.
3. Approve Gmail scope on the Google screen.
4. You should land on `/dashboard`.
5. Click **Inbox** → **Sync Gmail**. Emails from the last 7 days appear.

---

## Troubleshooting on HF

| Symptom | Fix |
|---|---|
| Space shows "App not responding" | Check **Logs**. Almost always a missing env var. |
| Redirect loop after Google | Double-check Site URL + Redirect URLs in Supabase point at your HF Space URL (with `https://`). |
| "Invalid API key" on callback | Rebuilt without updated `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do a **Factory reboot** after fixing it. |
| "AI_PROVIDER=hf but missing HF_API_KEY" | Add the secret in Space settings then **Restart**. |
| CORS errors from `/api/*` | The `Dockerfile` and `next.config.js` already set `Access-Control-Allow-Origin: *`. |

---

## Optional: use Hugging Face as the AI provider itself

One of the nice symmetries of hosting on HF is you can also point the AI
backend at HF Inference:

1. In Space settings, set `AI_PROVIDER=hf` and `HF_API_KEY=<your token>`.
2. Pick any chat-completion capable model from https://huggingface.co/models,
   e.g. `HF_MODEL=meta-llama/Meta-Llama-3-8B-Instruct` or
   `mistralai/Mistral-7B-Instruct-v0.3`.
3. Restart the Space.

No code changes required - `lib/ai.js` handles the switch.
