# Kokpunkten

Recipes, straight to the point. A mobile-first web app with no life stories: just ingredients, steps, timers, and short notes on the technique and chemistry behind a dish. The goal is to compare several versions of the same dish side by side.

## What works now

- **Add recipes through your own AI assistant.** The app builds a prompt for a dish (or a URL or book page). You paste the assistant's JSON answer back in, and the app validates it with clear, per-field errors.
- **Cooking view:** scale servings, convert to metric, check off ingredients and steps, run step timers, and keep the screen awake.
- **Your data:** favorites, a 1–5 rating and personal notes. Everything is stored on the device (IndexedDB); there is no sign-in yet.
- Installable as an app (PWA) and works offline once loaded.

## Recipe format

`kokpunkten.recipe/v0`, defined in [`src/lib/recipe/schema.ts`](src/lib/recipe/schema.ts), with an example in [`sample.ts`](src/lib/recipe/sample.ts). The key fields:

- `dish`: a shared slug that groups versions of the same dish.
- `ingredients[].key` and `role`: a canonical name and the culinary slot the ingredient fills. These let versions be compared, for example guanciale and pancetta both fill `cured-pork`.
- `steps[].uses`: the ingredients and earlier steps a step consumes. These form a dependency graph for a diagram view.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run check    # type check
```

## Next

1. Import from a recipe URL (schema.org Recipe JSON-LD, which needs a small server endpoint).
2. Diff view: common ground and alternatives across the versions of one dish.
3. Diagram view generated from `steps[].uses`.
4. Optional sign-in and sync (Supabase), and search by ingredient or cuisine.
