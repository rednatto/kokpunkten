// Shared plumbing for the dataset importers in this folder.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildVocabulary } from '../../src/lib/import/vocabulary.ts';
import { normalizeRecipe, type RawRecipe } from '../../src/lib/import/normalize.ts';
import { recipeSchema, type Recipe } from '../../src/lib/recipe/schema.ts';
import type { Catalog } from '../../src/lib/catalog.ts';

const root = join(import.meta.dirname, '../..');

/** The built-in library: its ingredient keys and roles are the vocabulary, its dishes the slugs to join. */
export function loadLibrary(): Recipe[] {
	const dir = join(root, 'src/lib/library');
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown[])
		.map((r) => recipeSchema.parse(r));
}

/** Cuisine slugs found as tags in datasets. Anything else stays a tag. */
export const CUISINES = new Set(
	`american argentinian armenian asian austrian balkan basque belgian brazilian british cajun cantonese caribbean catalan chinese colombian cuban czech danish dutch egyptian english ethiopian european filipino finnish french georgian german greek hungarian indian indonesian international irish israeli italian jamaican japanese korean lebanese lithuanian malaysian maltese mediterranean mexican middle-eastern moroccan nordic norwegian persian peruvian polish portuguese punjabi romanian russian scandinavian scottish serbian sichuan southern spanish swedish swiss tex-mex thai turkish ukrainian vietnamese welsh`.split(
		' '
	)
);

/** Dataset tags that name a course, mapped to the course slugs the library uses. */
export const COURSES: Record<string, string> = {
	breakfast: 'breakfast',
	brunch: 'brunch',
	dessert: 'dessert',
	desserts: 'dessert',
	side: 'side',
	'side dish': 'side',
	snack: 'snack',
	soup: 'soup',
	sauce: 'sauce',
	baking: 'baking',
	bread: 'baking',
	drink: 'drink',
	salad: 'side',
	main: 'main',
	dinner: 'main',
	supper: 'main'
};

export interface ImportReport {
	ok: number;
	failed: { id: string; errors: string[] }[];
	unknownIngredients: Map<string, number>;
	joined: Map<string, string[]>;
	guessedServings: number;
}

/** Normalizes every raw recipe, keeps the valid ones and reports what needs a look. */
export function normalizeAll(raws: { id: string; raw: RawRecipe }[], library: Recipe[]) {
	const vocab = buildVocabulary(library);
	const dishes = new Set(library.map((r) => r.dish));
	const report: ImportReport = { ok: 0, failed: [], unknownIngredients: new Map(), joined: new Map(), guessedServings: 0 };
	const entries: { id: string; recipe: Recipe }[] = [];
	for (const { id, raw } of raws) {
		const res = normalizeRecipe(raw, { vocab, dishes });
		if (!res.ok) {
			report.failed.push({ id, errors: res.errors });
			continue;
		}
		report.ok++;
		entries.push({ id, recipe: res.recipe });
		if (dishes.has(res.recipe.dish)) report.joined.set(res.recipe.dish, [...(report.joined.get(res.recipe.dish) ?? []), id]);
		for (const w of res.warnings) {
			const unknown = w.match(/^unknown ingredient "(.*)"$/);
			if (unknown) report.unknownIngredients.set(unknown[1], (report.unknownIngredients.get(unknown[1]) ?? 0) + 1);
			if (w.startsWith('no servings')) report.guessedServings++;
		}
	}
	return { entries, report };
}

/** One recipe per line: small enough to ship, and a re-import shows up as a readable diff. */
export function writeCatalog(file: string, catalog: Catalog) {
	const { entries, ...meta } = catalog;
	const body = entries.map((e) => `\t\t${JSON.stringify(e)}`).join(',\n');
	writeFileSync(join(root, file), `{\n\t"meta": ${JSON.stringify(meta.meta)},\n\t"entries": [\n${body}\n\t]\n}\n`);
}

export function printReport(r: ImportReport) {
	console.log(`${r.ok} recipes imported, ${r.failed.length} failed, ${r.guessedServings} without servings (assumed 4)`);
	for (const f of r.failed) console.log(`  ✗ ${f.id}: ${f.errors.slice(0, 3).join('; ')}`);
	console.log(`Joined existing dishes (${r.joined.size}): ${[...r.joined].map(([d, ids]) => `${d} ← ${ids.join(', ')}`).join('; ')}`);
	const unknown = [...r.unknownIngredients].sort((a, b) => b[1] - a[1]);
	console.log(`Ingredients not in the vocabulary: ${unknown.length} distinct. Most common:`);
	console.log(`  ${unknown.slice(0, 40).map(([n, c]) => `${n} (${c})`).join(', ')}`);
}
