import Dexie, { type EntityTable } from 'dexie';
import { writable } from 'svelte/store';
import type { Recipe } from './recipe/schema';

export interface StoredRecipe {
	id: string;
	recipe: Recipe;
	addedAt: number;
	favorite: boolean;
	/** 1–5, or null when not rated. */
	rating: number | null;
	note: string;
	/** From the built-in library or a catalog; refreshed when its source changes, keeping the user's own fields. */
	builtin?: boolean;
}

/**
 * What the recipe list needs about a recipe, a few hundred bytes instead of the whole recipe.
 * Kept in step with `recipes` by the write helpers below, so the list never reads full recipes.
 */
export interface RecipeSummary {
	id: string;
	dish: string;
	title: string;
	/** Short name of this version among the dish's versions. */
	variant: string;
	cuisine: string[];
	addedAt: number;
	favorite: boolean;
	rating: number | null;
	/** Lowercased words the list filter searches: title, tags, course and ingredients. */
	words: string;
}

/** Everything lives on this device for now. Sign-in and sync come later. */
export const db = new Dexie('kokpunkten') as Dexie & {
	recipes: EntityTable<StoredRecipe, 'id'>;
	summaries: EntityTable<RecipeSummary, 'id'>;
	meta: EntityTable<{ key: string; value: string }, 'key'>;
};

db.version(1).stores({
	recipes: 'id, addedAt, favorite, recipe.dish, *recipe.cuisine'
});
db.version(2).stores({
	meta: 'key'
});
db.version(3)
	.stores({ summaries: 'id, dish, addedAt' })
	.upgrade(async (tx) => {
		await tx.table('summaries').bulkPut((await tx.table<StoredRecipe>('recipes').toArray()).map(summarize));
	});

/**
 * Why the database isn't usable, for the layout to show instead of an endless "Loading…".
 * "blocked": an older copy of the app, open in another tab or in the background, holds the
 * database and keeps this version from upgrading it.
 */
export const dbProblem = writable<{ kind: 'blocked' | 'slow' | 'error'; message: string } | null>(null);

db.on('blocked', () => {
	dbProblem.set({
		kind: 'blocked',
		message: 'An older copy of Kokpunkten is still open, in another tab or in the background. Close it, then reload.'
	});
});

/** Opens the database up front, so a failure is shown rather than leaving every query waiting. */
export function openDb() {
	const slow = setTimeout(
		() => dbProblem.update((p) => p ?? { kind: 'slow', message: 'The recipe database is taking unusually long to open.' }),
		10_000
	);
	return db
		.open()
		.then(() => dbProblem.set(null))
		.catch((e: Error) => {
			console.error('Could not open the database', e);
			dbProblem.set({ kind: 'error', message: `Could not open the recipe database: ${e.name}: ${e.message}` });
		})
		.finally(() => clearTimeout(slow));
}

/** Last resort when the database can't be opened: start over with an empty one. */
export async function resetDb() {
	db.close();
	await Dexie.delete('kokpunkten');
}

export const variantName = (r: Recipe) => r.source.name?.replace(/^Kokpunkten – /, '') ?? r.title;

export function summarize(row: StoredRecipe): RecipeSummary {
	const r = row.recipe;
	return {
		id: row.id,
		dish: r.dish,
		title: r.title,
		variant: variantName(r),
		cuisine: r.cuisine,
		addedAt: row.addedAt,
		favorite: row.favorite,
		rating: row.rating,
		words: [...new Set([r.title, ...r.tags, ...r.course, ...r.ingredients.flatMap((i) => [i.name, i.key.replaceAll('-', ' ')])])]
			.join(' ')
			.toLowerCase()
	};
}

/** Writes recipes and their summaries together. */
export function putRecipes(rows: StoredRecipe[]) {
	return db.transaction('rw', db.recipes, db.summaries, async () => {
		await db.recipes.bulkPut(rows);
		await db.summaries.bulkPut(rows.map(summarize));
	});
}

export function deleteRecipes(ids: string[]) {
	return db.transaction('rw', db.recipes, db.summaries, async () => {
		await db.recipes.bulkDelete(ids);
		await db.summaries.bulkDelete(ids);
	});
}

/** Changes the user's own fields on a recipe. */
export function updateRecipe(id: string, changes: Partial<Pick<StoredRecipe, 'favorite' | 'rating' | 'note'>>) {
	return db.transaction('rw', db.recipes, db.summaries, async () => {
		await db.recipes.update(id, changes);
		const { note: _, ...listed } = changes;
		if (Object.keys(listed).length) await db.summaries.update(id, listed);
	});
}

export async function addRecipes(recipes: Recipe[]): Promise<string[]> {
	const now = Date.now();
	const rows: StoredRecipe[] = recipes.map((recipe, i) => ({
		id: crypto.randomUUID(),
		recipe,
		addedAt: now + i,
		favorite: false,
		rating: null,
		note: ''
	}));
	await putRecipes(rows);
	return rows.map((r) => r.id);
}

// A newer copy of the app (after an update, or in another tab) is upgrading the database.
// This copy is out of date: close the database so the upgrade can go ahead, and reload into the new version.
db.on('versionchange', (event) => {
	db.close();
	if (event.newVersion !== null) location.reload();
	return false;
});
