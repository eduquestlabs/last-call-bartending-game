import {
  GLASSES,
  METHODS,
  INGREDIENTS,
  GARNISHES,
  RECIPES,
  INGREDIENT_BY_ID,
  GLASS_BY_ID,
  METHOD_BY_ID,
  GARNISH_BY_ID,
} from "./data.js";
import { Sound } from "./sound.js";

// ============================ Game state ============================
const state = {
  difficulty: "basic", // 'basic' | 'advanced'
  stage: 0,
  totalScore: 0,
  starsEarned: 0,
  steps: [],
  stepIndex: 0,
  mixed: false, // true once a shake/stir/blend has blended the liquids
  build: emptyBuild(),
};

function emptyBuild() {
  return { glass: null, method: null, garnish: null, ingredients: [] };
}

// ============================ High score (localStorage) ============================
const HIGH_SCORE_KEY = "lastcall_highscore";
function getHighScore() {
  return Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
}
function setHighScore(v) {
  try { localStorage.setItem(HIGH_SCORE_KEY, String(v)); } catch (e) { /* ignore */ }
}
function renderStartBest() {
  const best = getHighScore();
  $("#start-best").textContent = best > 0 ? `🏅 Best score: ${best} pts` : "";
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
  const frac = (state.stage + state.stepIndex / stepsCount) / RECIPES.length;
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
    mount.innerHTML = `<div class="glass-ghost">Select a glass<br />to begin</div>`;
    return;
  }
  const glass = document.createElement("div");
  glass.className = `glass tpl-${g.tpl}`;

  const bowl = document.createElement("div");
  bowl.className = "bowl";
  bowl.style.width = g.w + "px";
  bowl.style.height = g.h + "px";
  const stack = document.createElement("div");
  stack.className = "liquid-stack";
  bowl.appendChild(stack);
  glass.appendChild(bowl);

  if (g.stem) {
    const stem = document.createElement("div");
    stem.className = "stem";
    const foot = document.createElement("div");
    foot.className = "foot";
    glass.appendChild(stem);
    glass.appendChild(foot);
  }
  mount.appendChild(glass);
  updateLiquid();
  applyGarnishVisual();
}

function updateLiquid() {
  const stack = $("#glass-mount .liquid-stack");
  const g = currentGlass();
  if (!stack || !g) return;

  const mlIngs = state.build.ingredients.filter((i) => INGREDIENT_BY_ID[i.id].unit === "ml");
  const nonMl = state.build.ingredients.filter((i) => INGREDIENT_BY_ID[i.id].unit !== "ml");
  const totalMl = mlIngs.reduce((s, i) => s + i.amount, 0);
  const maxFill = g.h * 0.94;
  const fillPx = totalMl > 0 ? Math.min(maxFill, (totalMl / g.cap) * maxFill) : 0;

  // Mixed: a single uniform layer of the blended colour.
  if (state.mixed) {
    stack.innerHTML = "";
    const layer = document.createElement("div");
    layer.className = "liquid-layer top-layer";
    layer.dataset.id = "__mix__";
    layer.style.backgroundColor = mixColor(state.build.ingredients);
    layer.style.height = "0px";
    stack.appendChild(layer);
    const target = Math.max(10, fillPx + nonMl.length * 8);
    requestAnimationFrame(() => (layer.style.height = target + "px"));
    return;
  }

  // Layered: one band per ingredient (proportional for ml, fixed for specials).
  const desired = [
    ...mlIngs.map((i) => ({ id: i.id, px: totalMl > 0 ? (i.amount / totalMl) * fillPx : 0 })),
    ...nonMl.map((i) => ({ id: i.id, px: 8 })),
  ];
  const existing = new Map([...stack.children].map((c) => [c.dataset.id, c]));
  desired.forEach((d) => {
    let el = existing.get(d.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "liquid-layer";
      el.dataset.id = d.id;
      el.style.height = "0px";
      el.style.backgroundColor = INGREDIENT_BY_ID[d.id].color;
      stack.appendChild(el);
      requestAnimationFrame(() => (el.style.height = d.px + "px"));
    } else {
      el.style.backgroundColor = INGREDIENT_BY_ID[d.id].color;
      el.style.height = d.px + "px";
    }
    existing.delete(d.id);
  });
  existing.forEach((el) => el.remove());
  // Re-order DOM to match desired (column-reverse: last child = top).
  desired.forEach((d) => {
    const el = stack.querySelector(`[data-id="${CSS.escape(d.id)}"]`);
    if (el) stack.appendChild(el);
  });
  [...stack.children].forEach((c) => c.classList.remove("top-layer"));
  if (stack.lastElementChild) stack.lastElementChild.classList.add("top-layer");
}

function animatePour(id) {
  const stream = $("#pour-stream");
  stream.style.color = INGREDIENT_BY_ID[id].color;
  stream.classList.remove("is-pouring");
  void stream.offsetWidth; // reflow to restart animation
  stream.classList.add("is-pouring");
  setTimeout(() => stream.classList.remove("is-pouring"), 720);
  Sound.pour();
  updateLiquid();
}

function applyGarnishVisual() {
  const bowl = $("#glass-mount .bowl");
  if (!bowl) return;
  bowl.querySelectorAll(".garnish-badge, .salt-rim").forEach((e) => e.remove());
  const gid = state.build.garnish;
  if (!gid || gid === "none") return;
  if (gid === "salt_rim") {
    const rim = document.createElement("div");
    rim.className = "salt-rim";
    bowl.appendChild(rim);
    return;
  }
  const badge = document.createElement("div");
  badge.className = "garnish-badge";
  badge.textContent = GARNISH_BY_ID[gid].emoji;
  bowl.appendChild(badge);
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
  panel.innerHTML = `
    <h3 class="step-panel-title">${meta.title}</h3>
    <p class="step-panel-sub">${meta.sub}</p>
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
  const cats = [...new Set(INGREDIENTS.map((i) => i.cat))];
  cats.forEach((cat) => {
    const group = document.createElement("div");
    group.innerHTML = `<p class="cat-group-title">${cat}</p>`;
    const items = document.createElement("div");
    items.className = "cat-items";
    INGREDIENTS.filter((i) => i.cat === cat).forEach((ing) => {
      const btn = document.createElement("button");
      btn.className = "cat-item" + (added.has(ing.id) ? " is-added" : "");
      btn.textContent = ing.name;
      btn.addEventListener("click", () => addIngredient(ing.id));
      items.appendChild(btn);
    });
    group.appendChild(items);
    el.appendChild(group);
  });
}

function fillBuildList() {
  const el = $("#build-list");
  if (!el) return;
  el.innerHTML = "";
  if (state.build.ingredients.length === 0) {
    el.innerHTML = `<p class="build-empty">No ingredients yet. Tap one to add it.</p>`;
    return;
  }
  state.build.ingredients.forEach((entry) => {
    const ing = INGREDIENT_BY_ID[entry.id];
    const meta = unitMeta(ing.unit);
    const row = document.createElement("div");
    row.className = "build-row";
    row.innerHTML = `
      <span class="ing-name">${ing.name}</span>
      <div class="stepper">
        <button data-act="dec">−</button>
        <input type="number" value="${entry.amount}" min="${meta.min}" step="${meta.step}" />
        <button data-act="inc">+</button>
      </div>
      <span class="unit">${ing.unit}</span>
      <button class="remove-btn" title="Remove">×</button>
    `;
    const input = row.querySelector("input");
    row.querySelector('[data-act="dec"]').addEventListener("click", () => changeAmount(entry.id, entry.amount - meta.step, false));
    row.querySelector('[data-act="inc"]').addEventListener("click", () => changeAmount(entry.id, entry.amount + meta.step, true));
    input.addEventListener("change", () => changeAmount(entry.id, Number(input.value) || 0, false));
    row.querySelector(".remove-btn").addEventListener("click", () => removeIngredient(entry.id));
    el.appendChild(row);
  });
}

function addIngredient(id) {
  if (state.build.ingredients.some((i) => i.id === id)) return;
  state.mixed = false; // adding changes the build; un-blend
  const meta = unitMeta(INGREDIENT_BY_ID[id].unit);
  state.build.ingredients.push({ id, amount: meta.def });
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
  updateNav();
  updateProgress();
}

async function goNext() {
  const cur = state.steps[state.stepIndex];
  if (state.stepIndex < state.steps.length - 1) {
    // Basic mode auto-applies the (correct) method between pour and garnish.
    if (cur === "ingredients" && state.difficulty === "basic") {
      const panel = $("#step-panel");
      panel.innerHTML = `<div class="auto-note">Auto-preparing with the <strong>${METHOD_BY_ID[state.build.method].name}</strong> method…</div>`;
      await runMethod(state.build.method);
    }
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
  state.stage = index;
  state.build = emptyBuild();
  state.mixed = false;
  const recipe = RECIPES[index];

  // Basic mode: glass & method are chosen automatically.
  if (state.difficulty === "basic") {
    state.build.glass = recipe.glass;
    state.build.method = recipe.method;
  }
  state.steps = getSteps(state.difficulty);
  state.stepIndex = 0;

  $("#stage-pill").textContent = `Stage ${index + 1} / ${RECIPES.length}`;
  $("#diff-pill").textContent = state.difficulty === "basic" ? "Basic" : "Advanced";
  $("#order-name").textContent = recipe.name;
  $("#order-desc").textContent = recipe.order;
  animatePoints(state.totalScore);
  updateProgress();

  renderStation();
  enterStep();
  showScreen("screen-game");
}

// ============================ Scoring ============================
function tolerance(unit, target) {
  if (unit === "ml") return Math.max(7.5, target * 0.2);
  return 0;
}

function scoreBuild() {
  const recipe = RECIPES[state.stage];
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

  recipe.ingredients.forEach((target) => {
    const ing = INGREDIENT_BY_ID[target.id];
    maxPoints += 2;
    if (!builtMap.has(target.id)) {
      feedback.push(fb("bad", ing.name, `Missing — needs ${target.amount} ${ing.unit}.`));
      return;
    }
    const have = builtMap.get(target.id);
    const diff = Math.abs(have - target.amount);
    const allow = ing.unit === "ml" ? tolerance(ing.unit, target.amount) : 1;
    const perfect = ing.unit === "ml" ? Math.max(2.5, target.amount * 0.07) : 0;
    if (diff <= perfect) {
      points += 2;
      feedback.push(fb("ok", ing.name, `${have} ${ing.unit} — spot on (target ${target.amount}).`));
    } else if (diff <= allow) {
      points += 1;
      feedback.push(fb("near", ing.name, `${have} ${ing.unit} — close (target ${target.amount}).`));
    } else {
      feedback.push(fb("bad", ing.name, `${have} ${ing.unit} — off (target ${target.amount}).`));
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
  const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 45 ? 1 : 0;
  return { pct, stars, stagePoints: points * 10, feedback };
}

function fb(kind, label, text) {
  return { kind, label, text };
}

// ============================ Result / finish ============================
let lastResult = null;

function serve() {
  lastResult = scoreBuild();
  state.totalScore += lastResult.stagePoints;
  state.starsEarned += lastResult.stars;
  if (lastResult.stars === 0) Sound.fail();
  showResult(lastResult);
}

function showResult(result) {
  const recipe = RECIPES[state.stage];
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

  $("#result-pct").textContent = result.pct;
  $("#result-points").textContent = result.stagePoints;

  const list = $("#feedback-list");
  list.innerHTML = "";
  result.feedback.forEach((f) => {
    const icon = f.kind === "ok" ? "✓" : f.kind === "near" ? "≈" : "✗";
    const li = document.createElement("li");
    li.innerHTML = `<span class="fb-icon fb-${f.kind}">${icon}</span><span class="fb-text"><strong>${f.label}:</strong> <span>${f.text}</span></span>`;
    list.appendChild(li);
  });

  const isLast = state.stage === RECIPES.length - 1;
  $("#btn-next-stage").textContent = isLast ? "See results →" : "Next stage →";
  showScreen("screen-result");
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

  const maxStars = RECIPES.length * 3;
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
// Difficulty selection
document.querySelectorAll(".diff-card").forEach((card) => {
  card.addEventListener("click", () => {
    Sound.init();
    Sound.click();
    document.querySelectorAll(".diff-card").forEach((c) => c.classList.remove("is-selected"));
    card.classList.add("is-selected");
    state.difficulty = card.dataset.diff;
  });
});

$("#btn-start").addEventListener("click", () => {
  Sound.init();
  Sound.coin();
  state.totalScore = 0;
  state.starsEarned = 0;
  displayedScore = 0;
  loadStage(0);
});

$("#btn-sound").addEventListener("click", () => {
  Sound.init();
  const on = Sound.toggle();
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
  if (lastResult) {
    state.totalScore -= lastResult.stagePoints;
    state.starsEarned -= lastResult.stars;
    lastResult = null;
  }
  loadStage(state.stage);
});

$("#btn-next-stage").addEventListener("click", () => {
  lastResult = null;
  if (state.stage < RECIPES.length - 1) loadStage(state.stage + 1);
  else showFinish();
});

$("#btn-replay").addEventListener("click", () => {
  state.totalScore = 0;
  state.starsEarned = 0;
  displayedScore = 0;
  loadStage(0);
});

$("#btn-quit").addEventListener("click", () => {
  renderStartBest();
  showScreen("screen-start");
});

// Show the best score on first load.
renderStartBest();

$("#btn-how").addEventListener("click", () => $("#modal-how").classList.add("is-open"));
$("#btn-close-how").addEventListener("click", () => $("#modal-how").classList.remove("is-open"));
$("#modal-how").addEventListener("click", (e) => {
  if (e.target.id === "modal-how") $("#modal-how").classList.remove("is-open");
});
