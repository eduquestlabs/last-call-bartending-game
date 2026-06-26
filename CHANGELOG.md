# Changelog

All notable changes to **Last Call** are listed here, newest first.

This project uses simple version numbers: `MAJOR.MINOR.PATCH`
- **PATCH** (e.g. 1.0.1) — small fixes and tweaks
- **MINOR** (e.g. 1.1.0) — new features, fully backward-compatible
- **MAJOR** (e.g. 2.0.0) — big overhauls or changes that rework how the game works

Each version below corresponds to a tagged release on GitHub. To open or download
any past version, go to the repository's **Releases** page and pick that version.

---

## v1.4.0 — Meet Old Tom: the opening comic (2026-06-26)

- **Story intro comic reel**: a short, hand-illustrated cinematic now plays right
  after you sign up and before your first level. **Old Tom**, a veteran duck
  bartender, welcomes a young protégé (in the DAG hoodie) into *The Last Call* on
  a rainy night and teaches the craft — glassware, the pour, shaking vs. stirring,
  a first wobbly pour, and finally handing over the apron: *"The bar's yours
  tonight. Make every pour count."* (Keep an eye out for the rubber-duck cameo.)
- Six full-art panels in a gold comic frame, with a mix of narration captions and
  Old Tom's dialogue, progress dots, **tap-to-continue**, and a **Skip intro**
  option.
- Plays **once** automatically; you can **replay it any time** from
  ⚙ Settings → "🎬 Replay intro story".

---

## v1.3.0 — Journey map, new look & a gentle on-ramp (2026-06-24)

- **New start screen** featuring the DAG.com duck as a cut-out mascot above the
  menu (isolated from the original artwork, transparent background), replacing
  the old plain panel.
- **Candy Crush–style journey map**: a **horizontal** path of numbered stages you
  scroll through. Everyone starts at stage 1; clearing a stage (1★ or better)
  unlocks the next. Cleared stages show the stars you earned, the current stage
  pulses, and later stages stay locked.
- **Walking duck avatar**: the DAG.com duck stands on your current stage and, every
  time you clear one, **waddles along the map to the next stage** (with a little
  step sound) before you tap in to play it.
- **Metric or imperial measurements**: pick **ml** or **oz** when you register, and
  the whole game (pour steppers, scoring feedback, drink volumes) shows your chosen
  units. Drinks are stored in ml under the hood, so switching is lossless.
- **New Settings screen** (⚙ from the menu): change measurement units, turn sound
  effects and bar ambience on/off (your sound choice is remembered between visits),
  edit your profile, switch user, or log out.
- **Ranks**: the path is grouped into ranks of **8 stages** (Trainee → Barback →
  Bartender → Mixologist → Head Bartender → Master → Legend), with a celebration
  when you rank up.
- **Start-simple ramp**: early stages are pure ingredient-guessing from a short
  menu with **no measuring**. As you climb, mechanics unlock one at a time —
  ml portions → prep method → **garnish** → glass selection — so complexity
  scales naturally. In guess stages the drink still pours the **correct recipe
  portions** so the glass looks realistic even though you aren't dialling amounts.
- **Garnishing is automatic at first** and only becomes a manual step from the
  Garnish tier (stage 20+); auto garnishes no longer float on an empty glass.
- **Gentler measurement scoring**: being slightly off on a pour is forgiven more
  the deeper you get into the journey, and a small miss is now flagged kindly
  ("a bit much / a bit light") instead of a hard "off".
- **Judges now taste every cocktail** (not just Mixologist inventions): each
  result screen shows a 3-of-10 judges' reaction panel with their scores and
  comments. From the moment you control the pour, their verdict **blends into
  your stars** (75% recipe accuracy / 25% the panel's taste); in the early
  guess-only stages they react for flavour and personality without affecting
  your stars.
- Manual Basic/Advanced selection is retired (difficulty now follows the map).
  **Mixologist** and **Endless Shift** unlock after clearing 5 stages.
- **Level-up & rules-change messages**: a full-screen card now announces rank-ups
  and, the first time a new rule unlocks (measuring, choosing the method, the
  garnish, then the glass), explains exactly what's new and what to do next.

---

## v1.2.1 — Backend connected (2026-06-24)

- Connected the live Supabase backend, so **Community** and **Leaderboards** are
  now online for everyone.
- Fixed the Community feed query: it was ambiguous about how creations link to
  players (the leaderboard views relate the same two tables), so it's now pinned
  to the right relationship. Sharing, liking and both leaderboards verified
  end-to-end.

---

## v1.2.0 — Online backend: Community & Leaderboards (2026-06-24)

Adds the foundation for the game's online features. This ships the code and the
in-game screens; the online features switch on once a (free) Supabase backend is
connected — see **SETUP-BACKEND.md** for the one-time setup.

### New
- **Community** — share your invented cocktails and browse, like (♥) and discover
  drinks made by other players. Sort by **Top** (most liked) or **Newest**.
- **Leaderboards** — two tabs: **Most Liked** creations and **Daily Streak**.
- **Online accounts** — anonymous, frictionless sign-in (each device gets its own
  secure account); player name, location, level and best streak sync to the
  leaderboard.
- **Share** buttons on the Mixologist result and on each saved drink in **My Bar**.

### Notes
- Until a backend is connected, the game runs exactly as before and the Community
  / Leaderboard screens show a friendly "not connected yet" message.
- The Community button is hidden for under-18 players; the Leaderboard stays
  available to everyone.
- Built with Supabase (hosted Postgres + auth), loaded from a CDN so the project
  stays zero-build.

---

## v1.1.0 — Profiles, mocktails, progression & judges (2026-06-24)

A big content and progression update. Everything still runs as a static site
(no servers or accounts yet — that's planned for a later release).

### Players & access
- **Profile / age gate** — first-time players set up a profile (name, age,
  location, email or unique ID). Saved on the device for now.
- **Age filtering** — under-18 players get a **mocktail-only** experience with
  all alcohol hidden across every mode; adults get the full bar.

### New content
- **12 mocktails** (Virgin Sunrise, Shirley Temple, Virgin Piña Colada, Virgin
  Mojito, Virgin Mary, and more).
- **Shots section** — B-52, Baby Guinness, Kamikaze, Lemon Drop, Green Tea Shot.
- Every drink now has a **difficulty rating** (easy → expert) based on its number
  of ingredients and preparation method; the **Recipe Book** is grouped into
  sections (Cocktails / Shots / Mocktails) and ordered easy-first.

### Progression & the core loop
- **Levels & XP** — earn XP for every drink you serve; a level bar shows progress.
- **Unlocks** — Advanced & Endless unlock at level 2, Mixologist at level 3.
- **Cocktail of the Day** — a fresh daily drink with no repeats, plus a bonus.
- **Daily streak** — keep your streak alive by playing each day.
- **Badges** — 10 achievements (first pour, three stars, streaks, level
  milestones, inventor, daily habit, and more) on a dedicated Badges screen.

### Invent-a-mix judging
- **Judges panel** — the Mixologist mode is now scored by a rotating panel of
  judges (3 of 10, each with their own palate and comments) instead of a single
  evaluator score.

### Still to come (needs a backend)
- Community sharing of your inventions, likes/feedback, and global leaderboards
  (most-likes and daily-streak tabs), plus real accounts that sync across devices.

---

## v1.0.0 — First release (2026-06-20)

The first official, versioned release of the game.

### Game modes
- **Basic** — pick ingredients and garnish; the glass and method are chosen for you.
- **Advanced** — you choose everything: glass, pour, method and garnish.
- **Mixologist** — a free-pour sandbox where you invent your own cocktail and an
  evaluator scores it on balance, strength, technique, glass fit and garnish,
  with coaching tips and "you just invented a…" classic recognition.
- **Training** — a guided lesson with a step-by-step coach that highlights the
  correct choice at each step, so new players learn how to build a cocktail.
- **Endless Shift** — serve random customer orders for points with lives and streaks.

### Content
- **50 cocktails** spanning the canonical classics, ordered easy → hard.
- **58 ingredients** including spirits, liqueurs, juices, mixers, syrups, bitters,
  dairy/egg and herbs/spice, each with mixology metadata for the evaluator.
- **Recipe Book** to browse every cocktail.
- **My Bar** to save your own inventions and recreate them later.

### Presentation & extras
- Animated bar station with SVG glassware, pouring, mixing and garnish animations.
- Programmatic sound effects plus a toggleable ambient bar loop.
- Progress bar, animated points counter and persistent high scores.
- Metric (ml) measurements throughout.
- Mobile-friendly layout that fits the screen without scrolling.
