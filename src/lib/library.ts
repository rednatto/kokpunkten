import { version } from '$app/env';
import { loadCatalogs } from './catalog.ts';
import { db, type StoredRecipe } from './db.ts';
import { recipeSchema, type Recipe } from './recipe/schema.ts';

const files = import.meta.glob<unknown[]>('./library/*.json', { import: 'default' });

/** Stable ids, so favorites, ratings and notes survive library updates. */
const libraryId = (dish: string, n: number) => `lib-${dish}-${n + 1}`;

/**
 * Copies the built-in library and the imported open datasets (src/lib/catalog/) into the
 * local database once per app version.
 * Existing rows keep the user's favorite, rating and note; recipes dropped from the
 * library are removed unless the user has marked them up.
 */
export async function syncLibrary(): Promise<void> {
	const seen = await db.meta.get('libraryVersion');
	if (seen?.value === version) return;

	const recipes: [string, Recipe][] = [];
	for (const load of Object.values(files)) {
		const versions = await load();
		versions.forEach((item, n) => {
			const res = recipeSchema.safeParse(item);
			if (res.success) recipes.push([libraryId(res.data.dish, n), res.data]);
			else console.warn('Skipping invalid library recipe', res.error.issues);
		});
	}
	recipes.push(...(await loadCatalogs()));

	await db.transaction('rw', db.recipes, db.meta, async () => {
		const existing = new Map((await db.recipes.filter((r) => !!r.builtin).toArray()).map((r) => [r.id, r]));
		const rows: StoredRecipe[] = recipes.map(([id, recipe], i) => {
			const old = existing.get(id);
			existing.delete(id);
			return {
				id,
				recipe,
				builtin: true,
				addedAt: old?.addedAt ?? i,
				favorite: old?.favorite ?? false,
				rating: old?.rating ?? null,
				note: old?.note ?? ''
			};
		});
		await db.recipes.bulkPut(rows);
		const stale = [...existing.values()].filter((r) => !r.favorite && r.rating == null && !r.note).map((r) => r.id);
		await db.recipes.bulkDelete(stale);
		await db.meta.put({ key: 'libraryVersion', value: version });
	});
}
