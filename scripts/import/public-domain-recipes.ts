// Imports Public Domain Recipes (https://publicdomainrecipes.com, Unlicense) into the app's catalog.
//   npm run import:pdr                 clones the dataset into a temp folder
//   npm run import:pdr -- <checkout>   uses an existing checkout of ronaldl29/public-domain-recipes
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { RawRecipe } from '../../src/lib/import/normalize.ts';
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

const { entries, report } = normalizeAll(raws, loadLibrary());
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
