# Setting up the online backend (Community + Leaderboards)

The game works fully offline on its own. To turn on the **online** features —
sharing your invented cocktails, liking other players' drinks, and the global
**Leaderboards** — you need a free **Supabase** project. This takes about 10
minutes and costs nothing.

You only have to do this once.

---

## What you'll end up with

- A free hosted database that every player's game talks to.
- **Anonymous accounts**: each device automatically gets its own secure account —
  no passwords, no sign-up forms. (We can add "log in with email to sync across
  devices" later if you want.)

---

## Step 1 — Create a Supabase project

1. Go to **https://supabase.com** and click **Start your project** (sign in with
   GitHub is easiest).
2. Click **New project**.
3. Give it a name (e.g. `last-call`), choose a **database password** (save it
   somewhere — you won't need it for the game, but Supabase wants one), and pick
   the region closest to your players.
4. Click **Create new project** and wait ~2 minutes for it to finish setting up.

## Step 2 — Create the database tables

1. In your project, open the **SQL Editor** (left sidebar) → **New query**.
2. Open the file **`supabase/schema.sql`** from this project, copy **all** of it,
   and paste it into the query box.
3. Click **Run**. You should see "Success. No rows returned." That's correct.

## Step 3 — Turn on anonymous sign-ins

1. Go to **Authentication** (left sidebar) → **Sign In / Providers**
   (older dashboards: **Providers**).
2. Find **Anonymous sign-ins** and turn it **on**. Save.

## Step 4 — Copy your two keys into the game

> Supabase recently reorganised this. The **Project URL** and the key now live in
> two different places. The quickest way to get both is the green **Connect**
> button at the top of the dashboard — but here's where each one lives:

**The Project URL:**
- **Project Settings** (gear icon) → **API** → **Project URL**
  (`https://YOURPROJECT.supabase.co`).

**The key** — go to **Project Settings** (gear icon) → **API Keys** (this is its
own page now, separate from "API"). Then pick **one** of these:

- **Easiest (recommended):** click the **Legacy API Keys** tab and copy the
  **`anon` `public`** key — a long string starting with `eyJ...`.
- **Or:** on the **API Keys** (Publishable / Secret) tab, copy the
  **Publishable key** (starts with `sb_publishable_...`).

Then open **`config.js`** in this project and paste both in:

```js
export const SUPABASE_URL = "https://YOURPROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...the-long-anon-key...";
```

> The `anon`/publishable key is **safe** to put here and commit to GitHub — it's
> designed to be public and is protected by the database's security rules.
> **Never** use the **`service_role`** or **`sb_secret_...`** key here.

## Step 5 — Save, commit & deploy

Commit and push `config.js` (and the rest of the project). Once GitHub Pages
updates, the **Community** and **Leaderboard** buttons will be live for everyone.

---

## How to check it's working

1. Open the game, go to **Mixologist**, invent a drink, and on the result screen
   press **🌐 Share**.
2. Open **Community** from the main menu — your drink should appear.
3. Tap the ♥ to like it; open **Leaderboard → Most Liked** to see it ranked.
4. Play on a couple of days to build a streak, then check
   **Leaderboard → Daily Streak**.

If something doesn't show up, open the browser console (F12) and look for a line
starting with `[backend]` — it will say what went wrong (most often: the SQL
wasn't run, or anonymous sign-ins are still off).

---

## A note on the age gate

The **Community** menu button is hidden for under-18 players (it shows
user-shared cocktails). The **Leaderboard** stays available to everyone. If you'd
like different behaviour, just say so.
