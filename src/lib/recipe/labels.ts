import { familyOf } from './families.ts';
import type { Ingredient, Recipe } from './schema.ts';
import { basicGroup } from './table-tree.ts';

/** The app's own versions are named "Kokpunkten – With cream"; the part after the dash is the version's name. */
const OWN = /^Kokpunkten – /;

/** Short name telling a version apart from the dish's other versions. */
export function versionLabel(r: Recipe): string {
	return r.variant ?? r.source.name?.replace(OWN, '') ?? r.title;
}

/** Where a version comes from (site or book, and author), for a second line under its name; null for the app's own versions. */
export function versionSource(r: Recipe): string | null {
	if (r.source.name && OWN.test(r.source.name)) return null;
	const name = r.source.name ?? r.source.book?.title;
	const parts = [name === versionLabel(r) ? null : name, r.source.author ?? r.source.book?.author];
	return parts.filter(Boolean).join(' · ') || null;
}

/**
 * A name for a version from what sets it apart from `others`: the main ingredients
 * (not salt, oil or herbs) that the fewest other versions use, "With bacon and cream".
 * Null when it uses nothing the others don't.
 */
export function definingLabel(r: Recipe, others: Recipe[]): string | null {
	const family = (i: Ingredient) => familyOf(i.key, i.role);
	const usedBy = (f: string) => others.filter((o) => o.ingredients.some((i) => family(i) === f)).length;
	const ranked = r.ingredients
		.filter((i) => !i.optional && !basicGroup({ key: i.key, role: i.role ?? 'other' }))
		.map((i, n) => ({ name: i.name.toLowerCase(), n, used: usedBy(family(i)) }))
		.filter((x) => x.used < others.length)
		.sort((a, b) => a.used - b.used || a.n - b.n);
	const names = [...new Set(ranked.filter((x) => x.used === ranked[0]?.used).map((x) => x.name))].slice(0, 2);
	if (!names.length) return null;
	return `With ${names.join(' and ')}`;
}

/**
 * Names for all versions of a dish, each different. Every version keeps its own name
 * ("Saveur (Rita Sodi)") unless another version has the same one, as when two come from
 * one site ("Public Domain Recipes"); those are named by what sets them apart. Any names
 * still shared get the author, or a number, after them.
 */
export function versionLabels(versions: Recipe[]): string[] {
	const own = versions.map(versionLabel);
	const labels = versions.map((r, v) => {
		const shared = own.indexOf(own[v]) !== own.lastIndexOf(own[v]);
		const named = r.variant || OWN.test(r.source.name ?? '');
		return (shared && !named && definingLabel(r, versions.toSpliced(v, 1))) || own[v];
	});
	return labels.map((l, v) => {
		if (labels.indexOf(l) === labels.lastIndexOf(l)) return l;
		const author = versions[v].source.author;
		return author && labels.filter((x, w) => x === l && versions[w].source.author === author).length === 1
			? `${l} (${author})`
			: `${l} ${labels.slice(0, v + 1).filter((x) => x === l).length}`;
	});
}
