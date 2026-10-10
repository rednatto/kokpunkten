import { db, deleteRecipes, putRecipes, type StoredRecipe } from './db.ts';
import type { Catalog } from './catalog.ts';
import { recipeSchema, type Recipe } from './recipe/schema.ts';

// URLs rather than modules: in a build each file name carries a hash of its content, so comparing
// the URLs tells whether a source changed without downloading it, and JSON parses faster than JS.
const libraryUrls = import.meta.glob<string>('./library/*.json', { query: '?url', import: 'default', eager: true });
const catalogUrls = import.meta.glob<string>('./catalog/*.json', { query: '?url', import: 'default', eager: true });

/** Stable ids, so favorites, ratings and notes survive library updates. */
const libraryId = (dish: string, n: number) => `lib-${dish}-${n + 1}`;

const fetchJson = async <T>(url: string): Promise<T> => (await fetch(url)).json() as Promise<T>;

interface Source {
	key: string;
	/** The files it is built from; a different list means the source changed. */
	urls: string[];
	load(): Promise<{ prefix: string; recipes: [string, Recipe][] }>;
}

const sources: Source[] = [
	{
		key: 'library',
		urls: Object.values(libraryUrls),
		async load() {
			const files = await Promise.all(Object.values(libraryUrls).map((u) => fetchJson<unknown[]>(u)));
			const recipes: [string, Recipe][] = [];
			for (const versions of files)
				versions.forEach((item, n) => {
					const res = recipeSchema.safeParse(item);
					if (res.success) recipes.push([libraryId(res.data.dish, n), res.data]);
					else console.warn('Skipping invalid library recipe', res.error.issues);
				});
			return { prefix: 'lib-', recipes };
		}
	},
	...Object.entries(catalogUrls).map(([path, url]) => ({
		key: `catalog:${path.replace(/^.*\/|\.json$/g, '')}`,
		urls: [url],
		async load() {
			const catalog = await fetchJson<Catalog>(url);
			return { prefix: catalog.meta.idPrefix, recipes: catalog.entries.map((e): [string, Recipe] => [e.id, e.recipe]) };
		}
	}))
];

/**
 * Copies the built-in library and the imported open datasets (src/lib/catalog/) into the
 * local database, each only when its files changed, the library first so the list fills fast.
 * Existing rows keep the user's favorite, rating and note; recipes dropped from a
 * source are removed unless the user has marked them up.
 */
export async function syncLibrary(): Promise<void> {
	for (const [n, source] of sources.entries()) {
		const signature = source.urls.join('\n');
		if ((await db.meta.get(`source:${source.key}`))?.value === signature) continue;

		const { prefix, recipes } = await source.load();
		const existing = new Map((await db.recipes.where(':id').startsWith(prefix).toArray()).map((r) => [r.id, r]));
		const rows: StoredRecipe[] = recipes.map(([id, recipe], i) => {
			const old = existing.get(id);
			existing.delete(id);
			return {
				id,
				recipe,
				builtin: true,
				// Library first, then each catalog after it, in file order.
				addedAt: old?.addedAt ?? n * 100_000 + i,
				favorite: old?.favorite ?? false,
				rating: old?.rating ?? null,
				note: old?.note ?? ''
			};
		});
		const stale = [...existing.values()].filter((r) => !r.favorite && r.rating == null && !r.note).map((r) => r.id);
		await db.transaction('rw', db.recipes, db.summaries, db.meta, async () => {
			await putRecipes(rows);
			await deleteRecipes(stale);
			await db.meta.put({ key: `source:${source.key}`, value: signature });
		});
	}
}
