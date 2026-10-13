// Imports Public Domain Recipes (https://publicdomainrecipes.com, Unlicense) into the app's catalog.
//   npm run import:pdr                 clones the dataset into a temp folder
//   npm run import:pdr -- <checkout>   uses an existing checkout of ronaldl29/public-domain-recipes
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { RawRecipe } from '../../src/lib/import/normalize.ts';
import { definingLabel } from '../../src/lib/recipe/labels.ts';
import { COURSES, CUISINES, loadLibrary, normalizeAll, printReport, writeCatalog } from './common.ts';

const REPO = 'https://github.com/ronaldl29/public-domain-recipes.git';
const SITE = 'https://publicdomainrecipes.com';
const OUT = 'src/lib/catalog/public-domain-recipes.json';

/** Titles that are a library dish under another name. Checked by hand against the import report. */
const DISH_OVERRIDES: Record<string, string> = {
	pancake: 'pancakes',
	// A page of basic ways to cook eggs, not a scrambled-eggs recipe.
	eggs: 'eggs'
};

/**
 * Names for the versions that join a library dish, saying what sets each apart from the
 * library's versions, as theirs do. Written by hand from the recipes; a joined recipe not
 * listed here gets a name from the ingredients only it uses.
 */
const VARIANTS: Record<string, string> = {
	'apple-pie': 'Stovetop-thickened filling',
	'baked-salmon': 'Foil-baked with butter',
	'banana-bread': 'Spiced, with walnuts',
	'beef-and-broccoli': 'Beef and broccoli',
	'beef-goulash': 'Potatoes and caraway',
	'bolognese-sauce': 'Three meats and milk',
	'breton-crepes': 'Buckwheat galettes',
	'butter-chicken-masala': 'Marinated, with fenugreek',
	'cacio-e-pepe': 'Crushed peppercorns',
	'caesar-salad': 'Quick, with ready dressing',
	carbonara: 'Light on cheese',
	'chicken-stock-bone-broth': 'Whole chicken bone broth',
	'chili-con-carne': 'Beans and dark chocolate',
	'chocolate-chip-cookies': 'Melted butter, bread flour',
	'clam-chowder': 'Bacon and half-and-half',
	coleslaw: 'Buttermilk and celery seed',
	'creamy-mashed-potatoes': 'Loaded, bacon and cheese',
	'creme-brulee': 'With lemon peel',
	erwtensoep: 'Dutch split pea, pork and sausage',
	'finnish-salmon-soup': 'Finnish salmon and cream',
	'french-crepes': 'With beer in the batter',
	'french-onion-soup': 'Two-hour onions, balsamic',
	granola: 'Maple and cardamom',
	'greek-salad': 'With lettuce and dill',
	hummus: 'Skins loosened with baking soda',
	'korv-stroganoff': 'Swedish falukorv',
	lasagna: 'From ready-made sauces',
	'lebanese-lentil-soup': 'Lebanese, chard and lemon',
	lentejas: 'Spanish, with chorizo',
	'lithuanian-cold-borscht': 'Cold, with kefir',
	'mapo-tofu': 'Marinated pork, fermented black beans',
	'mayonnaise-or-aioli': 'Whole egg, stick blender',
	'miso-soup': 'Quick, instant dashi',
	'modern-borscht': 'Beef and cabbage',
	'mushroom-risotto': 'Mushroom and pecorino',
	'no-knead-pizza-dough': 'No-knead',
	omelet: 'Fluffy, tapioca-thickened',
	paella: 'Valencian, chicken and rabbit',
	pancake: 'Basic one-bowl batter',
	'pho-soup': 'Oven-toasted spices',
	'pizza-dough': 'Quick 30-minute rise',
	'pork-based-chili-con-carne': 'Chorizo and pork',
	'potato-pure': 'Simple purée with cheese',
	quiche: 'Ham and Edam',
	ratatouille: 'Big batch, peeled tomatoes',
	'red-lentil-dahl': 'With curry powder and tomatoes',
	schnitzel: 'Veal, paprika crumbs',
	shakshouka: 'Fresh tomatoes, peeled',
	'shepherds-pie': 'Minced lamb',
	'simple-chicken-curry': 'Quick, ground spices',
	'sourdough-bread-with-seeds-and-grains': 'Seeds and grains',
	'sourdough-loaf': 'Table loaf with rye',
	'spicy-kung-pao-style-chicken': 'Weeknight, with rice',
	stroganoff: 'Dijon and egg noodles',
	'swedish-pancakes': 'Griddle, butter in the batter',
	tiramisu: 'Whipped egg whites',
	tzatziki: 'Olive oil and lemon',
	'turkish-red-lentil-soup': 'Turkish, mint and paprika',
	'ukrainian-borscht': 'Ukrainian, with beans',
	'wholemeal-wheat-flour-pizza-dough': 'Wholemeal'
};

let dir = process.argv[2];
if (!dir) {
	dir = join(mkdtempSync(join(tmpdir(), 'pdr-')), 'repo');
	console.log(`Cloning ${REPO}…`);
	execFileSync('git', ['clone', '--depth', '1', '--quiet', REPO, dir]);
}
const git = (...args: string[]) => (existsSync(join(dir, '.git')) ? execFileSync('git', ['-C', dir, ...args]).toString().trim() : null);
const commit = git('rev-parse', 'HEAD');
// The dataset's own date, so re-importing the same version changes nothing.
const retrievedAt = git('log', '-1', '--format=%cs') ?? new Date().toISOString().slice(0, 10);

function authorName(raw: string | undefined): string | null {
	if (!raw) return null;
	const file = join(dir, 'data/authors', `${raw}.json`);
	if (existsSync(file)) return (JSON.parse(readFileSync(file, 'utf8')) as { name?: string }).name ?? raw;
	return raw;
}

/** Hugo front matter, as these files use it: `key: value` lines and one-line `['a', 'b']` lists. */
function frontMatter(text: string): [Record<string, string | string[]>, string] {
	const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!m) return [{}, text];
	const meta: Record<string, string | string[]> = {};
	for (const line of m[1].split('\n')) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (!kv) continue;
		const v = kv[2].trim();
		meta[kv[1]] = v.startsWith('[')
			? v.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
			: v.replace(/^['"]|['"]$/g, '');
	}
	return [meta, text.slice(m[0].length)];
}

function minutes(s: string | undefined): number | null {
	if (!s) return null;
	const h = s.match(/(\d+(?:\.\d+)?)\s*h/i);
	const min = s.match(/(\d+)\s*m/i);
	const total = (h ? +h[1] * 60 : 0) + (min ? +min[1] : 0);
	return total || null;
}

function parseFile(file: string): RawRecipe | null {
	const [meta, body] = frontMatter(readFileSync(file, 'utf8'));
	const slug = basename(file, '.md');
	const tags = ((meta.tags as string[] | undefined) ?? []).map((t) => t.toLowerCase());

	const info = (label: RegExp) => body.match(new RegExp(`^[-*]\\s*\\S*\\s*${label.source}\\s*:?\\s*(.+)$`, 'im'))?.[1];
	const servings = info(/servings?/)?.match(/\d+/)?.[0];

	const ingredients: RawRecipe['ingredients'] = [];
	const steps: string[] = [];
	let section: 'none' | 'ingredients' | 'steps' | 'other' = 'none';
	let group: string | null = null;
	for (const line of body.split('\n')) {
		const h2 = line.match(/^##\s+(.*)/);
		if (h2) {
			const h = h2[1].toLowerCase();
			section = /ingredient/.test(h) ? 'ingredients' : /direction|instruction|method|steps|preparation/.test(h) ? 'steps' : 'other';
			group = null;
			continue;
		}
		const h3 = line.match(/^###+\s+(.*)/);
		if (h3) {
			group = h3[1].trim();
			continue;
		}
		const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
		if (section === 'ingredients' && item) {
			// The prep time, cook time and servings bullets sometimes sit inside the list.
			if (/(prep|cook) time|servings?\s*:/i.test(item[1])) continue;
			ingredients.push({ line: item[1], group });
		} else if (section === 'steps') {
			if (item) steps.push(item[1]);
			else if (line.trim() && !line.startsWith('!') && steps.length) steps[steps.length - 1] += ` ${line.trim()}`;
		}
	}
	if (!ingredients.length || !steps.length) return null;

	return {
		title: String(meta.title ?? slug),
		dish: DISH_OVERRIDES[slug],
		variant: VARIANTS[slug],
		language: 'en',
		ingredients,
		steps,
		servings: servings ? +servings : null,
		prepMin: minutes(info(/prep time/)),
		cookMin: minutes(info(/cook time/)),
		cuisine: tags.filter((t) => CUISINES.has(t)),
		course: [...new Set(tags.flatMap((t) => COURSES[t] ?? []))],
		tags: tags.filter((t) => !CUISINES.has(t) && !(t in COURSES)),
		source: {
			type: 'web',
			url: `${SITE}/${slug}/`,
			name: 'Public Domain Recipes',
			author: authorName(meta.author as string | undefined),
			license: 'Unlicense',
			retrievedAt
		}
	};
}

const contentDir = join(dir, 'content');
const raws = readdirSync(contentDir)
	.filter((f) => f.endsWith('.md') && !f.startsWith('_'))
	.sort()
	.flatMap((f) => {
		const raw = parseFile(join(contentDir, f));
		if (!raw) console.log(`  – ${f}: no ingredient list or steps, skipped`);
		return raw ? [{ id: `pdr-${basename(f, '.md')}`, raw }] : [];
	});

const library = loadLibrary();
const { entries, report } = normalizeAll(raws, library);
for (const { recipe } of entries) {
	const versions = library.filter((r) => r.dish === recipe.dish);
	if (versions.length && !recipe.variant) recipe.variant = definingLabel(recipe, versions) ?? undefined;
}
writeCatalog(OUT, {
	meta: {
		name: 'Public Domain Recipes',
		url: SITE,
		license: 'Unlicense',
		idPrefix: 'pdr-',
		repository: REPO.replace(/\.git$/, ''),
		commit,
		count: entries.length
	},
	entries
});
printReport(report);
console.log(`Wrote ${OUT}`);
