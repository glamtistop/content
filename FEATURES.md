# ContentPilot: Phase 1 completion report

Tested on 2026-11-14: 26 unit tests (Vitest) and 29 end-to-end checks in real Chrome (`e2e/test_e2e.py`). The end-to-end run covers phone (390 px), foldable cover (344 px), unfolded foldable (884 px) and desktop (1440 px) layouts.

**What was tested here:** the whole workflow in this-device mode, using the template writer.

**What could not be tested here:** anything that needs your credentials. That's the Supabase login, cloud storage, row-level security, and the AI server function. Those parts are written and type-checked but have never run against a live project. Test them with the steps in README after you add keys.

## Acceptance criteria

| # | Criterion | Status | How verified |
|---|---|---|---|
| 1 | One photo → complete still-image package | ✅ Working | E2E: 3 captions, headline, overlay, audience, alt text, 3 platform packages, posting windows |
| 2 | Choose photo stays photo vs. video concept | ✅ Working | E2E: 6-option chooser; Generate stays disabled until you choose; photo mode produces no script |
| 3 | Photo-to-video produces a playable MP4 | ⏳ Phase 3 | Motion plan and script ship now, clearly labeled as a storyboard |
| 4 | Multiple clips → analysis grounded in content | ✅ Technical / 🔑 AI | E2E: real durations, orientation, focus and light per sampled frame. Content understanding needs the AI key |
| 5 | Source timestamps not fabricated | ✅ Working | Unit + E2E: every timestamp shown matches a real extracted frame, and the AI validator drops any that don't |
| 6 | Scripts contain complete spoken wording | ✅ Working | E2E: every scene has full "Say" lines |
| 7 | Durations include speaking rate, pauses, demos | ✅ Working | Unit: words, explicit pauses, demo seconds, transitions, end card; adjustable words-per-minute; auto-shortening |
| 8 | Platform outputs distinct and editable | ✅ Working | E2E: three distinct captions and hashtag sets; every field editable |
| 9 | Copy buttons copy the right content | ✅ Working | E2E: clipboard contents checked |
| 10 | Regenerating a hook preserves approved edits | ✅ Working | Unit + E2E: an edited caption survives a hook rewrite |
| 11 | Drafts persist after refresh | ✅ Working | Unit + E2E |
| 12 | LA time correct incl. daylight saving | ✅ Working | Unit: PST/PDT offsets, Nov 1 fall-back, Mar 8 spring-forward; E2E: live clock shows PST |
| 13 | Posting recs show dates, zones, evidence, limits | ✅ Working | E2E: exact dates with zone, evidence label, confidence, data note |
| 14 | Trend claims sourced or labeled unverified | ✅ Working | No trend data is shown. Saved links are labeled "popularity not verified" |
| 15 | Uncertain-rights music not shown as safe | ✅ Working | Audio is suggested as a style only, with a rights check on every package |
| 16 | Missing integrations have manual alternatives | ✅ Working | Template writer, copy and export, saved trend links, links to official libraries |
| 17 | Large uploads show progress and errors | ✅ Working | Per-file progress, clear rejection reasons (E2E: renamed fake JPG), retry |
| 18 | Rendered exports play | ⏳ Phase 3 | Real exports today: .md, .txt, .csv, .srt, .vtt, cover PNG (E2E verified PNG and SRT) |
| 19 | No publish or schedule without authorization | ✅ Working | There is no publishing code in Phase 1 |
| 20 | "Published" only after confirmation | ✅ By design | The schema stores the platform's confirmation; no "Published" state exists yet |
| 21 | Private media inaccessible to others | 🔑 Written, untested live | Owner-only row-level security on every table and storage folder. Verify with two test accounts |
| 22 | Works on narrow phones and foldables | ✅ Working | E2E: no horizontal overflow at 344, 390, 884 and 1440 px |
| 23 | Content without social accounts | ✅ Working | No account connection needed anywhere |
| 24 | No claimed access to ranking algorithms | ✅ Working | All copy reviewed; posting times labeled general guidance |
| 25 | Score not presented as a virality prediction | ✅ Working | Rubric shown on screen with an explicit disclaimer |
| 26 | No fabricated analytics | ✅ Working | Analytics screen shows no numbers until real data exists |
| 27 | Account and media deletion | ✅ Device / 🔑 Cloud | E2E: delete-all empties projects, media and files. Cloud deletion runs through the server function |
| 28 | API failures don't destroy work | ✅ Working | AI failure falls back to the template writer; a version is saved before every regeneration; interrupted jobs are marked for retry |

## Added after Phase 1
| Feature | Status | How verified |
|---|---|---|
| Evolving memory (learns from your edits, cuts, rewrites, rejections) | ✅ Working | Unit tests for capture, learning, fading, user overrides and applying; E2E: a rejected hook is swapped and never returns, reasons are recorded, the panel shows and switches off rules, and reset works |

## Required external credentials
- **Supabase project URL and anon key:** for login, sync and cloud storage. Free tier.
- **Gemini API key** (recommended) **or Claude API key:** for AI analysis and writing. Pay per use; set a spending cap with the provider.

## Integrations that need platform approval (Phase 2–3)
- **TikTok:** a developer app plus a Content Posting API audit. Unaudited apps can only post privately.
- **Instagram:** a Meta app, an Instagram professional account, and app review for publishing and insights permissions. Personal accounts aren't supported.
- **Facebook:** a Meta app and a Page, plus review for `pages_manage_posts` and insights permissions. Personal profiles aren't supported.
- **Trend data:** an approved trend-data provider. Public trend sites are not scraped.
- **Licensed music catalog:** no public API exists. Music stays as guidance until a licensed provider is added.

## Known limitations
- Phase 1 renders no video. Storyboards are labeled as storyboards.
- Subtitle timing is estimated from the script and speaking rate.
- Analysis runs in the browser, so leaving the page mid-analysis stops it. The job is marked "interrupted" with a retry.
- Chrome on Windows and Android may not decode iPhone HEVC `.mov` files. The app explains how to fix this (open in Safari, or set the iPhone camera to "Most Compatible").
- Gemini transcribes speech only for clips of 15 MB or less. Larger clips are analyzed from frames, and you can type what's said.
- This-device mode keeps data in one browser. Clearing site data erases it.
- HEIC conversion uses Safari's built-in decoder, with a library fallback elsewhere. It wasn't covered by the automated test (no HEIC encoder was available here).
- Platform limits in `src/lib/platforms.ts` were checked on 2026-11-14. They change, so re-check them each quarter.
