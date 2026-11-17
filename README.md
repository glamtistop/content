# ContentPilot

AI social media content studio: turns your photos, clips and ideas into ready-to-post TikTok, Instagram and Facebook packages. It writes word-for-word scripts, captions, hashtags labeled by evidence, cover images and posting-time hypotheses. You review and approve everything; nothing is posted for you.

Preconfigured for **Print Queen 3D** (Los Angeles). Add more brands in **Brand profile**.

## Two ways to run

| Mode | What you need | What you get |
|---|---|---|
| **This-device** | Nothing | Full Phase 1 workflow in the browser: uploads, technical media analysis, template-written scripts and packages, editing, versions, teleprompter, exports. Data stays in that browser only. |
| **Account** | Free Supabase project + an AI key | Your own email/password login, sync across iPhone and Mac, private cloud media storage, AI analysis of what's actually in your photos and clips (including speech in clips up to 15 MB), and AI-written copy. |

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 26 unit tests
npm run build        # static site in ./out
```

End-to-end browser test (needs Python Playwright + Chrome):
```bash
npm run build && python3 -m http.server 4173 -d out &
CP_MEDIA=/path/to/testmedia python3 e2e/test_e2e.py
```
Device layout audit (iPhone 18, iPhone Duo closed and open, MacBook window sizes): `python3 e2e/test_devices.py`. Memory flow: `python3 e2e/test_memory.py`.

The test media folder needs `keychain.jpg`, `clip-vertical.mp4`, `clip-horizontal.mov` and a `fake.jpg` (any non-image bytes).

## Set up accounts and AI

Follow **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** for step-by-step instructions, all done in the browser. In short:
1. Create a Supabase project and run `supabase/migrations/001_init.sql` in the SQL Editor.
2. Set Auth URLs to `https://glamtistop.github.io/content/`.
3. Add GitHub Actions variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`), then re-run the deploy.
4. For AI: deploy `supabase/functions/ai` (name `ai`, JWT verification off; the function checks the user itself), then add the secrets `AI_PROVIDER`, `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) and `MONTHLY_AI_CALL_LIMIT`.

For local development, copy `.env.example` to `.env.local`.

## Deploy to GitHub Pages (auto-updates your Home Screen app)

1. This repository is `glamtistop/content`; merging to `main` deploys.
2. Repository → Settings → Pages → Source: **GitHub Actions**.
3. Repository → Settings → Secrets and variables → Actions → **Variables**: add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (skip both for this-device mode).
4. Every push to `main` runs the tests, builds, and publishes to `https://<user>.github.io/<repo>/`.
5. On iPhone, open it in Safari → Share → **Add to Home Screen**. On a Mac in Safari, use File → **Add to Dock**. Updates arrive on the next launch with no reinstalling.

Any static host works (Netlify, Vercel, Cloudflare Pages). Set `NEXT_PUBLIC_BASE_PATH` only when hosting under a sub-path.

## How it's built

- **Frontend:** Next.js 15 (static export), React 19, TypeScript, Tailwind. Installable PWA.
- **Data:** a `Store` interface with two implementations: IndexedDB (`src/lib/store/local.ts`) and Supabase (`src/lib/store/cloud.ts`). Projects keep the same JSON shape in both, and across phases.
- **Media:** analyzed in the browser. Files are checked by their signature bytes, HEIC is converted to JPEG, focus (variance of the Laplacian) and light are measured, and video frames are sampled at real timestamps. Cloud uploads report real progress and can be retried.
- **AI:** `supabase/functions/ai`. The key stays on the server, the user is verified, monthly limits apply, and text inside uploads is treated as data, never as instructions. Every response is validated in `src/lib/generate/ai.ts` before use. Timestamps that don't match a real extracted frame are dropped, hashtag counts are capped, and evidence labels are forced.
- **Template writer:** `src/lib/generate/template.ts` writes complete copy without AI, using only your description and brand profile. It tells products apart from activities.
- **Platform rules:** `src/lib/platforms.ts`. Each rule records its source and the date it was checked. Update this file when a platform changes its limits.
- **Memory (learns your style):** `src/lib/memory.ts`. Edits, cuts, rewrites and rejections are recorded per field. Plain-code detectors turn repeated patterns into rules, which switch on after 3 consistent decisions; older decisions count for less (90-day half-life). New drafts from the template writer or AI follow active rules. You can review or switch off any rule in Brand profile → "What ContentPilot has learned". Supabase tables: `supabase/migrations/002_memory.sql`.
- **Posting times:** `src/lib/time.ts`. Timezone handling is daylight-saving-safe and built on `Intl`. Times are labeled as general guidance until account data exists.
