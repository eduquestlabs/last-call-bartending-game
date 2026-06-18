// ============================================================================
// Catalogs: glasses, methods, ingredients, garnishes
// All liquid measurements use the metric system (millilitres, ml).
// ============================================================================

// `tpl` selects the CSS shape template; `w`/`h` size the bowl (px);
// `cap` is the reference capacity (ml) used to scale the liquid fill;
// `stem` adds a stem + foot.
export const GLASSES = [
  { id: "rocks", name: "Rocks (Old Fashioned)", emoji: "🥃", tpl: "tumbler", w: 132, h: 120, cap: 220, stem: false },
  { id: "highball", name: "Highball", emoji: "🥤", tpl: "tumbler", w: 96, h: 210, cap: 320, stem: false },
  { id: "collins", name: "Collins", emoji: "🥤", tpl: "tumbler", w: 84, h: 240, cap: 360, stem: false },
  { id: "coupe", name: "Coupe", emoji: "🍸", tpl: "bowl", w: 168, h: 96, cap: 200, stem: true },
  { id: "martini", name: "Martini", emoji: "🍸", tpl: "cone", w: 184, h: 124, cap: 180, stem: true },
  { id: "margarita", name: "Margarita", emoji: "🍹", tpl: "marg", w: 192, h: 116, cap: 250, stem: true },
  { id: "hurricane", name: "Hurricane", emoji: "🍹", tpl: "hurricane", w: 122, h: 212, cap: 420, stem: true },
  { id: "wine", name: "Wine", emoji: "🍷", tpl: "bowl", w: 140, h: 134, cap: 250, stem: true },
  { id: "shot", name: "Shot", emoji: "🥃", tpl: "tumbler", w: 72, h: 82, cap: 60, stem: false },
];

export const METHODS = [
  { id: "shake", name: "Shake", emoji: "🤝", hint: "Chill & combine with ice in a shaker." },
  { id: "stir", name: "Stir", emoji: "🥄", hint: "Gently stir with ice to chill & dilute." },
  { id: "build", name: "Build", emoji: "🧱", hint: "Build directly in the serving glass." },
  { id: "muddle", name: "Muddle", emoji: "🪵", hint: "Crush ingredients to release flavour." },
  { id: "blend", name: "Blend", emoji: "🌀", hint: "Blend with ice for a frozen drink." },
];

// unit: "ml" for liquids, "dash" / "leaf" / "piece" for specials.
// color: liquid colour used for the pour/fill animation.
export const INGREDIENTS = [
  // Spirits
  { id: "white_rum", name: "White Rum", unit: "ml", cat: "Spirits", color: "#efe9d0" },
  { id: "dark_rum", name: "Dark Rum", unit: "ml", cat: "Spirits", color: "#7a431d" },
  { id: "gin", name: "Gin", unit: "ml", cat: "Spirits", color: "#e6eef0" },
  { id: "vodka", name: "Vodka", unit: "ml", cat: "Spirits", color: "#eaf2f6" },
  { id: "citron_vodka", name: "Citron Vodka", unit: "ml", cat: "Spirits", color: "#eaf0c8" },
  { id: "tequila", name: "Tequila", unit: "ml", cat: "Spirits", color: "#f1e7bf" },
  { id: "bourbon", name: "Bourbon", unit: "ml", cat: "Spirits", color: "#c06b22" },
  { id: "cognac", name: "Cognac", unit: "ml", cat: "Spirits", color: "#9c5018" },

  // Liqueurs / fortified
  { id: "triple_sec", name: "Triple Sec", unit: "ml", cat: "Liqueurs", color: "#f2dd97" },
  { id: "campari", name: "Campari", unit: "ml", cat: "Liqueurs", color: "#b11226" },
  { id: "aperol", name: "Aperol", unit: "ml", cat: "Liqueurs", color: "#ff7a18" },
  { id: "sweet_vermouth", name: "Sweet Vermouth", unit: "ml", cat: "Liqueurs", color: "#6e2c1c" },
  { id: "dry_vermouth", name: "Dry Vermouth", unit: "ml", cat: "Liqueurs", color: "#e6ead0" },
  { id: "coffee_liqueur", name: "Coffee Liqueur", unit: "ml", cat: "Liqueurs", color: "#34190e" },

  // Juices & mixers
  { id: "lime_juice", name: "Lime Juice", unit: "ml", cat: "Juices & Mixers", color: "#b9d96a" },
  { id: "lemon_juice", name: "Lemon Juice", unit: "ml", cat: "Juices & Mixers", color: "#eee46a" },
  { id: "cranberry_juice", name: "Cranberry Juice", unit: "ml", cat: "Juices & Mixers", color: "#a01234" },
  { id: "orange_juice", name: "Orange Juice", unit: "ml", cat: "Juices & Mixers", color: "#ff9a1f" },
  { id: "pineapple_juice", name: "Pineapple Juice", unit: "ml", cat: "Juices & Mixers", color: "#efc83f" },
  { id: "sugar_syrup", name: "Sugar Syrup", unit: "ml", cat: "Juices & Mixers", color: "#e3ddc8" },
  { id: "grenadine", name: "Grenadine", unit: "ml", cat: "Juices & Mixers", color: "#9e0f2e" },
  { id: "soda_water", name: "Soda Water", unit: "ml", cat: "Juices & Mixers", color: "#d7e9ef" },
  { id: "tonic_water", name: "Tonic Water", unit: "ml", cat: "Juices & Mixers", color: "#e6f1ec" },
  { id: "cola", name: "Cola", unit: "ml", cat: "Juices & Mixers", color: "#2f1b10" },
  { id: "ginger_beer", name: "Ginger Beer", unit: "ml", cat: "Juices & Mixers", color: "#dcae6a" },
  { id: "espresso", name: "Espresso", unit: "ml", cat: "Juices & Mixers", color: "#241009" },
  { id: "prosecco", name: "Prosecco", unit: "ml", cat: "Juices & Mixers", color: "#efe2a3" },

  // Specials (non-ml units)
  { id: "angostura", name: "Angostura Bitters", unit: "dash", cat: "Specials", color: "#6f1b1b" },
  { id: "mint", name: "Mint Leaves", unit: "leaf", cat: "Specials", color: "#3f9140" },
  { id: "egg_white", name: "Egg White", unit: "piece", cat: "Specials", color: "#f5f0e2" },
];

export const GARNISHES = [
  { id: "none", name: "No Garnish", emoji: "🚫" },
  { id: "lime_wheel", name: "Lime Wheel", emoji: "🟢" },
  { id: "lemon_twist", name: "Lemon Twist", emoji: "🍋" },
  { id: "orange_peel", name: "Orange Peel", emoji: "🍊" },
  { id: "mint_sprig", name: "Mint Sprig", emoji: "🌿" },
  { id: "olive", name: "Olive", emoji: "🫒" },
  { id: "cherry", name: "Cocktail Cherry", emoji: "🍒" },
  { id: "coffee_beans", name: "Coffee Beans", emoji: "🫘" },
  { id: "salt_rim", name: "Salt Rim", emoji: "🧂" },
  { id: "pineapple_wedge", name: "Pineapple Wedge", emoji: "🍍" },
];

// ============================================================================
// Recipes (the stages). Difficulty ascends down the list.
// `ingredients` is a list of { id, amount } in the ingredient's own unit.
// `garnish` lists acceptable garnish ids (first one shown as the "ideal").
// ============================================================================

export const RECIPES = [
  {
    id: "daiquiri",
    name: "Daiquiri",
    order: "A crisp, tart classic — clean rum, lime and a touch of sweetness, served up.",
    glass: "coupe",
    method: "shake",
    ingredients: [
      { id: "white_rum", amount: 60 },
      { id: "lime_juice", amount: 25 },
      { id: "sugar_syrup", amount: 15 },
    ],
    garnish: ["lime_wheel"],
  },
  {
    id: "negroni",
    name: "Negroni",
    order: "Equal parts, bittersweet and stirred over ice. A bracing aperitivo.",
    glass: "rocks",
    method: "stir",
    ingredients: [
      { id: "gin", amount: 30 },
      { id: "campari", amount: 30 },
      { id: "sweet_vermouth", amount: 30 },
    ],
    garnish: ["orange_peel"],
  },
  {
    id: "margarita",
    name: "Margarita",
    order: "Tequila, orange liqueur and lime — shaken, with a salted rim.",
    glass: "margarita",
    method: "shake",
    ingredients: [
      { id: "tequila", amount: 50 },
      { id: "triple_sec", amount: 20 },
      { id: "lime_juice", amount: 20 },
    ],
    garnish: ["salt_rim", "lime_wheel"],
  },
  {
    id: "old_fashioned",
    name: "Old Fashioned",
    order: "Bourbon, a little sugar and bitters, stirred down over ice. Timeless.",
    glass: "rocks",
    method: "stir",
    ingredients: [
      { id: "bourbon", amount: 60 },
      { id: "sugar_syrup", amount: 10 },
      { id: "angostura", amount: 2 },
    ],
    garnish: ["orange_peel"],
  },
  {
    id: "cosmopolitan",
    name: "Cosmopolitan",
    order: "Citron vodka, triple sec, lime and a splash of cranberry — shaken and served up.",
    glass: "martini",
    method: "shake",
    ingredients: [
      { id: "citron_vodka", amount: 45 },
      { id: "triple_sec", amount: 15 },
      { id: "lime_juice", amount: 15 },
      { id: "cranberry_juice", amount: 30 },
    ],
    garnish: ["lime_wheel"],
  },
  {
    id: "mojito",
    name: "Mojito",
    order: "Muddle mint with lime and sugar, build over ice with rum, top with soda.",
    glass: "collins",
    method: "muddle",
    ingredients: [
      { id: "white_rum", amount: 60 },
      { id: "lime_juice", amount: 30 },
      { id: "sugar_syrup", amount: 20 },
      { id: "soda_water", amount: 60 },
      { id: "mint", amount: 8 },
    ],
    garnish: ["mint_sprig"],
  },
  {
    id: "espresso_martini",
    name: "Espresso Martini",
    order: "Vodka, coffee liqueur and fresh espresso — shaken hard for a silky foam.",
    glass: "martini",
    method: "shake",
    ingredients: [
      { id: "vodka", amount: 50 },
      { id: "coffee_liqueur", amount: 20 },
      { id: "espresso", amount: 30 },
      { id: "sugar_syrup", amount: 10 },
    ],
    garnish: ["coffee_beans"],
  },
  {
    id: "dry_martini",
    name: "Dry Martini",
    order: "Gin kissed with dry vermouth, stirred ice-cold and served up. Pure finesse.",
    glass: "martini",
    method: "stir",
    ingredients: [
      { id: "gin", amount: 60 },
      { id: "dry_vermouth", amount: 10 },
    ],
    garnish: ["olive", "lemon_twist"],
  },
];

// Convenience lookups
export const INGREDIENT_BY_ID = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
export const GLASS_BY_ID = Object.fromEntries(GLASSES.map((g) => [g.id, g]));
export const METHOD_BY_ID = Object.fromEntries(METHODS.map((m) => [m.id, m]));
export const GARNISH_BY_ID = Object.fromEntries(GARNISHES.map((g) => [g.id, g]));
