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
}

/** Everything lives on this device for now. Sign-in and sync come later. */
export const db = new Dexie('kokpunkten') as Dexie & {
	recipes: EntityTable<StoredRecipe, 'id'>;
};

db.version(1).stores({
	recipes: 'id, addedAt, favorite, recipe.dish, *recipe.cuisine'
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
