import { recipeSchema, type Recipe } from './recipe/schema.ts';

/** A dataset imported by a script in scripts/import/, shipped with the app. */
export interface Catalog {
	meta: {
		name: string;
		url: string;
		license: string;
		repository?: string;
		/** The dataset version the import was made from. */
		commit?: string | null;
		count: number;
	};
	entries: { id: string; recipe: Recipe }[];
}

const files = import.meta.glob<Catalog>('./catalog/*.json', { import: 'default' });

/** Every catalog recipe that still validates, with its stable id. */
export async function loadCatalogs(): Promise<[string, Recipe][]> {
	const out: [string, Recipe][] = [];
	for (const load of Object.values(files)) {
		for (const { id, recipe } of (await load()).entries) {
			const res = recipeSchema.safeParse(recipe);
			if (res.success) out.push([id, res.data]);
			else console.warn('Skipping invalid catalog recipe', id, res.error.issues);
		}
	}
	return out;
}
