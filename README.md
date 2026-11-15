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
The test media folder needs `keychain.jpg`, `clip-vertical.mp4`, `clip-horizontal.mov` and a `fake.jpg` (any non-image bytes).

## Set up accounts and AI (about 20 minutes)

1. **Create a Supabase project** at supabase.com (the free tier is enough to start).
2. **Create the database:** in the SQL editor, paste and run `supabase/migrations/001_init.sql`. This creates every table with owner-only row-level security and a private `media` bucket.
3. **Auth:** Authentication → Providers → keep Email enabled. Under URL Configuration, set Site URL to where you'll host the app (e.g. `https://glamtistop.github.io/content/`).
4. **Deploy the AI function** with the Supabase CLI:
   ```bash
   supabase login
   supabase link --project-ref <your-ref>
   supabase functions deploy ai
   supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=<key> MONTHLY_AI_CALL_LIMIT=300
   ```
   - Gemini key: aistudio.google.com. Turn on billing for the key: the free tier may use your data to improve Google's models, and the paid tier doesn't.
   - Or use Claude: `AI_PROVIDER=anthropic ANTHROPIC_API_KEY=<key>` from console.anthropic.com. This bills separately from a Claude.ai subscription. Claude reads photos and video frames but not audio, so clip transcripts need Gemini.
   - Set a spending cap in the provider's console as well. `MONTHLY_AI_CALL_LIMIT` is a second guard.
5. **Point the app at Supabase:** copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API). The anon key is public by design; row-level security protects the data.
6. Rebuild. Open the app, create your account, then go to **Settings → Test AI connection**.

## Deploy to GitHub Pages (auto-updates your Home Screen app)

1. This repository is `glamtistop/content`; merging to `main` deploys.
2. Repository → Settings → Pages → Source: **GitHub Actions**.
3. Repository → Settings → Secrets and variables → Actions → **Variables**: add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (skip both for this-device mode).
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
- **Posting times:** `src/lib/time.ts`. Timezone handling is daylight-saving-safe and built on `Intl`. Times are labeled as general guidance until account data exists.
