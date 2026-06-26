import {
  GLASSES,
  METHODS,
  INGREDIENTS,
  GARNISHES,
  RECIPES,
  MOCKTAILS,
  SHOTS,
  CUSTOMERS,
  INGREDIENT_BY_ID,
  GLASS_BY_ID,
  METHOD_BY_ID,
  GARNISH_BY_ID,
} from "./data.js";
import { Sound } from "./sound.js";
import * as Glass from "./glass.js";
import { evaluate } from "./mixology.js";
import { scoreWithJudges, pickJudges } from "./judges.js";
import * as Backend from "./backend.js";

// ============================ Game state ============================
const state = {
  difficulty: "basic", // 'basic' | 'advanced' | 'mixologist'
  mode: "campaign", // 'campaign' | 'mixologist' | 'challenge' | 'endless'
  challenge: null, // recipe object when recreating a saved invention
  stage: 0,
  totalScore: 0,
  starsEarned: 0,
  steps: [],
  stepIndex: 0,
  mixed: false, // true once a shake/stir/blend has blended the liquids
  build: emptyBuild(),
  // Endless shift
  lives: 3,
  streak: 0,
  bestStreak: 0,
  served: 0,
  endlessRecipe: null,
  lastEndlessIdx: -1,
  customer: null,
  trainingRecipe: null,
  cotdRecipe: null, // Cocktail of the Day target
  mixJudges: null, // judging panel result for the current invention
  complexity: null, // active complexity profile (portions/glass/method/menu)
  menuIds: null, // curated ingredient menu (Set of ids) or null for full pantry
};

const STRICTNESS = "balanced";

function emptyBuild() {
  return { glass: null, method: null, garnish: null, ingredients: [] };
}

// ============================ Player profile / age gate ============================
const PROFILE_KEY = "lastcall_profile";
const LEGAL_AGE = 18; // drinking-age threshold; under this = mocktails only

function getProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch (e) { return null; }
}
function setProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}
function isUnderage() {
  const p = getProfile();
  return !!p && Number(p.age) < LEGAL_AGE;
}
function genId() {
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// ---- Measurement units (metric ml / imperial oz) ----
// Liquids are always stored internally in ml; this layer converts for display.
const ML_PER_OZ = 29.5735;
function useImperial() { const p = getProfile(); return !!(p && p.units === "imperial"); }
function dispAmount(unit, ml) {
  if (unit === "ml" && useImperial()) return { val: Math.round((ml / ML_PER_OZ) * 4) / 4, label: "oz" };
  return { val: ml, label: unit };
}
function dispStep(unit) { return unit === "ml" ? (useImperial() ? 0.25 : 5) : 1; }
function toMl(unit, dispVal) { return (unit === "ml" && useImperial()) ? dispVal * ML_PER_OZ : dispVal; }

// ---- App settings (sound preferences) ----
const SETTINGS_KEY = "lastcall_settings";
function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || { sound: true }; }
  catch (e) { return { sound: true }; }
}
function setSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

// Intro comic: shown once after sign-up, before the first level (replayable in Settings).
const INTRO_KEY = "lastcall_intro_seen";
function introSeen() { try { return localStorage.getItem(INTRO_KEY) === "1"; } catch (e) { return false; } }
function markIntroSeen() { try { localStorage.setItem(INTRO_KEY, "1"); } catch (e) { /* ignore */ } }

// Reflect the saved profile on the start screen (greeting + mocktail badge).
function applyProfile() {
  const p = getProfile();
  const bar = $("#profile-bar");
  const chip = $("#profile-chip");
  const banner = $("#mocktail-banner");
  if (p && bar && chip) {
    bar.style.display = "";
    chip.textContent = `👤 ${p.name}${p.age ? " · " + p.age : ""}${isUnderage() ? " · 🧃" : " · 🔞"}`;
  } else if (bar) {
    bar.style.display = "none";
  }
  if (banner) banner.style.display = isUnderage() ? "" : "none";
  const footer = $("#start-footer");
  if (footer) {
    const noun = isUnderage() ? "mocktails" : "drinks";
    footer.innerHTML = `🍸 ${drinkPool().length} ${noun} &nbsp;•&nbsp; precision pours &nbsp;•&nbsp; earn your stars`;
  }
}

// ============================ Drink pools & difficulty ============================
// Difficulty is derived from ingredient count + preparation complexity.
function methodWeight(m) {
  return { build: 0, stir: 0.5, shake: 0.5, blend: 0.5, muddle: 1 }[m] ?? 0.5;
}
function computeDifficulty(r) {
  const raw = r.ingredients.length + methodWeight(r.method);
  if (raw <= 2.5) return 1;
  if (raw <= 3.5) return 2;
  if (raw <= 4.5) return 3;
  if (raw <= 5.5) return 4;
  return 5;
}
const TIER_LABEL = { 1: "Easy", 2: "Easy", 3: "Medium", 4: "Hard", 5: "Expert" };

let POOL_ADULT = [];
let POOL_UNDER = [];
function tagDrinks(list, kind) {
  list.forEach((r) => { r.kind = kind; r.diff = computeDifficulty(r); });
}
function buildPools() {
  tagDrinks(RECIPES, "cocktail");
  tagDrinks(SHOTS, "shot");
  tagDrinks(MOCKTAILS, "mocktail");
  // Stable sort easy -> hard (Array.sort is stable in modern engines).
  POOL_ADULT = [...RECIPES, ...SHOTS].sort((a, b) => a.diff - b.diff);
  POOL_UNDER = [...MOCKTAILS].sort((a, b) => a.diff - b.diff);
}
buildPools();
function drinkPool() {
  return isUnderage() ? POOL_UNDER : POOL_ADULT;
}

// ============================ Stage map / ranks / complexity ============================
const MAP_KEY = "lastcall_map";
const STAGES_PER_RANK = 8;
const STAGES_TO_UNLOCK = 5; // clear this many to unlock Endless + Mixologist
const RANKS = [
  { emoji: "🧽", name: "Trainee" },
  { emoji: "🍋", name: "Barback" },
  { emoji: "🥃", name: "Bartender" },
  { emoji: "🍸", name: "Mixologist" },
  { emoji: "🎩", name: "Head Bartender" },
  { emoji: "🏆", name: "Master Mixologist" },
  { emoji: "👑", name: "Bar Legend" },
];
function rankInfo(idx) { return RANKS[Math.min(Math.max(0, idx), RANKS.length - 1)]; }
function rankForCleared(count) { return Math.floor((count || 0) / STAGES_PER_RANK); }

function getMap() {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || "null") || { cleared: 0, stars: {} }; }
  catch (e) { return { cleared: 0, stars: {} }; }
}
function setMap(m) { try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } }
function totalStars() { return Object.values(getMap().stars || {}).reduce((a, b) => a + (b || 0), 0); }
function mapUnlocked() { return getMap().cleared >= STAGES_TO_UNLOCK; }

// What's new at each complexity tier — shown once when first reached.
const TIER_INTRO = {
  "Guess": { emoji: "🔎", eyebrow: "Your first stage", title: "Spot the ingredients", body: "Tap the ingredients you think belong in the drink — no measuring yet. Get the right ones in the glass, add a garnish, then serve.", button: "Let's pour →" },
  "Pour": { emoji: "🥤", eyebrow: "Level up — new rule", title: "Now measure your pours", body: "From here on you set how much of each ingredient goes in. Tap to add, then use − / + to dial each amount. Get close to the recipe for more stars.", button: "Got it →" },
  "Mix": { emoji: "🍸", eyebrow: "Level up — new rule", title: "Now choose the method", body: "A new step appears: pick how to combine the drink — shake, stir, build, muddle or blend. Choose the technique that suits the cocktail.", button: "Got it →" },
  "Garnish": { emoji: "🍋", eyebrow: "Level up — new rule", title: "Now add the garnish", body: "Until now the garnish was added for you. From here you finish the drink yourself — pick the garnish that matches the cocktail for that last star.", button: "Got it →" },
  "Full bar": { emoji: "🍷", eyebrow: "Level up — full bar", title: "Now pick the glass too", body: "You're running the full bar: choose the glassware, the pour, the method and the garnish yourself. Every choice counts toward your stars.", button: "Got it →" },
};
function tierSeen(label) { const m = getMap(); return !!(m.seenTiers && m.seenTiers[label]); }
function markTierSeen(label) { const m = getMap(); m.seenTiers = m.seenTiers || {}; m.seenTiers[label] = 1; setMap(m); }

// Complexity ramp — start simple, scale up. stageNo is 1-based.
// New mechanics unlock one at a time: measure → method → garnish → glass.
function complexityForStage(stageNo) {
  if (stageNo <= 5)  return { portions: false, chooseGlass: false, chooseMethod: false, chooseGarnish: false, decoys: 3,  label: "Guess" };
  if (stageNo <= 12) return { portions: true,  chooseGlass: false, chooseMethod: false, chooseGarnish: false, decoys: 6,  label: "Pour" };
  if (stageNo <= 19) return { portions: true,  chooseGlass: false, chooseMethod: true,  chooseGarnish: false, decoys: 10, label: "Mix" };
  if (stageNo <= 26) return { portions: true,  chooseGlass: false, chooseMethod: true,  chooseGarnish: true,  decoys: 12, label: "Garnish" };
  return { portions: true, chooseGlass: true, chooseMethod: true, chooseGarnish: true, decoys: Infinity, label: "Full bar" };
}

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Curated short ingredient menu: the required ones + a few decoys, shuffled.
function buildMenu(recipe, decoys) {
  if (decoys === Infinity) return null; // null = show the full pantry
  const pantry = isUnderage() ? INGREDIENTS.filter((i) => (i.mx?.abv || 0) === 0) : INGREDIENTS;
  const required = recipe.ingredients.map((i) => i.id);
  const reqSet = new Set(required);
  const decoyPool = shuffleArr(pantry.filter((i) => !reqSet.has(i.id)).map((i) => i.id)).slice(0, decoys);
  return new Set(shuffleArr([...required, ...decoyPool]));
}

function stepsFor(cx) {
  const s = [];
  if (cx.chooseGlass) s.push("glass");
  s.push("ingredients");
  if (cx.chooseMethod) s.push("method");
  if (cx.chooseGarnish) s.push("garnish");
  return s;
}

// Apply a complexity profile to the current build: auto-fill what isn't chosen.
function applyComplexity(cx, recipe) {
  state.complexity = cx;
  if (!cx.chooseGlass) state.build.glass = recipe.glass;
  if (!cx.chooseMethod) state.build.method = recipe.method;
  if (!cx.chooseGarnish) state.build.garnish = recipe.garnish[0];
  state.menuIds = buildMenu(recipe, cx.decoys);
  state.steps = stepsFor(cx);
  state.stepIndex = 0;
}

// ============================ Progression / XP / unlocks ============================
const PROGRESS_KEY = "lastcall_progress";
const XP_PER_LEVEL = 120;
const UNLOCKS = { endless: 2, advanced: 2, mixologist: 3 };

function getProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null") || { xp: 0, served: 0, perfects: 0 }; }
  catch (e) { return { xp: 0, served: 0, perfects: 0 }; }
}
function setProgress(p) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }
function levelForXp(xp) { return 1 + Math.floor((xp || 0) / XP_PER_LEVEL); }
function isUnlocked(key) { return levelForXp(getProgress().xp) >= (UNLOCKS[key] || 1); }

function recordResult(result) {
  const p = getProgress();
  p.xp = (p.xp || 0) + (result.stagePoints || 0) + (result.tip || 0);
  p.served = (p.served || 0) + 1;
  if (result.stars === 3) p.perfects = (p.perfects || 0) + 1;
  setProgress(p);
  checkBadges();
}

// ============================ Daily streak ============================
const DAILY_KEY = "lastcall_daily";
function todayStr() { return new Date().toISOString().slice(0, 10); }
function ydayStr() { return new Date(Date.now() - 86400000).toISOString().slice(0, 10); }
function getDaily() {
  try { return JSON.parse(localStorage.getItem(DAILY_KEY) || "null") || { last: null, streak: 0, best: 0, days: 0 }; }
  catch (e) { return { last: null, streak: 0, best: 0, days: 0 }; }
}
function setDaily(d) { try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }
function recordPlayDay() {
  const d = getDaily();
  const t = todayStr();
  if (d.last === t) return d;
  d.streak = d.last === ydayStr() ? (d.streak || 0) + 1 : 1;
  d.best = Math.max(d.best || 0, d.streak);
  d.days = (d.days || 0) + 1;
  d.last = t;
  setDaily(d);
  checkBadges();
  return d;
}

// ============================ Cocktail of the Day ============================
const COTD_KEY = "lastcall_cotd";
function getCotd() {
  try { return JSON.parse(localStorage.getItem(COTD_KEY) || "null") || { date: null, id: null, queue: [], doneDate: null, count: 0 }; }
  catch (e) { return { date: null, id: null, queue: [], doneDate: null, count: 0 }; }
}
function setCotd(c) { try { localStorage.setItem(COTD_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } }
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
// Returns { recipe, done } for today. Picks from a no-repeat shuffled queue.
function todaysCotd() {
  const pool = drinkPool();
  const c = getCotd();
  const t = todayStr();
  if (c.date === t && c.id) {
    const r = pool.find((x) => x.id === c.id);
    if (r) return { recipe: r, done: c.doneDate === t };
  }
  let queue = (c.queue || []).filter((id) => pool.some((r) => r.id === id));
  if (!queue.length) queue = shuffle(pool.map((r) => r.id));
  const id = queue.shift();
  setCotd({ date: t, id, queue, doneDate: c.doneDate, count: c.count || 0 });
  return { recipe: pool.find((r) => r.id === id), done: false };
}
function markCotdDone() {
  const c = getCotd();
  if (c.doneDate !== todayStr()) { c.count = (c.count || 0) + 1; }
  c.doneDate = todayStr();
  setCotd(c);
  checkBadges();
}

// ============================ Badges ============================
const BADGES = [
  { id: "first_serve", emoji: "🍸", name: "First Pour", desc: "Serve your first drink", test: (s) => s.served >= 1 },
  { id: "three_star", emoji: "⭐", name: "Three Stars", desc: "Earn a 3-star drink", test: (s) => s.perfects >= 1 },
  { id: "served_25", emoji: "🍹", name: "Getting Busy", desc: "Serve 25 drinks", test: (s) => s.served >= 25 },
  { id: "served_100", emoji: "🏆", name: "Centurion", desc: "Serve 100 drinks", test: (s) => s.served >= 100 },
  { id: "level_3", emoji: "📈", name: "Rising Star", desc: "Reach level 3", test: (s) => levelForXp(s.xp) >= 3 },
  { id: "level_5", emoji: "🌟", name: "Seasoned Pro", desc: "Reach level 5", test: (s) => levelForXp(s.xp) >= 5 },
  { id: "streak_3", emoji: "🔥", name: "On a Roll", desc: "3-day streak", test: (s, d) => (d.best || 0) >= 3 },
  { id: "streak_7", emoji: "🗓️", name: "Regular", desc: "7-day streak", test: (s, d) => (d.best || 0) >= 7 },
  { id: "inventor", emoji: "🧪", name: "Inventor", desc: "Save an invention to My Bar", test: () => getMyBar().length > 0 },
  { id: "cotd_5", emoji: "📅", name: "Daily Habit", desc: "Play 5 Cocktails of the Day", test: (s, d, c) => (c.count || 0) >= 5 },
];
const BADGE_KEY = "lastcall_badges";
function getEarned() { try { return JSON.parse(localStorage.getItem(BADGE_KEY) || "[]"); } catch (e) { return []; } }
function setEarned(a) { try { localStorage.setItem(BADGE_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } }
function checkBadges() {
  const s = getProgress(), d = getDaily(), c = getCotd();
  const earned = new Set(getEarned());
  const newly = [];
  BADGES.forEach((b) => { if (!earned.has(b.id) && b.test(s, d, c)) { earned.add(b.id); newly.push(b); } });
  if (newly.length) setEarned([...earned]);
  return newly;
}

// ============================ Start-screen meta UI ============================
function applyLock(sel, unlocked, lvl) {
  const el = $(sel);
  if (!el) return;
  el.classList.toggle("is-locked", !unlocked);
  let lock = el.querySelector(".diff-lock");
  if (!unlocked) {
    if (!lock) { lock = document.createElement("span"); lock.className = "diff-lock"; el.appendChild(lock); }
    lock.textContent = `🔒 Lv ${lvl}`;
  } else if (lock) {
    lock.remove();
  }
}

function renderStartMeta() {
  const prog = getProgress();
  const lvl = levelForXp(prog.xp);
  const inLvl = (prog.xp || 0) % XP_PER_LEVEL;
  const daily = getDaily();

  const lvlEl = $("#meta-level");
  if (lvlEl) lvlEl.textContent = `Lv ${lvl}`;
  const xpFill = $("#meta-xp-fill");
  if (xpFill) xpFill.style.width = Math.round((inLvl / XP_PER_LEVEL) * 100) + "%";
  const xpText = $("#meta-xp-text");
  if (xpText) xpText.textContent = `${inLvl} / ${XP_PER_LEVEL} XP`;
  const streakEl = $("#meta-streak");
  if (streakEl) streakEl.textContent = daily.streak > 0 ? `🔥 ${daily.streak}-day streak` : "Play daily for a streak";

  // Cocktail of the Day
  const { recipe, done } = todaysCotd();
  const cotdName = $("#cotd-name");
  if (cotdName && recipe) cotdName.textContent = recipe.name;
  const cotdBtn = $("#btn-cotd");
  if (cotdBtn) {
    cotdBtn.textContent = done ? "Done today ✓" : "Make it →";
    cotdBtn.classList.toggle("is-done", !!done);
  }

  // Unlock gating — Endless & Mixologist open after a few cleared stages.
  const ok = mapUnlocked();
  const left = Math.max(0, STAGES_TO_UNLOCK - getMap().cleared);
  const endlessBtn = $("#btn-endless");
  if (endlessBtn) {
    endlessBtn.classList.toggle("is-locked", !ok);
    endlessBtn.textContent = ok ? "🔥 Endless Shift" : `🔒 Endless · ${left} to go`;
  }
  const mixBtn = $("#btn-mixologist");
  if (mixBtn) {
    mixBtn.classList.toggle("is-locked", !ok);
    mixBtn.textContent = ok ? "🧪 Mixologist" : `🔒 Mixologist · ${left} to go`;
  }
  const badgeBtn = $("#btn-badges");
  if (badgeBtn) badgeBtn.textContent = `🏅 Badges (${getEarned().length}/${BADGES.length})`;
  // Community surfaces user-shared cocktails, so hide it for underage players.
  const commBtn = $("#btn-community");
  if (commBtn) commBtn.style.display = isUnderage() ? "none" : "";
}

// Combined refresh whenever we land on the start screen.
function onShowStart() {
  applyProfile();
  renderStartBest();
  renderStartMeta();
  syncBackendStats();
}

// ============================ Backend (Community + Leaderboards) ============================
function syncBackendStats() {
  if (!Backend.isReady()) return;
  const p = getProfile();
  const prog = getProgress();
  const d = getDaily();
  Backend.syncStats({
    bestStreak: d.best || 0,
    level: levelForXp(prog.xp),
    xp: prog.xp || 0,
    name: p && p.name,
    location: p && p.location,
  });
}

const NOT_CONNECTED = "🌐 Online features aren't connected yet — a backend still needs to be set up.";
let communitySort = "top";
let communityLikes = new Set();

async function renderCommunity() {
  const notice = $("#community-notice");
  const list = $("#community-list");
  list.innerHTML = "";
  if (!Backend.isConfigured()) { notice.style.display = ""; notice.textContent = NOT_CONNECTED; return; }
  notice.style.display = "none";
  list.innerHTML = `<p class="backend-notice">Loading…</p>`;
  if (!Backend.isReady()) await Backend.initBackend(getProfile());
  if (!Backend.isReady()) { list.innerHTML = `<p class="backend-notice">Couldn't connect right now.</p>`; return; }
  try {
    const [items, liked] = await Promise.all([Backend.listCommunity(communitySort), Backend.myLikedIds()]);
    communityLikes = liked;
    if (!items.length) { list.innerHTML = `<p class="backend-notice">No creations yet — be the first to share one from Mixologist mode!</p>`; return; }
    list.innerHTML = "";
    items.forEach((it) => list.appendChild(communityCard(it)));
  } catch (e) {
    list.innerHTML = `<p class="backend-notice">Couldn't load the community right now.</p>`;
  }
}

function communityCard(it) {
  const liked = communityLikes.has(it.id);
  const ings = (it.recipe && it.recipe.ingredients ? it.recipe.ingredients : [])
    .map((i) => { const ing = INGREDIENT_BY_ID[i.id]; return ing ? ing.name : i.id; })
    .slice(0, 6).join(", ");
  const who = (it.players && it.players.name) || "Anonymous";
  const card = document.createElement("div");
  card.className = "comm-item";
  card.innerHTML = `
    <div class="comm-top">
      <span class="comm-name">${escapeHtml(it.name)}</span>
      <button class="like-btn ${liked ? "is-liked" : ""}" data-id="${it.id}">${liked ? "♥" : "♡"} <span>${it.like_count}</span></button>
    </div>
    <div class="comm-meta">by ${escapeHtml(who)} · ${it.score}/100${it.family ? " · " + escapeHtml(it.family) : ""}</div>
    <div class="comm-ings">${escapeHtml(ings)}</div>`;
  card.querySelector(".like-btn").addEventListener("click", onLikeClick);
  return card;
}

async function onLikeClick(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const wasLiked = btn.classList.contains("is-liked");
  btn.disabled = true;
  try {
    const now = await Backend.toggleLike(id, wasLiked);
    const span = btn.querySelector("span");
    const count = Math.max(0, parseInt(span.textContent, 10) + (now ? 1 : -1));
    btn.classList.toggle("is-liked", now);
    btn.innerHTML = `${now ? "♥" : "♡"} <span>${count}</span>`;
    if (now) communityLikes.add(id); else communityLikes.delete(id);
    Sound.click();
  } catch (err) {
    showToast("Couldn't register your vote.");
  }
  btn.disabled = false;
}

let lbBoard = "likes";
async function renderLeaderboard() {
  const notice = $("#leaderboard-notice");
  const list = $("#leaderboard-list");
  list.innerHTML = "";
  if (!Backend.isConfigured()) { notice.style.display = ""; notice.textContent = NOT_CONNECTED; return; }
  notice.style.display = "none";
  list.innerHTML = `<p class="backend-notice">Loading…</p>`;
  if (!Backend.isReady()) await Backend.initBackend(getProfile());
  if (!Backend.isReady()) { list.innerHTML = `<p class="backend-notice">Couldn't connect right now.</p>`; return; }
  try {
    if (lbBoard === "likes") {
      const rows = await Backend.leaderboardLikes();
      if (!rows.length) { list.innerHTML = `<p class="backend-notice">No shared creations yet.</p>`; return; }
      list.innerHTML = rows.map((r, i) => `
        <div class="lb-row">
          <span class="lb-rank">${rankMedal(i)}</span>
          <span class="lb-main"><strong>${escapeHtml(r.name)}</strong><small>by ${escapeHtml(r.player_name || "Anonymous")}</small></span>
          <span class="lb-val">❤ ${r.like_count}</span>
        </div>`).join("");
    } else {
      const rows = await Backend.leaderboardStreak();
      if (!rows.length) { list.innerHTML = `<p class="backend-notice">No streaks yet — play daily to climb!</p>`; return; }
      list.innerHTML = rows.map((r, i) => `
        <div class="lb-row">
          <span class="lb-rank">${rankMedal(i)}</span>
          <span class="lb-main"><strong>${escapeHtml(r.player_name || "Anonymous")}</strong><small>Lv ${r.level}${r.location ? " · " + escapeHtml(r.location) : ""}</small></span>
          <span class="lb-val">🔥 ${r.best_streak}</span>
        </div>`).join("");
    }
  } catch (e) {
    list.innerHTML = `<p class="backend-notice">Couldn't load the leaderboard right now.</p>`;
  }
}
function rankMedal(i) { return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i + 1); }

async function shareCreationToCommunity(payload, btn) {
  if (!Backend.isConfigured()) { showToast("Online sharing isn't connected yet."); return; }
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Sharing…"; }
  try {
    if (!Backend.isReady()) await Backend.initBackend(getProfile());
    await Backend.shareCreation(payload);
    if (btn) btn.textContent = "Shared ✓";
    Sound.coin();
    showToast("Shared to the community!");
  } catch (e) {
    if (btn) { btn.textContent = original; btn.disabled = false; }
    showToast("Couldn't share right now.");
  }
}

// ============================ Cocktail of the Day (play) ============================
function loadCotd() {
  const { recipe } = todaysCotd();
  if (!recipe) return;
  state.mode = "cotd";
  state.cotdRecipe = recipe;
  state.challenge = null;
  state.build = emptyBuild();
  state.mixed = false;
  // Daily uses the player's current ramp difficulty.
  applyComplexity(complexityForStage(getMap().cleared + 1), recipe);
  $(".progress-wrap").style.display = "none";
  $("#endless-hud").style.display = "none";
  clearCustomer();
  $("#ticket-label").textContent = "Cocktail of the Day";
  $("#stage-pill").textContent = "🍹 Daily";
  $("#diff-pill").textContent = state.complexity.label;
  $("#order-name").textContent = recipe.name;
  $("#order-desc").textContent = recipe.order;
  recordPlayDay();
  renderStation();
  enterStep();
  showScreen("screen-game");
}

// ============================ Badges screen ============================
function renderBadges() {
  const earned = new Set(getEarned());
  const el = $("#badges-list");
  if (!el) return;
  const sub = $("#badges-sub");
  if (sub) sub.textContent = `${earned.size} of ${BADGES.length} earned`;
  el.innerHTML = "";
  BADGES.forEach((b) => {
    const has = earned.has(b.id);
    const card = document.createElement("div");
    card.className = "badge-item" + (has ? " is-earned" : "");
    card.innerHTML =
      `<span class="badge-emoji">${has ? b.emoji : "🔒"}</span>` +
      `<span class="badge-name">${b.name}</span>` +
      `<span class="badge-desc">${b.desc}</span>`;
    el.appendChild(card);
  });
}

// ============================ Stage map (journey) ============================
function renderMap() {
  const path = $("#map-path");
  if (!path) return;
  const pool = drinkPool();
  const map = getMap();
  const cleared = map.cleared || 0;

  // Header: current rank + total stars.
  const rk = rankInfo(rankForCleared(cleared));
  $("#map-rank-emoji").textContent = rk.emoji;
  $("#map-rank-name").textContent = rk.name;
  $("#map-stars-total").textContent = `★ ${totalStars()}`;

  path.innerHTML = "";
  let lastRank = -1;
  const nodeEls = [];

  pool.forEach((recipe, i) => {
    const rankIdx = rankForCleared(i);
    if (rankIdx !== lastRank) {
      lastRank = rankIdx;
      const info = rankInfo(rankIdx);
      const div = document.createElement("div");
      div.className = "map-rank-divider" + (i > cleared ? " is-locked" : "");
      div.innerHTML =
        `<span class="rd-emoji">${info.emoji}</span>` +
        `<span class="rd-name">${info.name}</span>` +
        `<span class="rd-tag">Stages ${rankIdx * STAGES_PER_RANK + 1}–${Math.min(pool.length, (rankIdx + 1) * STAGES_PER_RANK)}</span>`;
      path.appendChild(div);
    }

    const done = i < cleared;
    const current = i === cleared;
    const locked = i > cleared;
    const stars = map.stars[i] || 0;

    const node = document.createElement("button");
    node.className = "map-node" + (done ? " is-done" : current ? " is-current" : " is-locked");
    const starHtml = done
      ? [0, 1, 2].map((s) => `<span class="${s < stars ? "on" : ""}">★</span>`).join("")
      : "";
    node.innerHTML =
      `<span class="map-stars">${starHtml}</span>` +
      `<span class="map-coin">${locked ? "🔒" : i + 1}</span>` +
      `<span class="map-node-label">${recipe.name}</span>`;
    if (!locked) {
      node.addEventListener("click", () => {
        Sound.click();
        startStageFromMap(i);
      });
    } else {
      node.addEventListener("click", () => { Sound.fail(); showToast("🔒 Clear the stage before it to unlock this one."); });
    }
    path.appendChild(node);
    nodeEls[i] = node;
  });

  // Position (and possibly walk) the duck avatar once the screen is visible.
  setTimeout(() => placeDuck(path, nodeEls, cleared), 40);
}

// The duck avatar sits on the player's current stage and waddles to the next
// one whenever a stage was just cleared (pendingWalk).
function placeDuck(path, nodeEls, cleared) {
  let duck = path.querySelector(".map-duck");
  if (!duck) {
    duck = document.createElement("div");
    duck.className = "map-duck";
    duck.innerHTML = `<img src="assets/duck.png" alt="" draggable="false">`;
    path.appendChild(duck);
  }
  const coinCenter = (node) => {
    const coin = node.querySelector(".map-coin");
    return {
      x: node.offsetLeft + coin.offsetLeft + coin.offsetWidth / 2,
      y: node.offsetTop + coin.offsetTop + coin.offsetHeight / 2,
    };
  };
  const walk = pendingWalk;
  pendingWalk = null;
  const fromN = walk && nodeEls[walk.from];
  const toN = walk && nodeEls[walk.to];

  if (fromN && toN) {
    const a = coinCenter(fromN);
    const b = coinCenter(toN);
    duck.style.left = a.x + "px";
    duck.style.top = a.y + "px";
    duck.classList.remove("is-walking");
    void duck.offsetWidth; // reflow so the start position takes hold
    duck.classList.add("is-walking");
    if (Sound.step) Sound.step(); else Sound.click();
    requestAnimationFrame(() => {
      duck.style.left = b.x + "px";
      duck.style.top = b.y + "px";
    });
    setTimeout(() => duck.classList.remove("is-walking"), 1500);
    setTimeout(() => toN.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }), 120);
  } else {
    const idx = Math.min(cleared, nodeEls.length - 1);
    const n = nodeEls[idx];
    if (!n) return;
    const c = coinCenter(n);
    duck.style.left = c.x + "px";
    duck.style.top = c.y + "px";
    setTimeout(() => n.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" }), 30);
  }
}

function startStageFromMap(index) {
  state.totalScore = 0;
  state.starsEarned = 0;
  displayedScore = 0;
  loadStage(index);
}

// ============================ Rank-up celebration ============================
let pendingRankUp = null;
let pendingWalk = null; // { from, to } — duck waddles across the map after a clear
function recordStageResult(stageIdx, stars) {
  const m = getMap();
  m.stars[stageIdx] = Math.max(m.stars[stageIdx] || 0, stars);
  if (stars >= 1 && stageIdx === m.cleared) {
    const before = rankForCleared(m.cleared);
    m.cleared = Math.min(drinkPool().length, m.cleared + 1);
    const after = rankForCleared(m.cleared);
    if (after > before) pendingRankUp = after;
    pendingWalk = { from: stageIdx, to: m.cleared };
  }
  setMap(m);
}
// Generic full-screen announcement (rank-ups + rules changes).
function showAnnounce({ emoji, eyebrow, title, body, button }) {
  $("#rankup-emoji").textContent = emoji;
  $("#rankup-eyebrow").textContent = eyebrow;
  $("#rankup-name").textContent = title;
  const b = $("#rankup-body");
  b.textContent = body || "";
  b.style.display = body ? "" : "none";
  $("#btn-rankup-ok").textContent = button || "Got it →";
  $("#rankup").classList.add("is-open");
  Sound.coin();
}
function showRankUp(rankIdx) {
  const r = rankInfo(rankIdx);
  showAnnounce({
    emoji: r.emoji,
    eyebrow: "Rank up!",
    title: r.name,
    body: `You've been promoted to ${r.name}. Tougher drinks and bigger menus lie ahead — keep climbing!`,
    button: "Keep climbing →",
  });
}
// When a stage introduces new rules, explain them once.
function maybeShowTierIntro(label) {
  const intro = TIER_INTRO[label];
  if (!intro || tierSeen(label)) return;
  markTierSeen(label);
  setTimeout(() => showAnnounce(intro), 260);
}

// ============================ High score (localStorage) ============================
const HIGH_SCORE_KEY = "lastcall_highscore";
const ENDLESS_BEST_KEY = "lastcall_endless_best";
function getHighScore() {
  return Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
}
function setHighScore(v) {
  try { localStorage.setItem(HIGH_SCORE_KEY, String(v)); } catch (e) { /* ignore */ }
}
function getEndlessBest() {
  return Number(localStorage.getItem(ENDLESS_BEST_KEY) || 0);
}
function setEndlessBest(v) {
  try { localStorage.setItem(ENDLESS_BEST_KEY, String(v)); } catch (e) { /* ignore */ }
}
function renderStartBest() {
  const best = getHighScore();
  const eb = getEndlessBest();
  const parts = [];
  if (best > 0) parts.push(`🏅 Best shift: ${best} pts`);
  if (eb > 0) parts.push(`🔥 Endless: ${eb} pts`);
  $("#start-best").textContent = parts.join("  ·  ");
}

const STEP_META = {
  glass: { label: "Glass", title: "Choose your glass", sub: "Pick the right vessel for the drink.", status: "Choose a glass" },
  ingredients: { label: "Pour", title: "Pour your ingredients", sub: "Tap to add, then dial each amount. Watch them pour in.", status: "Pour your ingredients" },
  method: { label: "Mix", title: "Prepare the drink", sub: "Choose how to combine the ingredients.", status: "Pick a preparation method" },
  garnish: { label: "Garnish", title: "Add a garnish", sub: "Finish it with the right flourish.", status: "Add a garnish" },
};

// ============================ DOM helpers ============================
const $ = (sel) => document.querySelector(sel);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
  $("#" + id).classList.add("is-active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (id === "screen-start") onShowStart();
}

let toastTimer = null;
function showToast(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-show"), 2400);
}

function unitMeta(unit) {
  switch (unit) {
    case "ml": return { step: 5, def: 15, min: 0 };
    case "dash": return { step: 1, def: 1, min: 0 };
    case "leaf": return { step: 1, def: 4, min: 0 };
    case "piece": return { step: 1, def: 1, min: 0 };
    default: return { step: 1, def: 1, min: 0 };
  }
}

function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// ============================ Progress & points ============================
function updateProgress() {
  const stepsCount = state.steps.length || 1;
  const frac = (state.stage + state.stepIndex / stepsCount) / (drinkPool().length || 1);
  $("#progress-fill").style.width = Math.min(100, Math.round(frac * 100)) + "%";
}

let displayedScore = 0;
function animatePoints(to) {
  const el = $("#points-counter");
  const from = displayedScore;
  if (from === to) {
    el.textContent = `★ ${to} pts`;
    return;
  }
  const dur = 600;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(from + (to - from) * eased);
    el.textContent = `★ ${val} pts`;
    if (p < 1) requestAnimationFrame(tick);
    else displayedScore = to;
  }
  requestAnimationFrame(tick);
}

// ============================ Colour helpers ============================
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mixColor(ingredients) {
  let r = 0, g = 0, b = 0, w = 0;
  ingredients.forEach((i) => {
    const ing = INGREDIENT_BY_ID[i.id];
    const wt = ing.unit === "ml" ? i.amount : 5;
    const c = hexToRgb(ing.color);
    r += c.r * wt; g += c.g * wt; b += c.b * wt; w += wt;
  });
  if (!w) return "#9a8";
  return rgbToHex(r / w, g / w, b / w);
}

// ============================ Bar station rendering ============================
function currentGlass() {
  return state.build.glass ? GLASS_BY_ID[state.build.glass] : null;
}

function renderStation() {
  const mount = $("#glass-mount");
  mount.innerHTML = "";
  const g = currentGlass();
  if (!g) {
    mount.innerHTML = `<div class="glass-ghost"><span>🍸</span>Select a glass<br />to begin</div>`;
    return;
  }
  const svg = Glass.buildGlass(g);
  mount.appendChild(svg);
  updateLiquid(false);
  // Auto garnish is held back until the drink is mixed so it doesn't float on
  // an empty glass; a player-chosen garnish step manages its own visual.
  if (state.steps.includes("garnish") || state.mixed) applyGarnishVisual();
}

// Compute the liquid bands + fill fraction for the current build.
function computeLiquid(g) {
  const ML_EQUIV = 6; // visual volume a non-ml item (mint/bitters) contributes
  const mlIngs = state.build.ingredients.filter((i) => INGREDIENT_BY_ID[i.id].unit === "ml");
  const nonMl = state.build.ingredients.filter((i) => INGREDIENT_BY_ID[i.id].unit !== "ml");
  const ordered = [...mlIngs, ...nonMl];
  const weight = (i) => (INGREDIENT_BY_ID[i.id].unit === "ml" ? i.amount : ML_EQUIV);
  const totalWeight = ordered.reduce((s, i) => s + weight(i), 0);
  const effectiveMl = mlIngs.reduce((s, i) => s + i.amount, 0) + nonMl.length * ML_EQUIV;
  const fillFrac = effectiveMl > 0 ? Math.max(0.05, Math.min(0.95, effectiveMl / g.cap)) : 0;

  if (totalWeight === 0) return { bands: [], fillFrac: 0 };

  if (state.mixed) {
    return { bands: [{ color: mixColor(state.build.ingredients), frac: 1 }], fillFrac };
  }
  const bands = ordered.map((i) => ({
    color: INGREDIENT_BY_ID[i.id].color,
    frac: weight(i) / totalWeight,
  }));
  return { bands, fillFrac };
}

function updateLiquid(animate = true) {
  const svg = $("#glass-mount svg.glass-svg");
  const g = currentGlass();
  if (!svg || !g) return;
  const { bands, fillFrac } = computeLiquid(g);
  Glass.setLiquid(svg, bands, fillFrac, animate);
}

function animatePour(id) {
  const stream = $("#pour-stream");
  stream.style.color = INGREDIENT_BY_ID[id].color;
  stream.classList.remove("is-pouring");
  void stream.offsetWidth; // reflow to restart animation
  stream.classList.add("is-pouring");
  setTimeout(() => stream.classList.remove("is-pouring"), 720);
  spawnSplash(INGREDIENT_BY_ID[id].color);
  Sound.pour();
  updateLiquid(true);
}

// Splash droplets at the glass mouth.
function spawnSplash(color) {
  const station = $(".station");
  const mouth = $("#glass-mount");
  if (!station || !mouth) return;
  const sRect = station.getBoundingClientRect();
  const mRect = mouth.getBoundingClientRect();
  const cxPct = ((mRect.left + mRect.width / 2 - sRect.left) / sRect.width) * 100;
  const topPx = mRect.top - sRect.top + Math.max(10, mRect.height * 0.18);
  for (let i = 0; i < 7; i++) {
    const d = document.createElement("span");
    d.className = "droplet";
    d.style.background = color;
    d.style.left = cxPct + "%";
    d.style.top = topPx + "px";
    d.style.setProperty("--dx", (Math.random() * 60 - 30).toFixed(0) + "px");
    d.style.setProperty("--dy", (20 + Math.random() * 40).toFixed(0) + "px");
    d.style.animationDelay = (Math.random() * 0.12).toFixed(2) + "s";
    station.appendChild(d);
    setTimeout(() => d.remove(), 700);
  }
}

function applyGarnishVisual() {
  const svg = $("#glass-mount svg.glass-svg");
  if (!svg) return;
  const gid = state.build.garnish;
  Glass.setGarnish(svg, gid, gid ? GARNISH_BY_ID[gid].emoji : "");
}

// ============================ Method animation ============================
function setStatus(text) {
  $("#station-status").textContent = text;
}

async function runMethod(methodId) {
  const station = $(".station");
  state.mixed = false;
  updateLiquid();
  const labels = { shake: "Shaking…", stir: "Stirring…", build: "Building…", muddle: "Muddling…", blend: "Blending…" };
  setStatus(labels[methodId] || "Mixing…");

  setNavDisabled(true);
  if (Sound[methodId]) Sound[methodId]();
  station.classList.add("anim-" + methodId);
  const durations = { shake: 1100, stir: 1100, muddle: 1100, blend: 1200, build: 600 };
  await wait(durations[methodId] || 1000);
  station.classList.remove("anim-" + methodId);

  // Shake / stir / blend blend the liquids into one colour.
  if (["shake", "stir", "blend"].includes(methodId)) {
    state.mixed = true;
  }
  updateLiquid();
  applyGarnishVisual();
  setNavDisabled(false);
  setStatus("Ready for the next step");
}

// ============================ Step tracker ============================
function renderTracker() {
  const el = $("#step-tracker");
  el.innerHTML = "";
  const nodes = [...state.steps, "serve"];
  nodes.forEach((step, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "step-sep";
      el.appendChild(sep);
    }
    const node = document.createElement("span");
    const isServe = step === "serve";
    const label = isServe ? "Serve" : STEP_META[step].label;
    let cls = "step-node";
    if (i === state.stepIndex) cls += " is-active";
    else if (i < state.stepIndex) cls += " is-done";
    node.className = cls;
    const mark = i < state.stepIndex ? "✓" : i + 1;
    node.innerHTML = `<span class="dot">${mark}</span>${label}`;
    el.appendChild(node);
  });
}

// ============================ Step panels ============================
function renderStepPanel() {
  const step = state.steps[state.stepIndex];
  const panel = $("#step-panel");
  const meta = STEP_META[step];
  let sub = meta.sub;
  if (step === "ingredients" && state.complexity && state.complexity.portions === false) {
    sub = "Tap the ingredients you think belong in this drink — no measuring yet.";
  }
  panel.innerHTML = `
    <h3 class="step-panel-title">${meta.title}</h3>
    <p class="step-panel-sub">${sub}</p>
    <div id="panel-body"></div>
  `;
  const body = $("#panel-body");
  if (step === "glass") renderGlassPanel(body);
  else if (step === "ingredients") renderIngredientsPanel(body);
  else if (step === "method") renderMethodPanel(body);
  else if (step === "garnish") renderGarnishPanel(body);
}

function chip(item, selected, withHint) {
  const btn = document.createElement("button");
  btn.className = "chip" + (selected ? " is-selected" : "");
  btn.innerHTML =
    `<span class="emoji">${item.emoji ?? "•"}</span>` +
    `<span>${item.name}` +
    (withHint && item.hint ? `<span class="chip-hint">${item.hint}</span>` : "") +
    `</span>`;
  return btn;
}

function renderGlassPanel(body) {
  const grid = document.createElement("div");
  grid.className = "chip-grid";
  GLASSES.forEach((g) => {
    const c = chip(g, state.build.glass === g.id, false);
    c.addEventListener("click", () => {
      Sound.select();
      state.build.glass = g.id;
      renderStation();
      renderGlassPanel(body);
      updateNav();
    });
    grid.appendChild(c);
  });
  body.innerHTML = "";
  body.appendChild(grid);
  applyTrainingHints();
}

function renderMethodPanel(body) {
  const grid = document.createElement("div");
  grid.className = "chip-grid";
  METHODS.forEach((m) => {
    const c = chip(m, state.build.method === m.id, true);
    c.addEventListener("click", async () => {
      Sound.select();
      state.build.method = m.id;
      renderMethodPanel(body);
      updateNav();
      await runMethod(m.id);
    });
    grid.appendChild(c);
  });
  body.innerHTML = "";
  body.appendChild(grid);
  applyTrainingHints();
}

function renderGarnishPanel(body) {
  const grid = document.createElement("div");
  grid.className = "chip-grid";
  GARNISHES.forEach((g) => {
    const c = chip(g, state.build.garnish === g.id, false);
    c.addEventListener("click", () => {
      state.build.garnish = g.id;
      applyGarnishVisual();
      if (g.id !== "none") Sound.garnish();
      else Sound.click();
      renderGarnishPanel(body);
      updateNav();
    });
    grid.appendChild(c);
  });
  body.innerHTML = "";
  body.appendChild(grid);
  applyTrainingHints();
}

// ---- Ingredients panel ----
function renderIngredientsPanel(body) {
  body.innerHTML = `
    <div class="ingredient-layout">
      <div class="ingredient-catalog" id="ingredient-catalog"></div>
      <div class="ingredient-build">
        <h4 class="build-title">Your Pour</h4>
        <div class="build-list" id="build-list"></div>
      </div>
    </div>
  `;
  fillCatalog();
  fillBuildList();
}

function fillCatalog() {
  const el = $("#ingredient-catalog");
  if (!el) return;
  el.innerHTML = "";
  const added = new Set(state.build.ingredients.map((i) => i.id));
  // Underage players never see anything alcoholic.
  const pantry = isUnderage() ? INGREDIENTS.filter((i) => (i.mx?.abv || 0) === 0) : INGREDIENTS;

  // Early stages use a short, curated menu — a flat shuffled grid of options.
  if (state.menuIds) {
    const items = document.createElement("div");
    items.className = "cat-items";
    [...state.menuIds].forEach((id) => {
      const ing = INGREDIENT_BY_ID[id];
      if (!ing) return;
      const btn = document.createElement("button");
      btn.className = "cat-item" + (added.has(ing.id) ? " is-added" : "");
      btn.textContent = ing.name;
      btn.addEventListener("click", () => addIngredient(ing.id));
      items.appendChild(btn);
    });
    el.appendChild(items);
    applyTrainingHints();
    return;
  }

  const cats = [...new Set(pantry.map((i) => i.cat))];
  cats.forEach((cat) => {
    const group = document.createElement("div");
    group.innerHTML = `<p class="cat-group-title">${cat}</p>`;
    const items = document.createElement("div");
    items.className = "cat-items";
    pantry.filter((i) => i.cat === cat).forEach((ing) => {
      const btn = document.createElement("button");
      btn.className = "cat-item" + (added.has(ing.id) ? " is-added" : "");
      btn.textContent = ing.name;
      btn.addEventListener("click", () => addIngredient(ing.id));
      items.appendChild(btn);
    });
    group.appendChild(items);
    el.appendChild(group);
  });
  applyTrainingHints();
}

function fillBuildList() {
  const el = $("#build-list");
  if (!el) return;
  el.innerHTML = "";
  if (state.build.ingredients.length === 0) {
    el.innerHTML = `<p class="build-empty">No ingredients yet. Tap one to add it.</p>`;
    return;
  }
  const guessMode = state.complexity && state.complexity.portions === false;
  state.build.ingredients.forEach((entry) => {
    const ing = INGREDIENT_BY_ID[entry.id];
    const meta = unitMeta(ing.unit);
    const row = document.createElement("div");
    row.className = "build-row";
    if (guessMode) {
      // No portions yet — just show what's been added.
      row.innerHTML = `
        <span class="ing-name">${ing.name}</span>
        <span class="unit guess-added">✓ added</span>
        <button class="remove-btn" title="Remove">×</button>
      `;
      row.querySelector(".remove-btn").addEventListener("click", () => removeIngredient(entry.id));
      el.appendChild(row);
      return;
    }
    // Show amounts in the player's chosen units (ml stored internally).
    const disp = dispAmount(ing.unit, entry.amount);
    const step = dispStep(ing.unit);
    row.innerHTML = `
      <span class="ing-name">${ing.name}</span>
      <div class="stepper">
        <button data-act="dec">−</button>
        <input type="number" value="${disp.val}" min="${meta.min}" step="${step}" />
        <button data-act="inc">+</button>
      </div>
      <span class="unit">${disp.label}</span>
      <button class="remove-btn" title="Remove">×</button>
    `;
    const input = row.querySelector("input");
    row.querySelector('[data-act="dec"]').addEventListener("click", () => changeAmount(entry.id, toMl(ing.unit, disp.val - step), false));
    row.querySelector('[data-act="inc"]').addEventListener("click", () => changeAmount(entry.id, toMl(ing.unit, disp.val + step), true));
    input.addEventListener("change", () => changeAmount(entry.id, toMl(ing.unit, Number(input.value) || 0), false));
    row.querySelector(".remove-btn").addEventListener("click", () => removeIngredient(entry.id));
    el.appendChild(row);
  });
}

function addIngredient(id) {
  if (state.build.ingredients.some((i) => i.id === id)) return;
  state.mixed = false; // adding changes the build; un-blend
  let amount = unitMeta(INGREDIENT_BY_ID[id].unit).def;
  // In guess mode the player doesn't set volumes — pour the *correct* recipe
  // portion for ingredients that belong to the drink so it looks realistic.
  if (state.complexity && state.complexity.portions === false) {
    const recipe = currentRecipe();
    const target = recipe && recipe.ingredients.find((i) => i.id === id);
    if (target) amount = target.amount;
  }
  state.build.ingredients.push({ id, amount });
  fillCatalog();
  fillBuildList();
  animatePour(id);
  updateNav();
}

function removeIngredient(id) {
  state.build.ingredients = state.build.ingredients.filter((i) => i.id !== id);
  fillCatalog();
  fillBuildList();
  updateLiquid();
  updateNav();
}

function changeAmount(id, value, pour) {
  const ing = state.build.ingredients.find((i) => i.id === id);
  if (!ing) return;
  const meta = unitMeta(INGREDIENT_BY_ID[id].unit);
  ing.amount = Math.max(meta.min, value);
  fillBuildList();
  if (pour) animatePour(id);
  else updateLiquid();
}

// ============================ Step navigation ============================
function getSteps(difficulty) {
  return difficulty === "basic"
    ? ["ingredients", "garnish"]
    : ["glass", "ingredients", "method", "garnish"];
}

function stepSatisfied(step) {
  switch (step) {
    case "glass": return !!state.build.glass;
    case "ingredients": return state.build.ingredients.length > 0;
    case "method": return !!state.build.method;
    case "garnish": return !!state.build.garnish;
    default: return true;
  }
}

function setNavDisabled(disabled) {
  $("#btn-next").disabled = disabled;
  $("#btn-back").disabled = disabled || state.stepIndex === 0;
}

function updateNav() {
  const step = state.steps[state.stepIndex];
  const isLast = state.stepIndex === state.steps.length - 1;
  $("#btn-next").textContent = isLast ? "Serve Drink" : "Next →";
  $("#btn-next").disabled = !stepSatisfied(step);
  $("#btn-back").disabled = state.stepIndex === 0;
}

function enterStep() {
  const step = state.steps[state.stepIndex];
  if (step === "ingredients") {
    state.mixed = false;
    updateLiquid();
  }
  setStatus(STEP_META[step].status);
  renderTracker();
  renderStepPanel();
  renderCoach();
  applyTrainingHints();
  updateNav();
  updateProgress();
}

async function goNext() {
  const cur = state.steps[state.stepIndex];
  // When the method step is auto (not chosen by the player), apply it
  // automatically when leaving the pour step so the drink still gets mixed —
  // even if ingredients is the last step (early tiers have no garnish step).
  if (cur === "ingredients" && !state.steps.includes("method") && state.build.method) {
    const panel = $("#step-panel");
    panel.innerHTML = `<div class="auto-note">Auto-preparing with the <strong>${METHOD_BY_ID[state.build.method].name}</strong> method…</div>`;
    await runMethod(state.build.method);
  }
  if (state.stepIndex < state.steps.length - 1) {
    state.stepIndex++;
    enterStep();
  } else {
    serve();
  }
}

function goBack() {
  if (state.stepIndex > 0) {
    state.stepIndex--;
    enterStep();
  }
}

// ============================ Stage loading ============================
function loadStage(index) {
  state.mode = "campaign";
  state.challenge = null;
  state.stage = index;
  state.build = emptyBuild();
  state.mixed = false;
  $(".progress-wrap").style.display = "";
  $(".progress-track").style.display = "";
  $("#endless-hud").style.display = "none";
  const pool = drinkPool();
  const recipe = pool[index];

  // Complexity scales with how far you've climbed.
  applyComplexity(complexityForStage(index + 1), recipe);

  $("#ticket-label").textContent = "Customer Order";
  $("#stage-pill").textContent = `Stage ${index + 1} / ${pool.length}`;
  $("#diff-pill").textContent = state.complexity.label;
  pickCustomer();
  renderCustomer(recipe.name);
  $("#order-name").textContent = recipe.name;
  $("#order-desc").textContent = recipe.order;
  animatePoints(state.totalScore);
  updateProgress();

  renderStation();
  enterStep();
  showScreen("screen-game");
  maybeShowTierIntro(state.complexity.label);
}

// ============================ Endless shift ============================
function renderEndlessHud() {
  const hearts = "❤".repeat(state.lives) + "🖤".repeat(Math.max(0, 3 - state.lives));
  $("#endless-hud").innerHTML =
    `<span class="hud-lives">${hearts}</span>` +
    `<span class="hud-streak">🔥 ${state.streak}</span>` +
    `<span class="hud-served">🍸 ${state.served}</span>`;
}

function loadEndless(next = false) {
  state.mode = "endless";
  state.challenge = null;
  state.build = emptyBuild();
  state.mixed = false;

  // Pick a random recipe that isn't an immediate repeat.
  const pool = drinkPool();
  let idx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1) {
    while (idx === state.lastEndlessIdx) idx = Math.floor(Math.random() * pool.length);
  }
  state.lastEndlessIdx = idx;
  const recipe = pool[idx];
  state.endlessRecipe = recipe;

  // Endless mirrors the player's current ramp difficulty.
  applyComplexity(complexityForStage(getMap().cleared + 1), recipe);

  // HUD: hide the linear progress bar, show lives/streak.
  $(".progress-wrap").style.display = "";
  $(".progress-track").style.display = "none";
  $("#endless-hud").style.display = "";
  renderEndlessHud();

  $("#ticket-label").textContent = "Now serving";
  $("#stage-pill").textContent = `Endless · 🍸 ${state.served}`;
  $("#diff-pill").textContent = state.complexity.label;
  pickCustomer();
  renderCustomer(recipe.name);
  $("#order-name").textContent = recipe.name;
  $("#order-desc").textContent = recipe.order;
  animatePoints(state.totalScore);

  renderStation();
  enterStep();
  showScreen("screen-game");
}

function serveEndless() {
  lastResult = scoreBuild();
  state.served += 1;
  let tip = 0;
  if (lastResult.stars >= 1) {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    if (lastResult.stars === 3) tip = 10 + state.streak * 2; // streak-boosted tip
  } else {
    state.lives -= 1;
    state.streak = 0;
    Sound.fail();
  }
  lastResult.tip = tip;
  state.totalScore += lastResult.stagePoints + tip;
  recordResult(lastResult);
  showResult(lastResult);
}

function showEndlessFinish() {
  const best = getEndlessBest();
  const isNew = state.totalScore > best;
  if (isNew) setEndlessBest(state.totalScore);

  $("#endless-stats").innerHTML =
    `<div class="estat"><span class="estat-num">${state.totalScore}</span><span class="estat-lbl">points</span></div>` +
    `<div class="estat"><span class="estat-num">${state.served}</span><span class="estat-lbl">served</span></div>` +
    `<div class="estat"><span class="estat-num">${state.bestStreak}</span><span class="estat-lbl">best streak</span></div>`;

  let rank;
  if (state.served >= 20) rank = "🏆 Legend of the Bar";
  else if (state.served >= 14) rank = "🍸 Head Bartender";
  else if (state.served >= 8) rank = "🥃 Solid Shift";
  else if (state.served >= 4) rank = "🍋 Getting There";
  else rank = "🧽 Cut Short";
  $("#endless-rank").textContent = rank;

  const bestEl = $("#endless-best");
  if (isNew) {
    bestEl.textContent = `🎉 New endless record! (was ${best} pts)`;
    bestEl.classList.add("is-new");
    Sound.coin();
  } else {
    bestEl.textContent = `🔥 Endless best: ${best} pts`;
    bestEl.classList.remove("is-new");
  }
  renderStartBest();
  showScreen("screen-endless");
}

// ============================ Scoring ============================
function tolerance(unit, target) {
  if (unit === "ml") return Math.max(7.5, target * 0.2);
  return 0;
}

// Be more forgiving about pour accuracy the deeper a player gets — harder drinks
// with more ingredients shouldn't punish small measurement slips as harshly.
function measureLeniency() {
  const n = state.mode === "campaign" ? state.stage + 1 : (getMap().cleared + 1);
  return 1 + Math.min(0.8, Math.max(0, n - 6) * 0.045);
}

function currentRecipe() {
  if (state.mode === "training" && state.trainingRecipe) return state.trainingRecipe;
  if (state.mode === "cotd" && state.cotdRecipe) return state.cotdRecipe;
  if (state.mode === "challenge" && state.challenge) return state.challenge;
  if (state.mode === "endless" && state.endlessRecipe) return state.endlessRecipe;
  return drinkPool()[state.stage];
}

// ============================ Customers ============================
function pickCustomer() {
  state.customer = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
  return state.customer;
}

function renderCustomer(drinkName) {
  const el = $("#ticket-customer");
  if (!el) return;
  const c = state.customer;
  if (!c) { el.innerHTML = ""; el.style.display = "none"; return; }
  el.style.display = "";
  const line = c.lines[Math.floor(Math.random() * c.lines.length)].replace("{drink}", drinkName);
  el.innerHTML = `<span class="cust-avatar">${c.emoji}</span><span class="cust-meta"><span class="cust-name">${c.name}</span><span class="cust-line">"${line}"</span></span>`;
}

function clearCustomer() {
  state.customer = null;
  const el = $("#ticket-customer");
  if (el) { el.innerHTML = ""; el.style.display = "none"; }
}

// ============================ Training (guided tutorial) ============================
function loadTraining() {
  state.mode = "training";
  state.difficulty = "advanced"; // full flow, so they learn every step
  state.challenge = null;
  state.trainingRecipe = isUnderage()
    ? (MOCKTAILS.find((r) => r.id === "virgin_mojito") || MOCKTAILS[0])
    : (RECIPES.find((r) => r.id === "daiquiri") || RECIPES[0]);
  state.build = emptyBuild();
  state.mixed = false;
  state.complexity = null;
  state.menuIds = null;
  state.steps = getSteps("advanced");
  state.stepIndex = 0;
  state.totalScore = 0;
  state.starsEarned = 0;
  displayedScore = 0;

  $(".progress-wrap").style.display = "none";
  $("#endless-hud").style.display = "none";
  clearCustomer();

  const r = state.trainingRecipe;
  $("#ticket-label").textContent = "Training drink";
  $("#stage-pill").textContent = "📚 Training";
  $("#diff-pill").textContent = "Tutorial";
  $("#order-name").textContent = r.name;
  $("#order-desc").textContent = r.order;

  renderStation();
  enterStep();
  showScreen("screen-game");
}

function renderCoach() {
  const el = $("#coach");
  if (!el) return;
  if (state.mode !== "training") { el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "";
  el.innerHTML = coachHTML();
}

function coachHTML() {
  const r = currentRecipe();
  const step = state.steps[state.stepIndex];
  const n = state.stepIndex + 1;
  const total = state.steps.length;
  let title = "";
  let body = "";
  if (step === "glass") {
    const gname = GLASS_BY_ID[r.glass].name;
    title = "👋 Welcome to bartending school!";
    body = `We'll make a <strong>${r.name}</strong> together. Every cocktail has its own glass — a ${r.name} is served in a <strong>${gname}</strong>. Tap the glowing ${gname}, then hit <strong>Next →</strong>.`;
  } else if (step === "ingredients") {
    const list = r.ingredients
      .map((i) => `<strong>${i.amount} ${INGREDIENT_BY_ID[i.id].unit} ${INGREDIENT_BY_ID[i.id].name}</strong>`)
      .join(", ");
    title = "🫗 Now build the drink";
    body = `Tap each glowing ingredient to pour it, then use the <strong>− / +</strong> buttons to set the amount: ${list}. Don't worry about being exact — anything within ~20% still scores.`;
  } else if (step === "method") {
    const mname = METHOD_BY_ID[r.method].name;
    title = "🍸 Mix it up";
    body = `Time to combine everything. A ${r.name} is <strong>${mname.toLowerCase()}ed</strong> with ice — tap the glowing <strong>${mname}</strong> and watch the bartender work.`;
  } else if (step === "garnish") {
    const gid = r.garnish[0];
    const gname = GARNISH_BY_ID[gid].name;
    title = "🍋 The finishing touch";
    body = gid === "none"
      ? `This drink needs <strong>no garnish</strong> — tap <strong>None</strong>, then press <strong>Serve Drink</strong>.`
      : `Finish with a <strong>${gname}</strong>. Tap it, then press <strong>Serve Drink</strong> to see your stars!`;
  }
  return (
    `<div class="coach-head"><span class="coach-avatar">🧑‍🏫</span><span class="coach-step">Lesson ${n} of ${total}</span></div>` +
    `<p class="coach-title">${title}</p>` +
    `<p class="coach-body">${body}</p>`
  );
}

// Glow the correct choice(s) for the current training step.
function applyTrainingHints() {
  if (state.mode !== "training") return;
  const r = currentRecipe();
  const step = state.steps[state.stepIndex];
  if (step === "glass") highlightChips(GLASS_BY_ID[r.glass].name);
  else if (step === "method") highlightChips(METHOD_BY_ID[r.method].name);
  else if (step === "garnish") highlightChips(GARNISH_BY_ID[r.garnish[0]].name);
  else if (step === "ingredients") {
    const need = new Set(r.ingredients.map((i) => INGREDIENT_BY_ID[i.id].name));
    document.querySelectorAll("#ingredient-catalog .cat-item").forEach((b) => {
      b.classList.toggle("train-hint", need.has(b.textContent) && !b.classList.contains("is-added"));
    });
  }
}

function highlightChips(name) {
  document.querySelectorAll("#panel-body .chip").forEach((c) => {
    const span = c.querySelector("span:not(.emoji)");
    const txt = (span ? span.textContent : c.textContent).trim();
    c.classList.toggle("train-hint", txt.startsWith(name));
  });
}

function scoreBuild() {
  const recipe = currentRecipe();
  const feedback = [];
  let points = 0;
  let maxPoints = 0;

  // Glass
  maxPoints += 1;
  if (state.build.glass === recipe.glass) {
    points += 1;
    feedback.push(fb("ok", "Glass", `${GLASS_BY_ID[recipe.glass].name} — correct.`));
  } else {
    const chosen = state.build.glass ? GLASS_BY_ID[state.build.glass].name : "none";
    feedback.push(fb("bad", "Glass", `You used ${chosen}; should be ${GLASS_BY_ID[recipe.glass].name}.`));
  }

  // Method
  maxPoints += 1;
  if (state.build.method === recipe.method) {
    points += 1;
    feedback.push(fb("ok", "Method", `${METHOD_BY_ID[recipe.method].name} — correct.`));
  } else {
    const chosen = state.build.method ? METHOD_BY_ID[state.build.method].name : "none";
    feedback.push(fb("bad", "Method", `You chose ${chosen}; should be ${METHOD_BY_ID[recipe.method].name}.`));
  }

  // Ingredients
  const builtMap = new Map(state.build.ingredients.map((i) => [i.id, i.amount]));
  const targetIds = new Set(recipe.ingredients.map((i) => i.id));

  const guessMode = state.complexity && state.complexity.portions === false;

  recipe.ingredients.forEach((target) => {
    const ing = INGREDIENT_BY_ID[target.id];
    maxPoints += 2;
    if (!builtMap.has(target.id)) {
      const tMiss = dispAmount(ing.unit, target.amount);
      feedback.push(fb("bad", ing.name, guessMode ? "Missing from the recipe." : `Missing — needs ${tMiss.val} ${tMiss.label}.`));
      return;
    }
    // Guess mode: score on getting the ingredient right, not the amount.
    if (guessMode) {
      points += 2;
      feedback.push(fb("ok", ing.name, "Correct ingredient."));
      return;
    }
    const have = builtMap.get(target.id);
    const diff = Math.abs(have - target.amount);
    const leni = measureLeniency();
    const allow = ing.unit === "ml" ? tolerance(ing.unit, target.amount) * leni : 1;
    const perfect = ing.unit === "ml" ? Math.max(2.5, target.amount * 0.07) * leni : 0;
    const h = dispAmount(ing.unit, have);
    const t = dispAmount(ing.unit, target.amount);
    if (diff <= perfect) {
      points += 2;
      feedback.push(fb("ok", ing.name, `${h.val} ${h.label} — spot on (target ${t.val}).`));
    } else if (diff <= allow) {
      points += 1;
      feedback.push(fb("near", ing.name, `${h.val} ${h.label} — close (target ${t.val}).`));
    } else {
      // Right ingredient, amount off — point it out gently (not a hard miss).
      const over = have > target.amount;
      feedback.push(fb("near", ing.name, `${h.val} ${h.label} — a bit ${over ? "much" : "light"} (aim for ${t.val}).`));
    }
  });

  // Extra ingredients
  state.build.ingredients.forEach((entry) => {
    if (!targetIds.has(entry.id)) {
      points -= 1;
      feedback.push(fb("bad", INGREDIENT_BY_ID[entry.id].name, "Not in this recipe — extra ingredient."));
    }
  });

  // Garnish
  maxPoints += 1;
  if (recipe.garnish.includes(state.build.garnish)) {
    points += 1;
    feedback.push(fb("ok", "Garnish", `${GARNISH_BY_ID[state.build.garnish].name} — nice touch.`));
  } else {
    const ideal = GARNISH_BY_ID[recipe.garnish[0]].name;
    const chosen = state.build.garnish ? GARNISH_BY_ID[state.build.garnish].name : "none";
    feedback.push(fb("near", "Garnish", `You chose ${chosen}; ${ideal} suits it better.`));
  }

  points = Math.max(0, points);
  const pct = Math.round((points / maxPoints) * 100);
  let stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 45 ? 1 : 0;
  const result = { pct, stars, stagePoints: points * 10, feedback };

  // Judges taste every served cocktail (except the tutorial). Their palate
  // verdict blends into the final stars once the player controls the pour;
  // in early guess stages it's shown as flavour reactions only (no star effect).
  if (state.mode !== "training") {
    const evalResult = evaluate(state.build, { strictness: STRICTNESS });
    const panel = scoreWithJudges(evalResult, pickJudges(3));
    result.judgePanel = panel;
    const blendable = !state.complexity || state.complexity.portions !== false;
    if (blendable) {
      const blended = Math.round(pct * 0.75 + panel.total * 0.25);
      result.blended = blended;
      result.stars = blended >= 90 ? 3 : blended >= 70 ? 2 : blended >= 45 ? 1 : 0;
    }
  }
  return result;
}

function fb(kind, label, text) {
  return { kind, label, text };
}

// ============================ Result / finish ============================
let lastResult = null;

function serve() {
  if (state.mode === "mixologist") { serveMix(); return; }
  if (state.mode === "endless") { serveEndless(); return; }
  if (state.mode === "training") {
    lastResult = scoreBuild();
    if (lastResult.stars === 0) Sound.fail();
    else Sound.coin();
    showResult(lastResult);
    return;
  }
  if (state.mode === "cotd") {
    lastResult = scoreBuild();
    lastResult.tip = lastResult.stars > 0 ? 20 : 0; // daily bonus
    recordResult(lastResult);
    markCotdDone();
    if (lastResult.stars === 0) Sound.fail();
    else Sound.coin();
    showResult(lastResult);
    return;
  }
  lastResult = scoreBuild();
  state.totalScore += lastResult.stagePoints;
  state.starsEarned += lastResult.stars;
  recordResult(lastResult);
  recordStageResult(state.stage, lastResult.stars);
  if (lastResult.stars === 0) Sound.fail();
  showResult(lastResult);
}

// Customer reaction line based on how good the drink was.
const REACTIONS = {
  good: ["Perfect — you're an artist!", "Wow, exactly right.", "Best {drink} I've had in ages!", "Flawless. Keep the change!"],
  ok: ["Not bad at all.", "That'll do nicely, thanks.", "Pretty good, cheers!", "Yeah, I'd order that again."],
  bad: ["Hmm… this isn't quite right.", "That's not what I ordered…", "I'll, uh, drink it I guess.", "Did you read the order?"],
};
function reactionFor(stars, drinkName) {
  const pool = stars === 3 ? REACTIONS.good : stars >= 1 ? REACTIONS.ok : REACTIONS.bad;
  return pool[Math.floor(Math.random() * pool.length)].replace("{drink}", drinkName);
}

// ============================ Mixologist mode ============================
function cloneBuild(b) {
  return { glass: b.glass, method: b.method, garnish: b.garnish, ingredients: b.ingredients.map((i) => ({ id: i.id, amount: i.amount })) };
}

function startMixologist() {
  state.mode = "mixologist";
  state.difficulty = "mixologist";
  state.challenge = null;
  state.build = emptyBuild();
  state.mixed = false;
  state.complexity = null;
  state.menuIds = null;
  state.steps = getSteps("mixologist");
  state.stepIndex = 0;
  $(".progress-wrap").style.display = "none";
  clearCustomer();
  $("#stage-pill").textContent = "Mixologist";
  $("#diff-pill").textContent = "Sandbox";
  $("#order-name").textContent = "Invent a Cocktail";
  $("#order-desc").textContent = "Free pour — choose a glass, add anything you like, pick a method & garnish, then Serve to get it judged.";
  renderStation();
  enterStep();
  showScreen("screen-game");
}

let lastMix = null;
function serveMix() {
  const result = evaluate(state.build, { strictness: STRICTNESS });
  const panel = scoreWithJudges(result, pickJudges(3));
  result.judges = panel;
  lastMix = { result, build: cloneBuild(state.build), panel };
  if (panel.total >= 70) Sound.coin();
  else if (panel.total >= 45) Sound.click();
  else Sound.fail();
  showMixResult(result);
}

function renderJudges(judges, sel = "#judges-panel") {
  const el = $(sel);
  if (!el) return;
  el.innerHTML = judges
    .map((j) => `
      <div class="judge-card">
        <div class="judge-top">
          <span class="judge-emoji">${j.emoji}</span>
          <span class="judge-name">${j.name}</span>
          <span class="judge-score">${j.score}<small>/10</small></span>
        </div>
        <div class="judge-blurb">${j.blurb}</div>
        <div class="judge-comment">“${j.comment}”</div>
      </div>`)
    .join("");
}

function renderFlavorBars(p) {
  const defs = [
    ["Strong", p.strong, "#e9b949"],
    ["Sweet", p.sweet, "#ff9ec4"],
    ["Sour", p.sour, "#b9d96a"],
    ["Bitter", p.bitter, "#a98be0"],
    ["Fizz", p.fizz, "#7fd4e8"],
  ];
  $("#flavor-bars").innerHTML = defs
    .map(([label, v, c]) => `
      <div class="fbar-row">
        <span class="fbar-label">${label}</span>
        <div class="fbar-track"><div class="fbar-fill" style="width:${Math.round(v * 100)}%;background:${c}"></div></div>
      </div>`)
    .join("");
}

function showMixResult(result) {
  const panel = result.judges || scoreWithJudges(result, pickJudges(3));
  $("#mix-name").textContent = "Your Creation";
  $("#mix-score").textContent = panel.total;
  $("#mix-verdict").textContent = panel.verdict;
  $("#mix-stars").innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="${i < panel.stars ? "on" : ""}">★</span>`).join("");
  renderJudges(panel.judges);

  const cl = $("#mix-classic");
  if (result.classic) {
    cl.textContent = result.classic.exact
      ? `🎯 Spot on — you made a ${result.classic.name}!`
      : `≈ This is basically a ${result.classic.name}.`;
  } else {
    cl.textContent = "🍸 An original creation.";
  }

  $("#mix-note").textContent = result.note;
  const vol = useImperial() ? `${(result.volume / ML_PER_OZ).toFixed(1)} oz` : `${result.volume} ml`;
  $("#mix-meta").innerHTML = `<span>${result.abv}% ABV</span><span>${vol}</span><span>${result.family}</span>`;
  renderFlavorBars(result.profile);

  const tipsEl = $("#mix-tips");
  tipsEl.innerHTML = "";
  result.tips.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    tipsEl.appendChild(li);
  });

  $("#btn-mix-save").textContent = "Save to My Bar";
  $("#btn-mix-save").disabled = false;
  const shareBtn = $("#btn-mix-share");
  if (shareBtn) { shareBtn.textContent = "🌐 Share"; shareBtn.disabled = false; }
  showScreen("screen-mix-result");
}

// ============================ My Bar (saved inventions) ============================
const MYBAR_KEY = "lastcall_mybar";
function getMyBar() {
  try { return JSON.parse(localStorage.getItem(MYBAR_KEY) || "[]"); } catch (e) { return []; }
}
function setMyBar(list) {
  try { localStorage.setItem(MYBAR_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}
function saveInvention(name) {
  if (!lastMix) return;
  const list = getMyBar();
  const score = lastMix.panel ? lastMix.panel.total : lastMix.result.score;
  const verdict = lastMix.panel ? lastMix.panel.verdict : lastMix.result.verdict;
  list.unshift({
    name,
    build: lastMix.build,
    score,
    verdict,
    family: lastMix.result.family,
    ts: Date.now(),
  });
  setMyBar(list);
  checkBadges();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function renderMyBar() {
  const list = getMyBar();
  const el = $("#mybar-list");
  $("#mybar-sub").textContent = list.length
    ? `${list.length} saved invention${list.length > 1 ? "s" : ""} — recreate one to test your memory.`
    : "";
  if (!list.length) {
    el.innerHTML = `<p class="mybar-empty">No inventions yet. Open <strong>Mixologist</strong> mode, build a drink, and save it here.</p>`;
    return;
  }
  el.innerHTML = "";
  list.forEach((inv, idx) => {
    const ings = inv.build.ingredients.map((i) => INGREDIENT_BY_ID[i.id]?.name).filter(Boolean).join(", ");
    const card = document.createElement("div");
    card.className = "mybar-item";
    card.innerHTML = `
      <div class="mybar-item-main">
        <div class="mybar-item-top"><span class="mybar-name">${escapeHtml(inv.name)}</span><span class="mybar-badge">${inv.score}/100</span></div>
        <div class="mybar-meta">${escapeHtml(inv.family)} · ${escapeHtml(inv.verdict)}</div>
        <div class="mybar-ings">${escapeHtml(ings)}</div>
      </div>
      <div class="mybar-item-actions">
        <button class="btn btn-primary btn-sm" data-act="play">Recreate</button>
        ${Backend.isConfigured() ? '<button class="btn btn-ghost btn-sm" data-act="share">🌐 Share</button>' : ""}
        <button class="btn btn-ghost btn-sm" data-act="del">Delete</button>
      </div>`;
    card.querySelector('[data-act="play"]').addEventListener("click", () => playInvention(inv));
    const shareEl = card.querySelector('[data-act="share"]');
    if (shareEl) shareEl.addEventListener("click", () => {
      shareCreationToCommunity({
        name: inv.name,
        recipe: inv.build,
        score: inv.score,
        verdict: inv.verdict,
        family: inv.family,
      }, shareEl);
    });
    card.querySelector('[data-act="del"]').addEventListener("click", () => {
      const l = getMyBar();
      l.splice(idx, 1);
      setMyBar(l);
      renderMyBar();
      Sound.click();
    });
    el.appendChild(card);
  });
}

function loadChallenge(recipe) {
  state.mode = "challenge";
  state.challenge = recipe;
  state.difficulty = "advanced";
  state.build = emptyBuild();
  state.mixed = false;
  state.complexity = null;
  state.menuIds = null;
  state.steps = getSteps("advanced");
  state.stepIndex = 0;
  $(".progress-wrap").style.display = "none";
  clearCustomer();
  $("#stage-pill").textContent = "Challenge";
  $("#diff-pill").textContent = "Recreate";
  $("#order-name").textContent = recipe.name;
  $("#order-desc").textContent = "Recreate this invention from memory — match the glass, pour, method & garnish.";
  renderStation();
  enterStep();
  showScreen("screen-game");
}

function playInvention(inv) {
  const recipe = {
    name: inv.name,
    glass: inv.build.glass,
    method: inv.build.method,
    ingredients: inv.build.ingredients.map((i) => ({ id: i.id, amount: i.amount })),
    garnish: inv.build.garnish && inv.build.garnish !== "none" ? [inv.build.garnish] : ["none"],
  };
  state.totalScore = 0;
  state.starsEarned = 0;
  displayedScore = 0;
  loadChallenge(recipe);
}

function showResult(result) {
  const recipe = currentRecipe();
  $("#result-eyebrow").textContent = result.stars >= 1 ? "Stage cleared" : "Needs work";
  $("#result-name").textContent = recipe.name;

  // Build empty stars, then reveal earned ones one-by-one with a ding.
  const starsEl = $("#result-stars");
  starsEl.innerHTML = [0, 1, 2].map(() => `<span>★</span>`).join("");
  const spans = [...starsEl.children];
  for (let i = 0; i < result.stars; i++) {
    setTimeout(() => {
      spans[i].classList.add("on", "pop");
      Sound.starDing(i);
    }, 350 + i * 450);
  }

  $("#result-pct").textContent = result.blended != null ? result.blended : result.pct;
  const pts = result.stagePoints + (result.tip || 0);
  $("#result-points").textContent = pts;

  // Judges' reaction panel (every served cocktail except the tutorial).
  const jWrap = $("#result-judges-wrap");
  if (result.judgePanel) {
    const p = result.judgePanel;
    const label = result.blended != null
      ? `⚖️ The judges: ${p.verdict} (avg ${p.total})`
      : `⚖️ The judges taste it (avg ${p.total} — flavour only here)`;
    $("#result-judges-title").textContent = label;
    renderJudges(p.judges, "#result-judges");
    jWrap.style.display = "";
  } else {
    jWrap.style.display = "none";
  }

  // Customer reaction (campaign & endless only)
  const custEl = $("#result-customer");
  if (state.customer && state.mode !== "challenge") {
    let line = `${state.customer.emoji} ${state.customer.name}: "${reactionFor(result.stars, recipe.name)}"`;
    if (result.tip) line += `  💵 +${result.tip} tip`;
    custEl.textContent = line;
    custEl.style.display = "";
  } else {
    custEl.style.display = "none";
  }

  const list = $("#feedback-list");
  list.innerHTML = "";
  result.feedback.forEach((f) => {
    const icon = f.kind === "ok" ? "✓" : f.kind === "near" ? "≈" : "✗";
    const li = document.createElement("li");
    li.innerHTML = `<span class="fb-icon fb-${f.kind}">${icon}</span><span class="fb-text"><strong>${f.label}:</strong> <span>${f.text}</span></span>`;
    list.appendChild(li);
  });

  const retryBtn = $("#btn-retry");
  const nextBtn = $("#btn-next-stage");
  const mapBtn = $("#btn-result-map");
  mapBtn.style.display = "none";
  nextBtn.style.display = "";
  if (state.mode === "training") {
    retryBtn.style.display = "";
    retryBtn.textContent = "Try again";
    $("#result-eyebrow").textContent = result.stars >= 2 ? "🎓 You've got it!" : "Lesson complete";
    nextBtn.textContent = "Start the journey →";
  } else if (state.mode === "endless") {
    retryBtn.style.display = "none";
    retryBtn.textContent = "Retry stage";
    $("#result-eyebrow").textContent = state.lives > 0 ? "Order up" : "Out of lives";
    nextBtn.textContent = state.lives > 0 ? "Next customer →" : "End shift →";
  } else if (state.mode === "challenge") {
    retryBtn.style.display = "";
    retryBtn.textContent = "Retry stage";
    nextBtn.textContent = "Back to My Bar";
  } else if (state.mode === "cotd") {
    retryBtn.style.display = "";
    retryBtn.textContent = "Try again";
    $("#result-eyebrow").textContent = result.stars >= 1 ? "🍹 Cocktail of the Day" : "Needs work";
    nextBtn.textContent = "Back to menu";
  } else {
    // Campaign — must earn at least 1 star to advance to the next node.
    retryBtn.style.display = "";
    retryBtn.textContent = "Retry stage";
    mapBtn.style.display = "";
    const isLast = state.stage === drinkPool().length - 1;
    if (result.stars < 1) {
      $("#result-eyebrow").textContent = "So close — try again";
      nextBtn.style.display = "none";
    } else {
      nextBtn.textContent = isLast ? "See results →" : "Continue →";
    }
  }
  showScreen("screen-result");

  // Celebrate a rank-up on top of the result.
  if (pendingRankUp !== null) {
    const r = pendingRankUp;
    pendingRankUp = null;
    setTimeout(() => showRankUp(r), 900);
  }
}

function showFinish() {
  $("#finish-score").textContent = state.totalScore;
  const prevBest = getHighScore();
  const bestEl = $("#finish-best");
  if (state.totalScore > prevBest) {
    setHighScore(state.totalScore);
    bestEl.textContent = `🎉 New high score! (was ${prevBest} pts)`;
    bestEl.classList.add("is-new");
    Sound.coin();
  } else {
    bestEl.textContent = `🏅 Best score: ${prevBest} pts`;
    bestEl.classList.remove("is-new");
  }
  renderStartBest();

  const maxStars = drinkPool().length * 3;
  const avg = state.starsEarned / maxStars;
  $("#finish-stars").innerHTML = [0, 1, 2].map((i) => `<span class="${i < Math.round(avg * 3) ? "on" : ""}">★</span>`).join("");
  let rank;
  if (avg >= 0.9) rank = "🏆 Master Mixologist";
  else if (avg >= 0.7) rank = "🍸 Head Bartender";
  else if (avg >= 0.5) rank = "🥃 Bartender";
  else if (avg >= 0.3) rank = "🍋 Barback";
  else rank = "🧽 Still in training";
  $("#finish-rank").textContent = `${rank} · ${state.starsEarned}/${maxStars} stars`;
  showScreen("screen-finish");
}

// ============================ Event wiring ============================
// Play the journey → open the stage map.
$("#btn-start").addEventListener("click", () => {
  Sound.init();
  Sound.click();
  // Ensure the story plays before the very first level (covers players who
  // registered before the intro existed).
  maybePlayIntro(() => {
    recordPlayDay();
    renderMap();
    showScreen("screen-map");
  });
});

$("#btn-map-back").addEventListener("click", () => { Sound.click(); showScreen("screen-start"); });
$("#btn-result-map").addEventListener("click", () => { Sound.click(); renderMap(); showScreen("screen-map"); });
$("#btn-rankup-ok").addEventListener("click", () => { Sound.click(); $("#rankup").classList.remove("is-open"); });

$("#btn-mixologist").addEventListener("click", () => {
  Sound.init();
  if (!mapUnlocked()) { Sound.fail(); showToast(`🔒 Clear ${STAGES_TO_UNLOCK} stages to unlock Mixologist`); return; }
  Sound.coin();
  startMixologist();
});

$("#btn-endless").addEventListener("click", () => {
  Sound.init();
  if (!mapUnlocked()) { Sound.fail(); showToast(`🔒 Clear ${STAGES_TO_UNLOCK} stages to unlock Endless Shift`); return; }
  Sound.coin();
  recordPlayDay();
  state.totalScore = 0;
  state.starsEarned = 0;
  state.lives = 3;
  state.streak = 0;
  state.bestStreak = 0;
  state.served = 0;
  state.lastEndlessIdx = -1;
  displayedScore = 0;
  loadEndless();
});

$("#btn-sound").addEventListener("click", () => {
  Sound.init();
  const on = Sound.toggle();
  const s = getSettings(); s.sound = on; setSettings(s);
  $("#btn-sound").textContent = on ? "🔊" : "🔇";
  if (on) Sound.click();
});

$("#btn-ambient").addEventListener("click", () => {
  Sound.init();
  const on = Sound.toggleAmbient();
  $("#btn-ambient").classList.toggle("is-active", on);
  if (on) Sound.click();
});

$("#btn-next").addEventListener("click", goNext);
$("#btn-back").addEventListener("click", goBack);

$("#btn-retry").addEventListener("click", () => {
  if (state.mode === "training") {
    lastResult = null;
    loadTraining();
    return;
  }
  if (state.mode === "cotd") {
    lastResult = null;
    loadCotd();
    return;
  }
  if (lastResult) {
    state.totalScore -= lastResult.stagePoints;
    state.starsEarned -= lastResult.stars;
    lastResult = null;
  }
  if (state.mode === "challenge" && state.challenge) {
    loadChallenge(state.challenge);
    return;
  }
  loadStage(state.stage);
});

$("#btn-next-stage").addEventListener("click", () => {
  lastResult = null;
  if (state.mode === "training") {
    // Graduate into the journey map.
    Sound.click();
    renderMap();
    showScreen("screen-map");
    return;
  }
  if (state.mode === "cotd") {
    showScreen("screen-start");
    return;
  }
  if (state.mode === "challenge") {
    renderMyBar();
    showScreen("screen-mybar");
    return;
  }
  if (state.mode === "endless") {
    if (state.lives > 0) loadEndless(true);
    else showEndlessFinish();
    return;
  }
  // Return to the journey map so the duck waddles to the next stage, then the
  // player taps in to play it. The last stage jumps straight to the finish.
  if (state.stage < drinkPool().length - 1) {
    renderMap();
    showScreen("screen-map");
  } else {
    showFinish();
  }
});

// Mixologist result actions
$("#btn-mix-tweak").addEventListener("click", () => {
  const idx = state.steps.indexOf("ingredients");
  state.stepIndex = idx >= 0 ? idx : 0;
  enterStep();
  showScreen("screen-game");
});
$("#btn-mix-another").addEventListener("click", () => {
  Sound.click();
  startMixologist();
});
$("#btn-mix-quit").addEventListener("click", () => {
  renderStartBest();
  showScreen("screen-start");
});
$("#btn-mix-save").addEventListener("click", () => {
  $("#invent-name").value = "";
  $("#modal-name").classList.add("is-open");
  setTimeout(() => $("#invent-name").focus(), 50);
});

// Training
$("#btn-training").addEventListener("click", () => {
  Sound.init();
  Sound.click();
  loadTraining();
});

// Cocktail of the Day
$("#btn-cotd").addEventListener("click", () => {
  Sound.init();
  Sound.coin();
  loadCotd();
});

// Badges
$("#btn-badges").addEventListener("click", () => {
  Sound.init();
  Sound.click();
  renderBadges();
  showScreen("screen-badges");
});
$("#btn-badges-back").addEventListener("click", () => showScreen("screen-start"));

// My Bar
$("#btn-mybar").addEventListener("click", () => {
  Sound.init();
  Sound.click();
  renderMyBar();
  showScreen("screen-mybar");
});
$("#btn-mybar-back").addEventListener("click", () => showScreen("screen-start"));

// Name modal
$("#btn-name-cancel").addEventListener("click", () => $("#modal-name").classList.remove("is-open"));
$("#btn-name-save").addEventListener("click", () => {
  const name = ($("#invent-name").value || "").trim() || "Untitled";
  saveInvention(name);
  $("#modal-name").classList.remove("is-open");
  $("#mix-name").textContent = name;
  $("#btn-mix-save").textContent = "Saved ✓";
  $("#btn-mix-save").disabled = true;
  Sound.coin();
});
$("#modal-name").addEventListener("click", (e) => {
  if (e.target.id === "modal-name") $("#modal-name").classList.remove("is-open");
});
$("#invent-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#btn-name-save").click();
});

$("#btn-replay").addEventListener("click", () => {
  Sound.click();
  renderMap();
  showScreen("screen-map");
});

$("#btn-quit").addEventListener("click", () => {
  Sound.click();
  if (state.mode === "campaign") {
    renderMap();
    showScreen("screen-map");
  } else {
    renderStartBest();
    showScreen("screen-start");
  }
});

// ============================ Recipe Book ============================
function diffPips(tier) {
  return `<span class="rb-diff rb-diff-${tier}">${"●".repeat(tier)}${"○".repeat(5 - tier)} ${TIER_LABEL[tier]}</span>`;
}
function rbCard(r) {
  const g = GLASS_BY_ID[r.glass];
  const m = METHOD_BY_ID[r.method];
  const garnish = GARNISH_BY_ID[r.garnish[0]];
  const ings = r.ingredients
    .map((i) => {
      const ing = INGREDIENT_BY_ID[i.id];
      return `<li><span class="rb-amt">${i.amount} ${ing.unit}</span> ${ing.name}</li>`;
    })
    .join("");
  const card = document.createElement("div");
  card.className = "rb-item";
  card.innerHTML = `
    <div class="rb-top">
      <span class="rb-name">${r.name}</span>
      <span class="rb-tags">${g.emoji} ${g.name} · ${m.emoji} ${m.name}</span>
    </div>
    ${diffPips(r.diff)}
    <p class="rb-order">${r.order}</p>
    <ul class="rb-ings">${ings}</ul>
    <div class="rb-garnish">Garnish: ${garnish.emoji ? garnish.emoji + " " : ""}${garnish.name}</div>`;
  return card;
}
function renderRecipeBook() {
  const el = $("#recipes-list");
  el.innerHTML = "";
  const sub = $("#recipes-sub");
  const pool = drinkPool();
  if (sub) sub.textContent = isUnderage()
    ? `${pool.length} mocktails — easy to hard. Glass, method, build & garnish.`
    : `${pool.length} drinks across cocktails & shots — easy to hard.`;

  const sections = isUnderage()
    ? [["Mocktails", pool]]
    : [["Cocktails", pool.filter((r) => r.kind === "cocktail")], ["Shots", pool.filter((r) => r.kind === "shot")]];

  sections.forEach(([title, list]) => {
    if (!list.length) return;
    const head = document.createElement("p");
    head.className = "rb-section";
    head.textContent = `${title} (${list.length})`;
    el.appendChild(head);
    list.forEach((r) => el.appendChild(rbCard(r)));
  });
}

$("#btn-recipes").addEventListener("click", () => {
  Sound.init();
  Sound.click();
  renderRecipeBook();
  showScreen("screen-recipes");
});
$("#btn-recipes-back").addEventListener("click", () => showScreen("screen-start"));

// ============================ Endless finish actions ============================
$("#btn-endless-again").addEventListener("click", () => {
  state.totalScore = 0;
  state.starsEarned = 0;
  state.lives = 3;
  state.streak = 0;
  state.bestStreak = 0;
  state.served = 0;
  state.lastEndlessIdx = -1;
  displayedScore = 0;
  Sound.coin();
  loadEndless();
});
$("#btn-endless-menu").addEventListener("click", () => {
  renderStartBest();
  showScreen("screen-start");
});

// ============================ Profile / age gate ============================
function openProfileForm(blank = false) {
  const p = blank ? null : getProfile();
  $("#pf-name").value = p?.name || "";
  $("#pf-age").value = p?.age || "";
  $("#pf-location").value = p?.location || "";
  $("#pf-email").value = p?.email || "";
  setSegActive("pf-units", p?.units || "metric");
  $("#pf-error").textContent = "";
  showScreen("screen-profile");
  setTimeout(() => $("#pf-name").focus(), 50);
}

// Segmented control helpers (used by the units pickers).
function setSegActive(id, value) {
  const grp = document.getElementById(id);
  if (!grp) return;
  grp.querySelectorAll(".seg-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.units === value));
}
function segValue(id) {
  const el = document.querySelector(`#${id} .seg-tab.is-active`);
  return el ? el.dataset.units : "metric";
}
function wireSeg(id, onPick) {
  const grp = document.getElementById(id);
  if (!grp) return;
  grp.querySelectorAll(".seg-tab").forEach((t) => {
    t.addEventListener("click", () => {
      grp.querySelectorAll(".seg-tab").forEach((x) => x.classList.remove("is-active"));
      t.classList.add("is-active");
      if (onPick) onPick(t.dataset.units);
    });
  });
}
wireSeg("pf-units");

$("#profile-form").addEventListener("submit", (e) => {
  e.preventDefault();
  Sound.init();
  const name = ($("#pf-name").value || "").trim();
  const age = parseInt($("#pf-age").value, 10);
  const location = ($("#pf-location").value || "").trim();
  const email = ($("#pf-email").value || "").trim();
  const err = $("#pf-error");
  if (!name) { err.textContent = "Please enter your name."; $("#pf-name").focus(); return; }
  if (!Number.isFinite(age) || age < 1 || age > 120) { err.textContent = "Please enter a valid age (1–120)."; $("#pf-age").focus(); return; }
  const existing = getProfile();
  const profile = {
    id: existing?.id || (email || genId()),
    name, age, location, email,
    units: segValue("pf-units"),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  setProfile(profile);
  applyProfile();
  renderStartBest();
  Sound.coin();
  // First-timers meet Old Tom before they reach the bar; returning editors skip it.
  maybePlayIntro(() => { onShowStart(); showScreen("screen-start"); });
});

$("#btn-edit-profile").addEventListener("click", () => {
  Sound.click();
  openProfileForm();
});

// ============================ Intro comic reel ============================
// A short cinematic where Old Tom, a veteran duck bartender, takes a young
// protégé under his wing. Plays once after sign-up (before the first level)
// and can be replayed from Settings.
const INTRO_COMIC = [
  { img: "assets/comic/comic1.png", kind: "narration", text: "Every great bartender starts behind someone else's bar." },
  { img: "assets/comic/comic2.png", kind: "say", who: "Old Tom", text: "Come in out of the rain, kid. The Last Call doesn't bite\u2026 much." },
  { img: "assets/comic/comic3.png", kind: "say", who: "Old Tom", text: "First lesson: respect the glass, the pour, the guest. Every drop has its place." },
  { img: "assets/comic/comic4.png", kind: "say", who: "Old Tom", text: "Shake it when it's bright. Stir it when it's strong. Feel the drink." },
  { img: "assets/comic/comic5.png", kind: "narration", text: "The first pour is always shaky. That's how the hands learn." },
  { img: "assets/comic/comic6.png", kind: "say", who: "Old Tom", text: "The bar's yours tonight. Make every pour count." },
];

let comicIndex = 0;
let comicOnDone = null;
let comicPreloaded = false;

function preloadComic() {
  if (comicPreloaded) return;
  comicPreloaded = true;
  INTRO_COMIC.forEach((p) => { const im = new Image(); im.src = p.img; });
}

function renderComicPanel(i) {
  const p = INTRO_COMIC[i];
  if (!p) return;
  const img = $("#comic-img");
  const cap = $("#comic-caption");
  img.src = p.img;
  img.alt = p.kind === "say" ? `${p.who}: ${p.text}` : p.text;
  cap.innerHTML = p.kind === "say"
    ? `<p class="comic-say"><span class="comic-who">${p.who}</span>\u201c${p.text}\u201d</p>`
    : `<p class="comic-narration">${p.text}</p>`;

  // Replay the entry animation.
  const panel = $("#comic-panel");
  panel.classList.remove("comic-anim");
  void panel.offsetWidth;
  panel.classList.add("comic-anim");

  // Dots.
  const dots = $("#comic-dots");
  dots.innerHTML = "";
  INTRO_COMIC.forEach((_, k) => {
    const d = document.createElement("span");
    d.className = "comic-dot" + (k === i ? " is-active" : k < i ? " is-done" : "");
    dots.appendChild(d);
  });

  const last = i === INTRO_COMIC.length - 1;
  $("#comic-next").textContent = last ? "Start my shift \u2192" : "Next \u2192";
  $("#comic-tap-hint").style.display = last ? "none" : "";
}

function playIntro(onDone) {
  comicOnDone = onDone || null;
  comicIndex = 0;
  preloadComic();
  renderComicPanel(0);
  showScreen("screen-intro");
}

// Plays the intro only the first time; otherwise runs the callback immediately.
function maybePlayIntro(onDone) {
  if (introSeen()) { if (onDone) onDone(); return; }
  playIntro(onDone);
}

function comicNext() {
  Sound.click();
  if (comicIndex >= INTRO_COMIC.length - 1) { finishIntro(); return; }
  comicIndex += 1;
  renderComicPanel(comicIndex);
}

function finishIntro() {
  markIntroSeen();
  const done = comicOnDone;
  comicOnDone = null;
  if (done) done();
  else { onShowStart(); showScreen("screen-start"); }
}

$("#comic-next").addEventListener("click", comicNext);
$("#comic-panel").addEventListener("click", comicNext);
$("#comic-skip").addEventListener("click", () => { Sound.click(); finishIntro(); });

// ============================ Settings ============================
function syncSoundButtons() {
  const sb = $("#btn-sound");
  if (sb) sb.textContent = Sound.enabled ? "🔊" : "🔇";
}

function openSettings() {
  const p = getProfile();
  setSegActive("set-units", useImperial() ? "imperial" : "metric");
  const snd = $("#set-sound");
  snd.textContent = Sound.enabled ? "On" : "Off";
  snd.setAttribute("aria-pressed", Sound.enabled ? "true" : "false");
  const amb = $("#set-ambient");
  amb.textContent = Sound.ambientEnabled ? "On" : "Off";
  amb.setAttribute("aria-pressed", Sound.ambientEnabled ? "true" : "false");
  $("#set-account-who").textContent = p ? `Signed in as ${p.name}${p.age ? " · " + p.age : ""}` : "";
  showScreen("screen-settings");
}

// Clear the current identity (and any backend session) and return to the gate.
function logoutToGate() {
  try {
    localStorage.removeItem(PROFILE_KEY);
    Object.keys(localStorage).filter((k) => k.startsWith("sb-")).forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
  applyProfile();
  openProfileForm(true);
}

$("#btn-settings").addEventListener("click", () => { Sound.init(); Sound.click(); openSettings(); });
$("#btn-settings-back").addEventListener("click", () => { Sound.click(); onShowStart(); showScreen("screen-start"); });

wireSeg("set-units", (units) => {
  const p = getProfile();
  if (p) { p.units = units; p.updatedAt = Date.now(); setProfile(p); }
  Sound.click();
});

$("#set-sound").addEventListener("click", () => {
  Sound.init();
  const on = Sound.toggle();
  const s = getSettings(); s.sound = on; setSettings(s);
  $("#set-sound").textContent = on ? "On" : "Off";
  $("#set-sound").setAttribute("aria-pressed", on ? "true" : "false");
  syncSoundButtons();
  if (on) Sound.click();
});

$("#set-ambient").addEventListener("click", () => {
  Sound.init();
  const on = Sound.toggleAmbient();
  $("#set-ambient").textContent = on ? "On" : "Off";
  $("#set-ambient").setAttribute("aria-pressed", on ? "true" : "false");
  $("#btn-ambient").classList.toggle("is-active", on);
  if (on) Sound.click();
});

$("#set-replay-intro").addEventListener("click", () => { Sound.click(); playIntro(() => openSettings()); });
$("#set-edit").addEventListener("click", () => { Sound.click(); openProfileForm(); });
$("#set-switch").addEventListener("click", () => { Sound.click(); logoutToGate(); });
$("#set-logout").addEventListener("click", () => {
  if (window.confirm("Log out? You'll return to the sign-in screen. Your progress stays on this device.")) {
    logoutToGate();
  }
});

// ============================ Debug / testing toolbar ============================
// Wipe all saved identity + progress (and any backend session) and reload so the
// game boots completely fresh at the profile gate.
function resetEverything() {
  try {
    // Remove this game's keys plus any Supabase auth session tokens.
    Object.keys(localStorage)
      .filter((k) => k.startsWith("lastcall_") || k.startsWith("sb-"))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* ignore */ }
  try { sessionStorage.clear(); } catch (e) { /* ignore */ }
  location.reload();
}

// Only expose debug tools on localhost or when ?debug is in the URL — never to
// real players on the live site.
function debugEnabled() {
  const h = location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "";
  const hasFlag = /[?&]debug\b/.test(location.search) || location.hash.includes("debug");
  return isLocal || hasFlag;
}

(function initDebugToolbar() {
  const bar = $("#debug-toolbar");
  const toggle = $("#dbg-toggle");
  const reset = $("#dbg-reset");
  if (!bar || !toggle || !reset) return;
  if (!debugEnabled()) { bar.remove(); return; }
  bar.style.display = "";
  toggle.addEventListener("click", () => bar.classList.toggle("is-open"));
  reset.addEventListener("click", () => {
    const ok = window.confirm(
      "Reset everything?\n\nThis wipes your profile/identity and all progress (map, stars, streaks, badges, My Bar, high scores) and restarts the game fresh."
    );
    if (ok) resetEverything();
  });
})();

// Boot: show the age gate on first visit, otherwise the start screen.
Sound.enabled = getSettings().sound !== false; // restore the saved sound preference
syncSoundButtons();
checkBadges();
if (!getProfile()) {
  openProfileForm(true);
} else {
  onShowStart();
}

// Debug-only deep link to preview the intro reel directly (localhost or ?debug).
if (debugEnabled() && location.hash.includes("introtest")) {
  playIntro(() => { onShowStart(); showScreen("screen-start"); });
  const m = location.hash.match(/introtest(\d+)/);
  if (m) { comicIndex = Math.min(parseInt(m[1], 10), INTRO_COMIC.length - 1); renderComicPanel(comicIndex); }
}

// Connect to the backend in the background (no-op if not configured yet).
if (getProfile()) {
  Backend.initBackend(getProfile()).then((ok) => { if (ok) syncBackendStats(); });
}

// Community
$("#btn-community").addEventListener("click", () => {
  Sound.init();
  Sound.click();
  renderCommunity();
  showScreen("screen-community");
});
$("#btn-community-back").addEventListener("click", () => showScreen("screen-start"));
document.querySelectorAll("#community-tabs .seg-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#community-tabs .seg-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    communitySort = tab.dataset.sort;
    Sound.click();
    renderCommunity();
  });
});

// Leaderboard
$("#btn-leaderboard").addEventListener("click", () => {
  Sound.init();
  Sound.click();
  renderLeaderboard();
  showScreen("screen-leaderboard");
});
$("#btn-leaderboard-back").addEventListener("click", () => showScreen("screen-start"));
document.querySelectorAll("#leaderboard-tabs .seg-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#leaderboard-tabs .seg-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    lbBoard = tab.dataset.board;
    Sound.click();
    renderLeaderboard();
  });
});

// Share an invention from the Mixologist result screen.
$("#btn-mix-share").addEventListener("click", () => {
  if (!lastMix) return;
  const nameEl = $("#mix-name");
  const name = nameEl && nameEl.textContent && nameEl.textContent !== "Your Creation" ? nameEl.textContent : "Untitled Creation";
  shareCreationToCommunity({
    name,
    recipe: lastMix.build,
    score: lastMix.panel ? lastMix.panel.total : lastMix.result.score,
    verdict: lastMix.panel ? lastMix.panel.verdict : lastMix.result.verdict,
    family: lastMix.result.family,
  }, $("#btn-mix-share"));
});

$("#btn-how").addEventListener("click", () => $("#modal-how").classList.add("is-open"));
$("#btn-close-how").addEventListener("click", () => $("#modal-how").classList.remove("is-open"));
$("#modal-how").addEventListener("click", (e) => {
  if (e.target.id === "modal-how") $("#modal-how").classList.remove("is-open");
});
