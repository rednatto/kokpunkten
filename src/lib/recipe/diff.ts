import type { Ingredient, Recipe, Unit } from './schema.ts';
import { familyName, familyOf, isLooseFamily, splitCompound } from './families.ts';
import { MASS_G, VOLUME_ML, type Amount } from './units.ts';

/** One ingredient key across all versions, with each version's amount scaled to the same servings. */
export interface DiffRow {
	key: string;
	name: string;
	role: string;
	/** Per version (same order as the input), or null where the version doesn't use it. */
	amounts: (Amount | null)[];
	ingredients: (Ingredient | null)[];
	/** How many versions use it. */
	count: number;
}

/** A culinary role where versions use different ingredients: pick one. */
export interface DiffSlot {
	role: string;
	options: { row: DiffRow; versions: number[] }[];
}

export interface RecipeDiff {
	versions: Recipe[];
	servings: number;
	/** Used by every version. */
	common: DiffRow[];
	/** Different ingredients filling the same role. */
	slots: DiffSlot[];
	/** Used by some versions only, not part of a slot. */
	extras: DiffRow[];
	/** Every row, most-shared first. */
	rows: DiffRow[];
}

/** Lines up several versions of a dish by ingredient key and role, scaled to `servings`. */
export function diffRecipes(versions: Recipe[], servings = versions[0]?.servings ?? 4): RecipeDiff {
	const perVersion = versions.map((r) => r.ingredients.flatMap(expandCompound));
	const rowKey = rowKeys(perVersion);
	const rows = new Map<string, DiffRow>();
	perVersion.forEach((ings, v) => {
		const factor = servings / versions[v].servings;
		for (const ing of ings) {
			const key = rowKey(ing);
			let row = rows.get(key);
			if (!row) {
				row = {
					key,
					name: key === ing.key ? ing.name : familyName(key),
					role: ing.role ?? 'other',
					amounts: versions.map(() => null),
					ingredients: versions.map(() => null),
					count: 0
				};
				rows.set(key, row);
			}
			if (key === ing.key && row.name === familyName(key)) row.name = ing.name; // prefer the plain ingredient's own name
			const amount: Amount = {
				qty: ing.qty == null ? null : ing.qty * factor,
				qtyMax: ing.qtyMax == null ? null : ing.qtyMax * factor,
				unit: ing.unit ?? null
			};
			if (row.ingredients[v] === null) {
				row.count++;
				row.ingredients[v] = ing;
				row.amounts[v] = amount;
			} else {
				// The same ingredient used twice (e.g. sugar for dough and for filling): add them up.
				row.amounts[v] = addAmounts(row.amounts[v]!, amount);
			}
		}
	});

	const all = [...rows.values()].sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
	const n = versions.length;
	const common = all.filter((r) => r.count === n);
	const partial = all.filter((r) => r.count < n);

	// Within a role, versions that each use a different ingredient form a "pick one" slot.
	const slots: DiffSlot[] = [];
	const inSlot = new Set<string>();
	const byRole = Map.groupBy(partial, (r) => r.role);
	for (const [role, group] of byRole) {
		if (group.length < 2) continue;
		const perVersion = versions.map((_, v) => group.filter((r) => r.ingredients[v]).length);
		if (perVersion.some((c) => c > 1)) continue;
		if (perVersion.filter((c) => c === 1).length < 2) continue;
		slots.push({
			role,
			options: group.map((row) => ({
				row,
				versions: versions.flatMap((_, v) => (row.ingredients[v] ? [v] : []))
			}))
		});
		group.forEach((r) => inSlot.add(r.key));
	}

	return {
		versions,
		servings,
		common,
		slots,
		extras: partial.filter((r) => !inSlot.has(r.key)),
		rows: all
	};
}

type Dimension = 'mass' | 'volume' | Unit;

/** A comparable number for an amount: grams, millilitres, or the count in its own unit. */
export function baseValue(a: Amount | null): { dim: Dimension; value: number } | null {
	if (!a?.unit || a.qty == null) return null;
	const q = a.qtyMax == null ? a.qty : (a.qty + a.qtyMax) / 2;
	if (a.unit in MASS_G) return { dim: 'mass', value: q * MASS_G[a.unit]! };
	if (a.unit in VOLUME_ML) return { dim: 'volume', value: q * VOLUME_ML[a.unit]! };
	return { dim: a.unit, value: q };
}

/** The spread of amounts across versions, when they can be compared; otherwise null. */
export function amountRange(amounts: (Amount | null)[]): Amount | null {
	const values = amounts.map(baseValue).filter((v) => v !== null);
	if (!values.length || values.some((v) => v.dim !== values[0].dim)) return null;
	const min = Math.min(...values.map((v) => v.value));
	const max = Math.max(...values.map((v) => v.value));
	return fromBase(values[0].dim, min, max - min < min * 0.05 ? null : max);
}

/** The mean of the versions' amounts, when they can be compared (2 to 5 cloves of garlic → 3.5). */
export function meanAmount(amounts: (Amount | null)[]): Amount | null {
	const values = amounts.map(baseValue).filter((v) => v !== null);
	if (!values.length || values.some((v) => v.dim !== values[0].dim)) return null;
	return fromBase(values[0].dim, values.reduce((sum, v) => sum + v.value, 0) / values.length, null);
}

/**
 * The version that uses the most of the chosen ingredients and the fewest of the others,
 * so its method fits a hand-picked mix best.
 */
export function closestTo(diff: RecipeDiff, chosen: Set<string>): number {
	const score = (v: number) => diff.rows.reduce((s, r) => s + (!!r.ingredients[v] === chosen.has(r.key) ? 1 : 0), 0);
	let best = 0;
	diff.versions.forEach((_, v) => {
		if (score(v) > score(best)) best = v;
	});
	return best;
}

/** Turns a base value back into an amount; small volumes read better as spoons than millilitres. */
function fromBase(dim: Dimension, qty: number, qtyMax: number | null): Amount {
	if (dim === 'mass') return { unit: 'g', qty, qtyMax };
	if (dim !== 'volume') return { unit: dim, qty, qtyMax };
	const top = qtyMax ?? qty;
	const spoon = top <= 10 ? 5 : top < 60 ? 15 : null;
	if (!spoon) return { unit: 'ml', qty, qtyMax };
	return { unit: spoon === 5 ? 'tsp' : 'tbsp', qty: qty / spoon, qtyMax: qtyMax == null ? null : qtyMax / spoon };
}

function addAmounts(a: Amount, b: Amount): Amount {
	const x = baseValue(a);
	const y = baseValue(b);
	if (!x || !y || x.dim !== y.dim) return a;
	return fromBase(x.dim, x.value + y.value, null);
}

/** The version that agrees with the most of the cook's picks (slot choices and extras). */
export function closestVersion(diff: RecipeDiff, picks: Map<string, string>, extras: Set<string>): number {
	const score = (v: number) => {
		let s = 0;
		for (const slot of diff.slots) {
			const chosen = picks.get(slot.role);
			if (chosen && diff.rows.find((r) => r.key === chosen)?.ingredients[v]) s += 2;
		}
		for (const row of diff.extras) if (!!row.ingredients[v] === extras.has(row.key)) s += 1;
		return s;
	};
	let best = 0;
	diff.versions.forEach((_, v) => {
		if (score(v) > score(best)) best = v;
	});
	return best;
}

/** "Salt and pepper" as one ingredient becomes two, so each lines up with its own row. */
function expandCompound(ing: Ingredient): Ingredient[] {
	const parts = splitCompound(ing.key);
	if (!parts) return [ing];
	return parts.map((key) => ({ ...ing, key, name: familyName(key) }));
}

/**
 * Decides which row each ingredient goes in. Keys of one family (kosher-salt, salt) share a
 * row, unless some version uses two of them, which means they do different jobs there
 * (salt in the dough, flaky salt on top), or unless their roles differ for a family where
 * that matters (lemon wedges to serve against lemon juice in the sauce).
 */
function rowKeys(perVersion: Ingredient[][]): (ing: Ingredient) => string {
	const members = new Map<string, { keys: Set<string>; roles: Set<string>; clash: boolean }>();
	for (const ings of perVersion) {
		const seen = new Map<string, string>();
		for (const ing of ings) {
			const fam = familyOf(ing.key, ing.role);
			const m = members.get(fam) ?? { keys: new Set(), roles: new Set(), clash: false };
			m.keys.add(ing.key);
			m.roles.add(ing.role ?? 'other');
			if (seen.has(fam) && seen.get(fam) !== ing.key) m.clash = true;
			seen.set(fam, ing.key);
			members.set(fam, m);
		}
	}
	return (ing) => {
		const fam = familyOf(ing.key, ing.role);
		const m = members.get(fam)!;
		if (m.keys.size < 2) return ing.key;
		if (m.clash || (!isLooseFamily(fam) && m.roles.size > 1)) return ing.key;
		return fam;
	};
}
