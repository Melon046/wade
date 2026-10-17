# WADE

**W**eb **A**nd **D**esktop **E**ngine — a self-hosted AI assistant with streaming chat, saved conversations, and a free-tier-first architecture.

Built to run at **R0/month** for a single user, and to stay cheap as it grows.

---

## What's in the box

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) + React 19 | One repo serves the UI *and* the server route that holds the API key |
| Styling | Tailwind CSS v4 | No build config, dark-first |
| LLM (primary) | Google AI Studio — Gemini Flash | Best quality on a free tier, no credit card |
| LLM (fallback) | Groq — Llama 3.3 70B | ~14× the daily request budget of Gemini |
| Streaming | Vercel AI SDK 6 `streamText` | Provider-agnostic; swapping models is one line |
| Database | Supabase Postgres | 500 MB + 50k monthly users free |
| Auth | Supabase magic link | No passwords to store, hash, or leak |
| Isolation | Postgres Row Level Security | The *database* enforces tenancy, not app code |
| Markdown | react-markdown + remark-gfm + rehype-highlight | Tables, task lists, syntax-highlighted code |

---

## Architecture

```
Browser
  │  fetch POST /api/chat  { conversationId?, message }
  ▼
Next.js Route Handler  (src/app/api/chat/route.ts)
  │  1. authenticate via Supabase cookies
  │  2. enforce per-user daily token quota
  │  3. resolve or create the conversation
  │  4. persist the user message
  │  5. build the context window (last 20 messages)
  │  6. streamText() → Gemini Flash
  │        └─ on failure → Groq Llama
  │  7. persist assistant message + usage_event
  ▼
text/plain stream  ──►  client renders tokens as they arrive
```

**The API keys never reach the browser.** The client only ever talks to `/api/chat`; that route is the only place a provider key is read.

### Why the fallback is a real fallback

The route pulls the **first chunk** from a provider *before* committing to it. A rate limit (429) or a retired model id (404) therefore surfaces as a thrown error, and the loop moves to the next provider — instead of streaming a broken response to the user.

---

## Quick start

### 1. Install

```bash
npm install
```

### 2. Create the database

1. Create a project at [supabase.com](https://supabase.com) — pick the **Frankfurt** region if you're in South Africa (~90 ms faster than US-East).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, and run it.
3. Copy your keys from **Project Settings → API**.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `GOOGLE_GENERATIVE_AI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) |

You need **at least one** LLM key. With only Groq configured, WADE runs on Llama alone.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>, enter your email, and click the magic link.

> **Magic links in local dev:** Supabase's built-in email sender is rate-limited to a few messages per hour. For heavy local testing, add `http://localhost:3000/auth/callback` to **Authentication → URL Configuration → Redirect URLs**, or configure your own SMTP under **Authentication → Emails**.

---

## Project layout

```
src/
├── app/
│   ├── api/chat/route.ts        # streaming endpoint — the core of the app
│   ├── auth/callback/route.ts   # magic-link code → session exchange
│   ├── chat/page.tsx            # authenticated chat page
│   ├── login/page.tsx           # magic-link form
│   ├── layout.tsx
│   ├── page.tsx                 # redirects to /chat or /login
│   └── globals.css              # Tailwind + markdown/code styling
├── components/
│   ├── chat-shell.tsx           # client state + streaming reader
│   ├── sidebar.tsx              # conversation list, rename, delete
│   ├── message-list.tsx         # thread rendering + empty state
│   ├── composer.tsx             # auto-growing input, Enter to send
│   └── markdown.tsx             # markdown + syntax highlighting
├── lib/
│   ├── models.ts                # provider chain (Gemini → Groq)
│   ├── prompt.ts                # system prompt
│   ├── types.ts
│   └── supabase/
│       ├── client.ts            # browser client
│       ├── server.ts            # server client (RLS as the user)
│       └── middleware.ts        # session refresh + route guards
└── middleware.ts
supabase/migrations/0001_init.sql
```

---

## Database schema

Three tables, all protected by RLS, all keyed to `auth.uid()`.

- **`conversations`** — one row per thread. `updated_at` drives sidebar ordering.
- **`messages`** — the thread itself. Stores `model`/`provider` per assistant turn so you can see which provider answered.
- **`usage_events`** — append-only audit log, one row per completed turn. Powers the cost dashboard and the daily quota check.

A `usage_today` view aggregates today's tokens per user.

### Verifying RLS actually works

Sign in as user A, copy a conversation id, then sign in as user B and try to read it. You should get **zero rows** — not an error, just nothing. That's RLS doing its job.

---

## Cost model

Rough per-message cost, assuming ~1,100 tokens per turn (≈800 in, ≈300 out):

| Model | Per message | 3,000 messages/month |
| --- | --- | --- |
| Llama 3.1 8B (Groq) | ≈ R0.001 | ≈ R3 |
| Gemini 2.5 Flash-Lite | ≈ R0.004 | ≈ R12 |
| Gemini 2.5 Flash | ≈ R0.033 | ≈ R100 |

**R0 until you pass roughly 300 real users.** Free tiers cover everything before that.

### Free-tier limits to design around

| Provider | Daily requests | The real ceiling |
| --- | --- | --- |
| Google AI Studio (Flash) | ~1,000–1,500 | 5–15 requests/minute |
| Groq (Llama 3.1 8B) | 14,400 | 6,000 tokens/minute |
| Groq (Llama 3.3 70B) | 1,000 | 12,000 tokens/minute |

Note the pattern: the **daily** number is generous, the **per-minute** number is what actually throttles you. That's why the fallback chain matters more than the daily caps.

---

## Guardrails

| Env var | Default | Effect |
| --- | --- | --- |
| `WADE_MAX_OUTPUT_TOKENS` | `2048` | Caps a single reply so one runaway generation can't eat your quota |
| `WADE_DAILY_TOKEN_LIMIT` | `0` (off) | Per-user daily token cap. **Turn this on before sharing a public link.** |
| `WADE_PRIMARY_MODEL` | `gemini-2.5-flash` | Override when a model id is retired |
| `WADE_FALLBACK_MODEL` | `llama-3.3-70b-versatile` | Same |

Context is capped at the last **20 messages** — unbounded history is the fastest way to make cost grow quadratically.

---

## Deploying

### Web app → Vercel

1. Push to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Add every variable from `.env.local` under **Settings → Environment Variables**.
4. Deploy, then add your production URL to Supabase **Authentication → URL Configuration**.

> Vercel's Hobby tier is **non-commercial only**. The day you start charging, move to Cloudflare Workers or a paid plan.

### Mobile → Expo

The API is a plain HTTP endpoint, so a React Native client reuses it unchanged. Two things to know:

- Use **`expo/fetch`**, not the global `fetch` — React Native's built-in fetch buffers the whole response and your stream will arrive all at once.
- Store the Supabase session in **`expo-secure-store`**, not `AsyncStorage`.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `No LLM provider is configured` | No API key in `.env.local` | Add one and restart the dev server |
| `All providers failed` | Both keys invalid, or model ids retired | Check the key, then override the model id |
| Reply arrives all at once | A proxy is buffering | Confirm `Cache-Control: no-cache, no-transform` survives your host |
| Logged out randomly | Middleware not refreshing the session | Ensure `src/middleware.ts` is present and its matcher is intact |
| `model not found` (404) | Provider retired the model id | Set `WADE_PRIMARY_MODEL` / `WADE_FALLBACK_MODEL` |
| Supabase project paused | Free projects pause after ~1 week idle | Add a weekly cron ping, or open the dashboard |

---

## Roadmap

**Shipped (MVP):** streaming chat · magic-link auth · saved conversations · markdown + code rendering · provider fallback · usage logging · RLS.

**Next, in order of value per hour:**
1. **Regenerate / edit a message** — highest-value missing chat feature.
2. **Cost dashboard** — read `usage_events` and chart spend per day.
3. **BYOK** — let users paste their own key, encrypted at rest. Removes your cost ceiling entirely.
4. **File upload** — Supabase Storage + a PDF text extractor.
5. **Mobile app** — Expo, reusing `/api/chat` as-is.

**Deliberately not built yet:** voice, image generation, model picker, teams. Each adds surface area without making the core loop better.

---

## License

MIT.
