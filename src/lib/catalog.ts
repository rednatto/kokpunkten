import type { Recipe } from './recipe/schema.ts';

/** A dataset imported by a script in scripts/import/, shipped with the app. */
export interface Catalog {
	meta: {
		name: string;
		url: string;
		license: string;
		/** Every entry id starts with this, so the app can tell the catalog's rows apart. */
		idPrefix: string;
		repository?: string;
		/** The dataset version the import was made from. */
		commit?: string | null;
		count: number;
	};
	/** Already validated against the recipe schema by the import script. */
	entries: { id: string; recipe: Recipe }[];
}
