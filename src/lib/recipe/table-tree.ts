import type { DiffRow, RecipeDiff } from './diff.ts';

/** A row of the comparison table, with one sub-entry per name when versions call it different things. */
export interface TreeLeaf {
	row: DiffRow;
	/** Empty unless versions name the ingredient differently (olive oil, extra virgin olive oil). */
	subs: { name: string; versions: number[] }[];
}

/** Rows under one heading, or a lone row when `title` is null. */
export interface TreeGroup {
	id: string;
	title: string | null;
	/** Supporting ingredients (oil, salt, spices): listed after the ones that make the dish. */
	basic: boolean;
	leaves: TreeLeaf[];
	/** Versions that use anything in the group. */
	count: number;
}

/**
 * Headings for supporting ingredients, which always go at the bottom. An ingredient's
 * key decides first, since recipes tag roles unevenly (lemon zest as "acid", orange zest
 * as "aromatic") and imported ones often have none; the role tag is the fallback. The
 * first heading whose keys match wins, so chili oil is oil and cayenne pepper is chili.
 */
const BASICS: { title: string; keys: RegExp; roles: string[] }[] = [
	{ title: 'Onion and garlic', keys: /^(garlic|garlic-cloves?|.*onions?|shallots?|leeks?|scallions?|spring-onions?)$/, roles: ['allium'] },
	{ title: 'Zest, ginger and aromatics', keys: /(zest|peel|^ginger|lemongrass|galangal)$/, roles: ['aromatic'] },
	{ title: 'Oil and fat', keys: /(-oil|^butter|^ghee|^lard|-fat)$/, roles: ['fat'] },
	{
		title: 'Chili',
		keys: /(^|-)(chili|cayenne|jalapenos?|serranos?|habaneros?|scotch-bonnets?|gochugaru|aleppo-pepper|red-pepper-flakes?|pepper-flakes?|crushed-red-peppers?|hot-sauce|hot-pepper-sauce)(-|$)/,
		roles: ['chili']
	},
	{ title: 'Salt, pepper and spices', keys: /(salt|pepper|peppercorns?|^cumin|^paprika|^cinnamon|^nutmeg|^cloves)(-powder)?$/, roles: ['salt', 'seasoning', 'spice'] },
	{ title: 'Herbs and garnish', keys: /(parsley|cilantro|coriander-leaves|basil|dill|chives|mint|thyme|oregano|rosemary|sage|tarragon|bay-leaf|bay-leaves)(-flakes?|-leaves|-sprigs?)?$/, roles: ['herb', 'garnish'] },
	{ title: 'Acid', keys: /(juice|vinegar)$/, roles: ['acid'] },
	{ title: 'Stock, wine and liquids', keys: /(stock|broth|wine|water)$/, roles: ['stock', 'liquid', 'wine'] },
	{ title: 'Sweeteners', keys: /(sugar|honey|syrup)$/, roles: ['sweetener'] }
];

/** Chili however a recipe spells it (chilli, chilies, chiles, chilly) reads as "chili". */
const looseKey = (key: string) => key.replace(/(^|-)chil{1,2}(?:i|y|e)?(?:e?s)?(?=-|$)/g, '$1chili');

/** The basics heading a row belongs under, or null for a main ingredient. */
export function basicGroup(row: Pick<DiffRow, 'key' | 'role'>): string | null {
	// Peppers that are vegetables (bell peppers) are not seasoning.
	if (/bell-pepper|sweet-pepper/.test(row.key)) return null;
	const key = looseKey(row.key);
	return BASICS.find((b) => b.keys.test(key))?.title ?? BASICS.find((b) => b.roles.includes(row.role))?.title ?? null;
}

const roleTitle = (role: string) => role.charAt(0).toUpperCase() + role.slice(1).replaceAll('-', ' ');

/**
 * Arranges the comparison table as a tree: main ingredients first, with rows of the same
 * role (guanciale, pancetta, bacon) under one heading, then the supporting ingredients
 * grouped by kind. A supporting row whose versions name it differently (olive oil, extra
 * virgin olive oil) gets a sub-entry per name.
 */
export function tableTree(diff: RecipeDiff): TreeGroup[] {
	const leaf = (row: DiffRow, basic: boolean): TreeLeaf => {
		const byName = new Map<string, { name: string; versions: number[] }>();
		row.ingredients.forEach((ing, v) => {
			if (!ing) return;
			// "Eggs" and "egg", or "extra-virgin" and "extra virgin", are one name.
			const k = ing.name.toLowerCase().replace(/[-\s]+/g, ' ').replace(/s\b/g, '');
			byName.set(k, { name: ing.name, versions: [...(byName.get(k)?.versions ?? []), v] });
		});
		// Only supporting ingredients split by name: for the main ones the difference is noise.
		return { row, subs: basic && byName.size > 1 ? [...byName.values()] : [] };
	};
	const group = (id: string, title: string | null, basic: boolean, rows: DiffRow[]): TreeGroup => ({
		id,
		title,
		basic,
		leaves: rows.map((r) => leaf(r, basic)),
		count: diff.versions.filter((_, v) => rows.some((r) => r.ingredients[v])).length
	});

	const main = diff.rows.filter((r) => !basicGroup(r));
	const byRole = Map.groupBy(main, (r) => r.role);
	const mainGroups = [...byRole].flatMap(([role, rows]) =>
		rows.length > 1 ? [group(`role:${role}`, roleTitle(role), false, rows)] : rows.map((r) => group(`row:${r.key}`, null, false, [r]))
	);
	mainGroups.sort((a, b) => b.count - a.count);

	const basics = BASICS.flatMap(({ title }) => {
		const rows = diff.rows.filter((r) => basicGroup(r) === title);
		return rows.length ? [group(`basic:${title}`, title, true, rows)] : [];
	});
	return [...mainGroups, ...basics];
}
