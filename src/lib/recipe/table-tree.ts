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

/** Headings for supporting ingredients, which always go in a group at the bottom. */
const BASICS: [string, string[]][] = [
	['Oil and fat', ['fat']],
	['Salt, pepper and spices', ['salt', 'seasoning', 'spice']],
	['Herbs and garnish', ['herb', 'garnish']],
	['Acid', ['acid']],
	['Stock, wine and liquids', ['stock', 'liquid', 'wine']],
	['Sweeteners', ['sweetener']],
	['Chili', ['chili']]
];
const basicOf = new Map(BASICS.flatMap(([title, roles]) => roles.map((r) => [r, title] as const)));

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
			const k = ing.name.toLowerCase().replace(/s\b/g, ''); // egg and eggs are one name
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

	const main = diff.rows.filter((r) => !basicOf.has(r.role));
	const byRole = Map.groupBy(main, (r) => r.role);
	const mainGroups = [...byRole].flatMap(([role, rows]) =>
		rows.length > 1 ? [group(`role:${role}`, roleTitle(role), false, rows)] : rows.map((r) => group(`row:${r.key}`, null, false, [r]))
	);
	mainGroups.sort((a, b) => b.count - a.count);

	const basics = BASICS.flatMap(([title, roles]) => {
		const rows = diff.rows.filter((r) => roles.includes(r.role));
		return rows.length ? [group(`basic:${title}`, title, true, rows)] : [];
	});
	return [...mainGroups, ...basics];
}
