# Kokpunkten

Recipes, straight to the point. A mobile-first web app with no life stories: just ingredients, steps, timers, and short notes on the technique and chemistry behind a dish. The goal is to compare several versions of the same dish side by side.

## What works now

- **Add recipes through your own AI assistant.** The app builds a prompt for a dish (or a URL or book page). You paste the assistant's JSON answer back in, and the app validates it with clear, per-field errors.
- **Cooking view:** scale servings, check off ingredients and steps, and run step timers.
- **Kitchen tools in the header, on every page:** swaps (a recipe's own first), weights, units (metric, US cups, rough) and fractions or decimals, timers of your own next to the running step timers, and keeping the screen awake.
- **Compare versions of a dish:** merge them into your own mix (common ingredients, pick-one choices, extras), see every amount side by side in a table, or list what each version changes against another.
- **Step diagram:** a flow, timeline or tree view of a recipe's steps, built from `steps[].uses`.
- **Cook with what you have:** list a few ingredients (falukorv, potatis) to get the recipes that use them, the ones that use all of them first, with what else each needs.
- **Your data:** favorites, a 1–5 rating and personal notes. Everything is stored on the device (IndexedDB); there is no sign-in yet.
- Installable as an app (PWA) and works offline once loaded.

## Recipe format

`kokpunkten.recipe/v0`, defined in [`src/lib/recipe/schema.ts`](src/lib/recipe/schema.ts), with an example in [`sample.ts`](src/lib/recipe/sample.ts). The key fields:

- `dish`: a shared slug that groups versions of the same dish.
- `ingredients[].key` and `role`: a canonical name and the culinary slot the ingredient fills. These let versions be compared, for example guanciale and pancetta both fill `cured-pork`.
- `steps[].uses`: the ingredients and earlier steps a step consumes. These form a dependency graph for a diagram view.
- `steps[].amounts`: how much of a shared ingredient a step takes ("2 tbsp of the oil"). A step that is the only one using an ingredient takes all of it, and the one step left without an entry takes the rest. The steps and the diagram show these amounts, scaled to the servings.

## Open recipe datasets

Recipes from open datasets ship with the app next to the built-in library and are copied into the on-device database. They join library dishes when the names match, so they show up as extra versions in the compare view.

| Dataset | License | Recipes | Importer |
|---|---|---|---|
| [Public Domain Recipes](https://publicdomainrecipes.com) | Unlicense | 411 | `npm run import:pdr` |

The pipeline:

1. An adapter in [`scripts/import/`](scripts/import/) reads the dataset into "raw" recipes: a title, ingredient lines and step texts.
2. [`src/lib/import/`](src/lib/import/) normalizes them. It parses ingredient lines ("1 ½ cups flour, sifted", "2 dl grädde"), matches ingredients to the keys and roles the library uses, links steps to the ingredients they name, and reads times, temperatures and heat from the steps.
3. The result is validated against the recipe schema and written to [`src/lib/catalog/`](src/lib/catalog/), one recipe per line, with the license in `source.license`.

The importer prints the ingredients it couldn't match. Adding them to `EVERYDAY` in `vocabulary.ts` improves the next run. The URL importer can reuse the same normalizer, since schema.org recipe data has the same shape.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run check    # type check
```

## Deploy

Every push to `main` is tested, built and published to GitHub Pages at https://rednatto.github.io/kokpunkten/ by `.github/workflows/deploy.yml`. Pull requests run the same checks without deploying. Before the first deploy, GitHub Pages must be turned on once: **Settings → Pages → Source: GitHub Actions**.

The app is a static single-page app (`adapter-static`). GitHub Pages answers deep links like `/kokpunkten/r/…` with `404.html`, which is the app shell, so they work, but the first request for a deep link reports status 404.

## Next

1. Import from a recipe URL (schema.org Recipe JSON-LD, which needs a small server endpoint).
2. Method diff: align steps across versions by what they use and by technique, and show what's added, missing, reordered, or changed in heat or time.
3. Family-aware merge: merge substitutable ingredients (eggs and yolks) by family totals, round counts to something cookable, and flag outlier versions.
4. Import clean-up: rewrite imported steps as plain imperatives, move asides into notes, join duplicate dishes, and give each version a distinguishing label.
5. Optional sign-in and sync (Supabase Postgres), with a shared cache of imported recipes.
6. More datasets: Wikibooks Cookbook (CC BY-SA, needs attribution and share-alike).
