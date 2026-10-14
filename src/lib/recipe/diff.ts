import type { Ingredient, Recipe, Unit } from './schema.ts';
import { familyName, familyOf, isLooseFamily, splitCompound } from './families.ts';
import { gramsPerMl, PIECE_GRAMS, pieceKey } from './measures.ts';
import { basicGroup } from './table-tree.ts';
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
	/** Versions whose amount is far from the others', left out of the typical range and the average. */
	outliers: number[];
}

/** A culinary role where versions use different ingredients: pick one, or several where they go together. */
export interface DiffSlot {
	role: string;
	/** True when the options stand in for each other; false when a cook can take any of them. */
	pickOne: boolean;
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
	/**
	 * Per version, about how many times the others' amounts its amounts are, when they are
	 * off by the same factor throughout (most likely a wrong serving count); else null.
	 */
	offScale: (number | null)[];
}

/** Roles whose ingredients add to each other in a dish rather than stand in for each other. */
export const COMBINED_ROLES = new Set([
	'vegetable',
	'leafy-green',
	'fruit',
	'liquid',
	'spice',
	'herb',
	'seasoning',
	'aromatic',
	'umami',
	'acid',
	'chili',
	'garnish',
	'topping',
	'sweetener',
	'nut',
	'sauce'
]);

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
					count: 0,
					outliers: []
				};
				rows.set(key, row);
			}
			if (key === ing.key && row.name === familyName(key)) row.name = ing.name; // prefer the plain ingredient's own name
			const amount = inCloves(ing, {
				qty: ing.qty == null ? null : ing.qty * factor,
				qtyMax: ing.qtyMax == null ? null : ing.qtyMax * factor,
				unit: ing.unit ?? null
			});
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
	const offScale = markOutliers(all, versions.length);
	const n = versions.length;
	const common = all.filter((r) => r.count === n);
	const partial = all.filter((r) => r.count < n);

	// Within a role, the different ingredients versions use form a slot. It is "pick one" when
	// they stand in for each other: no version uses two of them, and the role is one where
	// ingredients replace each other (cured pork, cheese) rather than add up (vegetables).
	// Otherwise the cook can take any of them; where versions combine them, only the main
	// ingredients make the slot, so spices and other basics stay with the rest.
	const slots: DiffSlot[] = [];
	const inSlot = new Set<string>();
	const byRole = Map.groupBy(partial, (r) => r.role);
	const usedBy = (rows: DiffRow[]) => versions.map((_, v) => rows.filter((r) => r.ingredients[v]).length);
	for (const [role, group] of byRole) {
		if (group.length < 2) continue;
		const together = usedBy(group).some((c) => c > 1);
		const rows = together ? group.filter((r) => !basicGroup(r)) : group;
		if (rows.length < 2 || usedBy(rows).filter((c) => c > 0).length < 2) continue;
		slots.push({
			role,
			pickOne: !together && !COMBINED_ROLES.has(role),
			options: rows.map((row) => ({
				row,
				versions: versions.flatMap((_, v) => (row.ingredients[v] ? [v] : []))
			}))
		});
		rows.forEach((r) => inSlot.add(r.key));
	}

	return {
		versions,
		servings,
		common,
		slots,
		extras: partial.filter((r) => !inSlot.has(r.key)),
		rows: all,
		offScale
	};
}

export type Dimension = 'mass' | 'volume' | Unit;

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

const COUNTED = new Set<string>(['piece', 'clove', 'bunch', 'can']);
/** A pinch, in millilitres: about a sixteenth of a teaspoon. */
const PINCH_ML = 0.31;

/**
 * Each version's amount for a row as one number in one dimension, so "1 pinch", "0.5 tsp"
 * and "3 g" of chili flakes compare. The dimension is the one most versions use; others are
 * converted through typical weights (a clove of garlic, a tsp of salt), and left null when
 * there is no sensible conversion. Null overall when nothing has an amount.
 */
export function rowValues(row: Pick<DiffRow, 'key' | 'role' | 'amounts' | 'ingredients'>, prefer?: Dimension | null): { dim: Dimension; values: (number | null)[] } | null {
	const native = nativeValues(row);
	const counts = Map.groupBy(native.filter((n) => n !== null), (n) => n.dim);
	if (!counts.size) return null;
	const own = [...counts].toSorted((a, b) => b[1].length - a[1].length)[0][0];
	// A preferred unit only swaps weight for volume or back: a chili counted in pieces stays in pieces.
	const dim = prefer && isMeasure(prefer) && isMeasure(own) ? prefer : own;
	const keyOf = (v: number) => row.ingredients[v]?.key ?? row.key;
	const density = (v: number) => gramsPerMl(keyOf(v), row.role) ?? gramsPerMl(row.key, row.role);
	const pieceG = (v: number) => PIECE_GRAMS[keyOf(v)] ?? PIECE_GRAMS[row.key] ?? null;
	const grams = (v: number, n: { dim: Dimension; value: number }): number | null => {
		if (n.dim === 'mass') return n.value;
		if (n.dim === 'volume') return density(v) == null ? null : n.value * density(v)!;
		return COUNTED.has(n.dim) && pieceG(v) ? n.value * pieceG(v)! : null;
	};
	const values = native.map((n, v) => {
		if (!n) return null;
		if (n.dim === dim) return n.value;
		const g = grams(v, n);
		if (g == null) return null;
		if (dim === 'mass') return g;
		if (dim === 'volume') return density(v) ? g / density(v)! : null;
		return COUNTED.has(dim) && pieceG(v) ? g / pieceG(v)! : null;
	});
	return { dim, values };
}

const nativeValues = (row: Pick<DiffRow, 'amounts'>) =>
	row.amounts.map((a) => (a?.unit === 'pinch' && a.qty != null ? { dim: 'volume' as Dimension, value: mid(a) * PINCH_ML } : baseValue(a)));

const isMeasure = (d: Dimension) => d === 'mass' || d === 'volume';

/**
 * Weight or volume, to show several rows in alike (60 g parmesan and 70 g pecorino, not
 * 150 ml and 70 g): the one their amounts use most that every weighed or measured row
 * converts to without losing an amount, weight first on a tie. Null when there is none.
 * Rows counted in pieces keep their own unit.
 */
export function sharedDimension(rows: Pick<DiffRow, 'key' | 'role' | 'amounts' | 'ingredients'>[]): Dimension | null {
	const native = rows.flatMap((r) => nativeValues(r).filter((n): n is NonNullable<typeof n> => n !== null && isMeasure(n.dim)));
	const rank = (d: Dimension) => (d === 'mass' ? 0 : d === 'volume' ? 1 : 2);
	const dims = [...Map.groupBy(native, (n) => n.dim)].toSorted((a, b) => b[1].length - a[1].length || rank(a[0]) - rank(b[0])).map(([d]) => d);
	const lossless = (row: (typeof rows)[number], dim: Dimension) => {
		const own = nativeValues(row);
		const r = rowValues(row, dim);
		return !r || r.dim !== dim || own.every((n, v) => n === null || r.values[v] != null);
	};
	return dims.find((d) => rows.every((r) => lossless(r, d))) ?? null;
}

type RowLike = Pick<DiffRow, 'key' | 'role' | 'amounts' | 'ingredients'> & { outliers?: number[] };

/** The row's comparable values without its outliers (all of them when nothing else is left). */
function typicalValues(row: RowLike, r: ReturnType<typeof rowValues>): number[] {
	const values = r?.values.flatMap((x, v) => (x === null ? [] : [{ x, v }])) ?? [];
	const typical = values.filter(({ v }) => !row.outliers?.includes(v));
	return (typical.length ? typical : values).map(({ x }) => x);
}

/** The spread of a row's typical amounts in one unit (0.25–2 tsp), outliers left out, or null when they can't be compared. */
export function rowRange(row: RowLike, dim?: Dimension | null): Amount | null {
	const r = rowValues(row, dim);
	const values = typicalValues(row, r);
	if (!r || !values.length) return null;
	const [min, max] = [Math.min(...values), Math.max(...values)];
	return fromBase(r.dim, min, max - min < min * 0.05 ? null : max);
}

/** The mean of a row's typical amounts in one unit, outliers left out, or null when they can't be compared. */
export function rowMean(row: RowLike, dim?: Dimension | null): Amount | null {
	const r = rowValues(row, dim);
	const values = typicalValues(row, r);
	if (!r || !values.length) return null;
	return fromBase(r.dim, values.reduce((s, v) => s + v, 0) / values.length, null);
}

const mid = (a: Amount) => (a.qtyMax == null ? a.qty! : (a.qty! + a.qtyMax) / 2);

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
export function fromBase(dim: Dimension, qty: number, qtyMax: number | null): Amount {
	if (dim === 'mass') return { unit: 'g', qty, qtyMax };
	if (dim !== 'volume') return { unit: dim, qty, qtyMax };
	const top = qtyMax ?? qty;
	// A range that starts under a teaspoon stays in teaspoons (a pinch – 3 tsp, not 0.02–1 tbsp).
	const spoon = top <= 10 || (qty < 5 && top <= 30) ? 5 : top < 60 ? 15 : null;
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

/** About how many cloves a head of garlic has. */
const CLOVES_PER_HEAD = 10;

/**
 * Whole heads of garlic in cloves, so "1 head garlic" compares with "4 cloves" instead of
 * reading as one clove. Recipes store a head as one piece; the words say which it is.
 */
function inCloves(ing: Ingredient, a: Amount): Amount {
	if (a.unit !== 'piece' || a.qty == null || pieceKey(ing.key) !== 'garlic') return a;
	if (!/\bheads?\b/i.test([ing.name, ing.prep, ing.original].filter(Boolean).join(' '))) return a;
	return { unit: 'clove', qty: a.qty * CLOVES_PER_HEAD, qtyMax: a.qtyMax == null ? null : a.qtyMax * CLOVES_PER_HEAD };
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

const median = (xs: number[]) => {
	const s = xs.toSorted((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Finds amounts far from what the other versions use, and sets each row's `outliers`.
 * A version whose amounts are off by about the same factor in most rows (four times the
 * flour, milk and eggs: a recipe for one serving read as four) is off-scale, and its
 * amounts are outliers wherever they fall outside the others' range. Otherwise an amount
 * is an outlier when it is over three times, or under a third of, what at least three
 * other versions use. Returns each version's factor when it is off-scale, else null.
 */
function markOutliers(rows: DiffRow[], n: number): (number | null)[] {
	const values = rows.map((r) => rowValues(r)?.values.map((x) => (x != null && x > 0 ? x : null)) ?? []);
	const others = (i: number, v: number, skip: (number | null)[]) =>
		values[i].flatMap((x, w) => (w === v || x == null || skip[w] != null ? [] : [x]));
	// One off-scale version at a time, the most extreme first, so it doesn't skew the others' medians.
	const offScale: (number | null)[] = Array(n).fill(null);
	for (;;) {
		let worst: { v: number; log: number } | null = null;
		for (let v = 0; v < n; v++) {
			if (offScale[v] != null) continue;
			const logs = values.flatMap((vals, i) => {
				const rest = others(i, v, offScale);
				return vals[v] == null || rest.length < 2 ? [] : [Math.log(vals[v]! / median(rest))];
			});
			if (logs.length < 3) continue;
			const log = median(logs);
			const agree = logs.filter((l) => Math.sign(l) === Math.sign(log) && Math.abs(l) > Math.log(1.5)).length;
			if (Math.abs(log) > Math.log(3) && agree >= logs.length * 0.6 && (!worst || Math.abs(log) > Math.abs(worst.log))) worst = { v, log };
		}
		if (!worst) break;
		offScale[worst.v] = Math.exp(worst.log);
	}
	rows.forEach((row, i) => {
		row.outliers = values[i].flatMap((x, v) => {
			if (x == null) return [];
			const rest = others(i, v, offScale.map((f, w) => (w === v ? null : f)));
			if (offScale[v] != null) return rest.length && (x > 1.5 * Math.max(...rest) || x < Math.min(...rest) / 1.5) ? [v] : [];
			if (rest.length < 3) return [];
			const m = median(rest);
			return x > 3 * m || x < m / 3 ? [v] : [];
		});
	});
	return offScale;
}

/**
 * Whether a version seasons with a row's salt, pepper or spice in its steps though its
 * ingredient list leaves it out ("season with salt and pepper to taste"): a gap in how
 * the recipe was written down, not a difference in the dish.
 */
export function seasonedInSteps(recipe: Recipe, row: Pick<DiffRow, 'key' | 'role'>): boolean {
	if (basicGroup(row) !== 'Salt, pepper and spices') return false;
	const word = familyOf(row.key, row.role).split('-').at(-1)!;
	const re = new RegExp(`\\b${word}s?\\b`, 'i');
	return recipe.steps.some((s) => re.test(s.text));
}
