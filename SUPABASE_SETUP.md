# Connect Supabase (login, sync, and AI)

About 20 minutes. You'll need: this GitHub repo, a Supabase account (free), and for AI, a Google account.

> Anything you made in "this-device" mode stays in that browser. It won't move into your new account.

## Part 1: Create the Supabase project
1. Go to **supabase.com** → **Start your project** → sign in (signing in with GitHub is easiest).
2. Click **New project**:
   - Name: `contentpilot`
   - Database password: click **Generate a password** and save it in your password manager.
   - Region: **West US** (closest to Los Angeles).
   - Plan: **Free**.
3. Click **Create new project** and wait about 2 minutes until the dashboard loads.

## Part 2: Create the database
4. On GitHub, open `supabase/migrations/001_init.sql` in this repo and use the **Copy raw file** button.
5. In Supabase, open **SQL Editor** (left sidebar) → **New query** → paste → **Run**.
   - If Supabase warns about "destructive operations", that's the script replacing its own security rules. Click **Run this query**.
   - You should see **Success. No rows returned.**
6. Check: open **Table Editor**. You should see `brands`, `projects`, `media_assets` and other tables. Under **Storage** there's a bucket called `media`.

## Part 2b: Memory tables (for learning your style)
Already set up and adding this later? Do just this part. It's safe to run more than once.
1. On a Mac, open https://raw.githubusercontent.com/glamtistop/content/main/supabase/migrations/002_memory.sql, then press ⌘A and ⌘C.
2. In Supabase, go to **SQL Editor** → **New query**. Paste, then click **Run** (if asked, choose **Run and enable RLS**).
3. You should see **Success. No rows returned**, and **Table Editor** should list `decision_events` and `preference_rules`.

Without these tables, the app still works, but it shows "Learning isn't being saved" and forgets what it learned when you close it.

## Part 3: Login settings
7. Go to **Authentication** → **URL Configuration**:
   - **Site URL:** `https://glamtistop.github.io/content/`
   - **Redirect URLs** → **Add URL:** `https://glamtistop.github.io/content/**`
   - Save.
8. Email sign-in is on by default; nothing else to change.

## Part 4: Give the app your project's public keys
9. In Supabase, click **Connect** at the top, or go to **Settings → API Keys**. Copy two values:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - **Publishable key**, which starts with `sb_publishable_`

   Never copy the **secret** key (`sb_secret_…`) anywhere.
10. On GitHub: this repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**. Add two variables, with names typed exactly as shown:
    - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your publishable key
11. Rebuild the site: repo → **Actions** tab → **Deploy ContentPilot to GitHub Pages** → **Run workflow** → **Run workflow**. Wait for the green check (about 2 minutes).

## Part 5: Create your account
12. Open https://glamtistop.github.io/content/ (pull down to refresh if the Home Screen app is open). You'll see a **Sign in** screen.
13. Tap **Create an account**, enter your email and a password (8+ characters), then click the link in the confirmation email.
14. Sign in. The sidebar should say "Signed in as …".

Login and sync now work. Each step below is optional and can be done any time.

## Part 6: Turn on AI
15. **Get a Gemini key:** go to **aistudio.google.com** → **Get API key** → **Create API key**, then copy it.
    - Turn on billing for that key's project. Google's free tier may use your data to improve its models; the paid tier doesn't. Usage costs are small, but add a budget alert in Google Cloud Billing.
16. **Create the server function:** in Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
    - Name it exactly `ai`.
    - Delete the sample code. On GitHub, open `supabase/functions/ai/index.ts`, use **Copy raw file**, and paste.
    - Click **Deploy function** and wait for the success message.
17. **Turn off JWT verification for `ai`:** open the function's settings (its details page) and switch off the JWT verification option. The function checks your login itself, and Supabase's built-in check doesn't work with the new keys.
18. **Add the secrets:** go to **Edge Functions → Secrets** and add:
    - `AI_PROVIDER` = `gemini`
    - `GEMINI_API_KEY` = your key
    - `MONTHLY_AI_CALL_LIMIT` = `300` (a safety cap; raise it later if you need to)

    Click **Save**.
19. **Test it:** in the app → **Integrations & settings** → **Test AI connection**. You should see **Connected: Gemini (gemini-3.6-flash)**.

To use Claude instead, set `AI_PROVIDER` = `anthropic` and `ANTHROPIC_API_KEY` = a key from console.anthropic.com. Claude can't hear audio, so it won't transcribe what's said in your clips.

## If something goes wrong
| What you see | Fix |
|---|---|
| App still has no Sign in screen | Variable names must match exactly. Re-run the workflow (step 11), then refresh. |
| "Couldn't save to brands" | The SQL in step 5 didn't finish. Run it again; it's safe to re-run. |
| Confirmation email never arrives | Check spam. Supabase's built-in email sends only a few per hour. |
| Confirmation link opens a broken page | Re-check the URLs in step 7, including the `/content/` part. |
| Test AI says "Not reachable" | The function must be named `ai` and deployed (step 16), with JWT verification off (step 17). |
| Test AI says "No AI key set on the server" | Re-check the secret names in step 18. |
| Uploads fail with 403 | The `media` bucket policies come from the SQL in step 5. Re-run it. |
