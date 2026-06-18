# Last Call — a bartending game

Mix cocktails to order across 8 stages. You prepare each drink **step by step
like a real bartender** at an animated bar station: choose the glass, pour the
ingredients (with a live pour + fill animation), apply a preparation method
(shake/stir/build/muddle/blend with matching animations), and add a garnish.
You're scored on accuracy and earn up to 3 stars per drink.

All measurements use the **metric system** (millilitres, plus dashes/leaves for
specials).

## Difficulty

- **Basic** — you only choose the **ingredients** and **garnish**; the correct
  glass and method are auto-selected (and auto-animated for you).
- **Advanced** — you choose **everything**: glass, pour, method and garnish.

## How to play

1. Pick a difficulty and read the **Customer Order** ticket.
2. Work through the steps shown in the tracker (**Glass → Pour → Mix → Garnish
   → Serve**), using **Back/Next** to move between them.
3. Tap ingredients from the catalog to add them, then dial in each amount in
   **ml** (some, like bitters or mint, use dashes/leaves). Watch them pour into
   the glass and stack into layers; shaking/stirring/blending mixes them into a
   single colour.
4. Pick a **Garnish** and hit **Serve Drink**.
5. Review the feedback, then continue to the next stage. Pours within a small
   tolerance still earn points; nail them exactly for full marks.

## Run it

It's plain HTML/CSS/JS with ES modules, so it needs to be served over HTTP
(opening `index.html` directly via `file://` will block module loading).

Pick any one of these from the project folder:

```bash
# Python 3
python -m http.server 8000

# or Node (if you have it)
npx serve .
```

Then open <http://localhost:8000> in your browser.

## Project structure

- `index.html` — screens and layout (start, game, result, finish).
- `styles.css` — bar-themed styling.
- `data.js` — catalogs (glasses, methods, ingredients, garnishes) and the 8
  cocktail recipes. **Add or tweak cocktails here.**
- `game.js` — game flow, drink building, and scoring.

## Adding a cocktail

Append an entry to `RECIPES` in `data.js`:

```js
{
  id: "gin_tonic",
  name: "Gin & Tonic",
  order: "Gin lengthened with tonic over ice — crisp and simple.",
  glass: "highball",
  method: "build",
  ingredients: [
    { id: "gin", amount: 50 },
    { id: "tonic_water", amount: 150 },
  ],
  garnish: ["lime_wheel", "lemon_twist"],
}
```

If you need a new ingredient/glass/garnish, add it to the relevant catalog array
in the same file first.
