import type { Ingredient, Recipe, StepAmount } from './schema.ts';
import { MASS_G, VOLUME_ML, type Amount } from './units.ts';

export interface StepInput {
	ingredient: Ingredient;
	/** What goes in at this step, unscaled; null when the recipe doesn't say how the ingredient is split. */
	amount: Amount | null;
	/** True when other steps use the same ingredient, so `amount` is only part of it. */
	shared: boolean;
}

/**
 * The amount of each ingredient each step takes, by step id and ingredient id.
 * A step that is the only one using an ingredient takes all of it. A shared ingredient
 * takes the step's own `amounts` entry, and the one step without an entry takes what is
 * left. Otherwise the split is unknown and the amount is null.
 */
export function stepInputs(recipe: Recipe): Map<string, Map<string, StepInput>> {
	const ingById = new Map(recipe.ingredients.map((i) => [i.id, i]));
	const usedBy = new Map<string, string[]>();
	for (const s of recipe.steps) for (const u of new Set(s.uses)) if (ingById.has(u)) usedBy.set(u, [...(usedBy.get(u) ?? []), s.id]);

	const out = new Map(recipe.steps.map((s) => [s.id, new Map<string, StepInput>()]));
	for (const [ingId, stepIds] of usedBy) {
		const ing = ingById.get(ingId)!;
		const total = ownAmount(ing);
		const given = new Map(
			stepIds.flatMap((sid) => {
				const a = recipe.steps.find((s) => s.id === sid)!.amounts.find((x) => x.ingredient === ingId);
				return a ? [[sid, fromStep(a, ing)] as const] : [];
			})
		);
		const shared = stepIds.length > 1;
		const open = stepIds.filter((sid) => !given.has(sid));
		const rest = shared && open.length === 1 ? remainder(total, [...given.values()]) : null;
		for (const sid of stepIds) {
			// "Salt to taste" in two steps is to taste in each.
			const amount = given.get(sid) ?? (!shared || total.unit === 'to-taste' ? total : rest);
			out.get(sid)!.set(ingId, { ingredient: ing, amount, shared });
		}
	}
	return out;
}

const ownAmount = (ing: Ingredient): Amount => ({ qty: ing.qty ?? null, qtyMax: ing.qtyMax ?? null, unit: ing.unit ?? null });
const fromStep = (a: StepAmount, ing: Ingredient): Amount => ({ qty: a.qty, qtyMax: a.qtyMax ?? null, unit: a.unit ?? ing.unit ?? null });

/** An amount in the base unit of its kind (g, ml, or the count unit itself), or null when it has none. */
function inBase(a: Amount): { dim: string; per: number } | null {
	if (!a.unit || a.unit === 'to-taste') return null;
	if (a.unit in MASS_G) return { dim: 'mass', per: MASS_G[a.unit]! };
	if (a.unit in VOLUME_ML) return { dim: 'volume', per: VOLUME_ML[a.unit]! };
	return { dim: a.unit, per: 1 };
}

/** What is left of `total` after `parts`, in the total's unit; null when they can't be compared or nothing is left. */
function remainder(total: Amount, parts: Amount[]): Amount | null {
	const t = inBase(total);
	if (!t || total.qty == null) return null;
	let used = 0;
	for (const p of parts) {
		const b = inBase(p);
		if (!b || b.dim !== t.dim || p.qty == null || p.qtyMax != null) return null;
		used += (p.qty * b.per) / t.per;
	}
	const left = (q: number) => q - used;
	// Less than a twentieth left over reads as rounding in the source, not a step of its own.
	if (left(total.qty) <= total.qty * 0.05) return null;
	return { unit: total.unit, qty: left(total.qty), qtyMax: total.qtyMax == null ? null : left(total.qtyMax) };
}

/**
 * Carries a step's amount over to an ingredient with a new total, as the same share of it:
 * a step taking a third of the butter takes a third of the new amount. Null when the
 * share can't be worked out.
 */
export function shareOf(a: StepAmount, from: Ingredient, to: Ingredient): StepAmount | null {
	const old = ownAmount(from);
	const part = fromStep(a, from);
	const o = inBase(old);
	const p = inBase(part);
	const n = ownAmount(to);
	if (!o || !p || o.dim !== p.dim || old.qty == null || n.qty == null || !inBase(n)) return null;
	const share = (part.qty! * p.per) / (old.qty * o.per);
	return { ingredient: to.id, qty: n.qty * share, qtyMax: n.qtyMax == null ? null : n.qtyMax * share, unit: n.unit };
}
