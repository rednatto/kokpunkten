import Dexie, { type EntityTable } from 'dexie';
import type { Recipe } from './recipe/schema';

export interface StoredRecipe {
	id: string;
	recipe: Recipe;
	addedAt: number;
	favorite: boolean;
	/** 1–5, or null when not rated. */
	rating: number | null;
	note: string;
	/** Part of the built-in library; refreshed on each app version, keeping the user's own fields. */
	builtin?: boolean;
}

/** Everything lives on this device for now. Sign-in and sync come later. */
export const db = new Dexie('kokpunkten') as Dexie & {
	recipes: EntityTable<StoredRecipe, 'id'>;
	meta: EntityTable<{ key: string; value: string }, 'key'>;
};

db.version(1).stores({
	recipes: 'id, addedAt, favorite, recipe.dish, *recipe.cuisine'
});
db.version(2).stores({
	meta: 'key'
});

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
	await db.recipes.bulkAdd(rows);
	return rows.map((r) => r.id);
}
