import { meanAmount, type DiffRow, type RecipeDiff } from './diff.ts';
import { recipeSchema, type Ingredient, type Recipe, type Step } from './schema.ts';
import type { Amount } from './units.ts';

/** Where a mixed ingredient's amount comes from: one version, or the average of all that use it. */
export type AmountSource = number | 'average';

export interface MixChoice {
	/** The rows to cook with, by row key, each with where its amount comes from. */
	rows: Map<string, AmountSource>;
	/** The version whose method the mix follows. */
	base: number;
	/** Version names, for crediting borrowed steps. */
	labels: string[];
	title: string;
}

export interface MixedStep extends Step {
	/** Set when the step was borrowed from another version, or changed to fit the picks. */
	from?: string;
	changed?: string;
}

/**
 * Builds one recipe from several versions, as a recipe ready to save and the same steps
 * marked with where each came from, for showing the mix before cooking it: the chosen ingredients, the base version's
 * method with picked ingredients swapped in, and the steps other versions use for
 * ingredients the base doesn't have. It is a starting point to cook from, not a proof:
 * borrowed steps are marked so the cook can judge where they fit.
 */
export function mixRecipe(diff: RecipeDiff, choice: MixChoice): { recipe: Recipe; steps: MixedStep[] } {
	const { base } = choice;
	const baseRecipe = diff.versions[base];
	const slotOf = new Map(diff.slots.flatMap((s) => s.options.map((o) => [o.row.key, s.role] as const)));
	const chosen = diff.rows.filter((r) => choice.rows.has(r.key));

	// New ingredient ids, and a way back from any version's ingredient id to the new one.
	const ingredients: Ingredient[] = [];
	const newId = new Map<string, string>(); // `${version}:${oldId}` → new id
	const rowId = new Map<string, string>(); // row key → new id
	chosen.forEach((row, n) => {
		const from = choice.rows.get(row.key)!;
		const v = typeof from === 'number' && row.ingredients[from] ? from : row.ingredients[base] ? base : row.ingredients.findIndex((i) => i);
		const src = row.ingredients[v]!;
		const id = `i${n + 1}`;
		const amount = from === 'average' ? average(row) ?? row.amounts[v]! : row.amounts[v]!;
		ingredients.push({ ...src, id, qty: amount.qty, qtyMax: amount.qtyMax, unit: amount.unit ?? src.unit, group: undefined });
		rowId.set(row.key, id);
		row.ingredients.forEach((ing, w) => ing && newId.set(`${w}:${ing.id}`, id));
	});

	// Each version's ingredients that were swapped for a pick, or left out, by `${version}:${id}`.
	const replaced = new Map<string, { id: string; from: string; to: string }>();
	const dropped = new Map<string, string>();
	for (const row of diff.rows) {
		if (rowId.has(row.key)) continue;
		const role = slotOf.get(row.key);
		// Another option of the same slot that was chosen takes this one's place in the steps.
		const pick = role ? chosen.find((r) => slotOf.get(r.key) === role) : undefined;
		row.ingredients.forEach((ing, v) => {
			if (!ing) return;
			if (pick) replaced.set(`${v}:${ing.id}`, { id: rowId.get(pick.key)!, from: ing.name, to: firstIngredient(pick).name });
			else dropped.set(`${v}:${ing.id}`, ing.name);
		});
	}
	const replacedInBase = new Set([...replaced].filter(([k]) => k.startsWith(`${base}:`)).map(([, r]) => r.id));

	const steps: MixedStep[] = [];
	const stepId = new Map<string, string>(); // `${version}:${oldStepId}` → new id
	const add = (step: Step, v: number, extra: Partial<MixedStep> = {}) => {
		const id = `s${steps.length + 1}`;
		stepId.set(`${v}:${step.id}`, id);
		const uses = step.uses.flatMap((u) => {
			const mapped = newId.get(`${v}:${u}`) ?? stepId.get(`${v}:${u}`) ?? (v === base ? replaced.get(`${v}:${u}`)?.id : undefined);
			return mapped ? [mapped] : [];
		});
		steps.push({ ...step, id, uses: [...new Set(uses)], ...extra });
		return id;
	};

	// Steps borrowed for chosen ingredients the base version doesn't have.
	const borrowed: { step: Step; v: number }[] = [];
	for (const row of chosen) {
		if (row.ingredients[base] || replacedInBase.has(rowId.get(row.key)!)) continue;
		const v = row.ingredients.findIndex((i) => i);
		const ing = row.ingredients[v]!;
		for (const step of diff.versions[v].steps.filter((s) => s.uses.includes(ing.id))) {
			if (!borrowed.some((b) => b.v === v && b.step.id === step.id)) borrowed.push({ step, v });
		}
	}

	const last = baseRecipe.steps.length - 1;
	baseRecipe.steps.forEach((step, n) => {
		if (n === last) {
			// Borrowed steps go in before the last step, which then brings them in too.
			const extraIds = borrowed.map(({ step: s, v }) =>
				add({ ...rewrite(s, v, false), uses: s.uses.filter((u) => newId.has(`${v}:${u}`)) }, v, { from: choice.labels[v] })
			);
			const id = add(rewrite(step, base), base, changes(step));
			steps.find((s) => s.id === id)!.uses.push(...extraIds);
			return;
		}
		add(rewrite(step, base), base, changes(step));
	});

	/**
	 * Swaps picked ingredients into a step's text, wherever the text names them: steps often
	 * mention an ingredient they don't list ("serve with the rest of the pecorino").
	 */
	function rewrite(step: Step, v: number, noteLeftOut = true): Step {
		let text = step.text;
		for (const ing of diff.versions[v].ingredients) {
			const r = replaced.get(`${v}:${ing.id}`);
			if (r) text = swapName(text, r.from, r.to);
		}
		const left = step.uses.flatMap((u) => dropped.get(`${v}:${u}`) ?? []);
		const onlyLeftOut = left.length === step.uses.length;
		if (noteLeftOut && left.length) text += onlyLeftOut ? ` (Skip this step: no ${left.join(' or ')}.)` : ` (Leave out the ${left.join(' and ')}.)`;
		return { ...step, text };
	}
	function changes(step: Step): Partial<MixedStep> {
		const swaps = step.uses.flatMap((u) => {
			const r = replaced.get(`${base}:${u}`);
			return r ? [`${r.to} instead of ${r.from}`] : [];
		});
		const left = step.uses.flatMap((u) => (dropped.has(`${base}:${u}`) ? [`no ${dropped.get(`${base}:${u}`)}`] : []));
		return swaps.length || left.length ? { changed: [...swaps, ...left].join(', ') } : {};
	}

	const picked = chosen.filter((r) => slotOf.has(r.key) && !r.ingredients[base]).map((r) => firstIngredient(r).name);
	const recipe = {
		...baseRecipe,
		title: choice.title,
		servings: diff.servings,
		source: { type: 'personal' as const, name: `Mix of ${[...new Set(steps.map((s) => s.from).filter(Boolean)), choice.labels[base]].join(' and ')}` },
		ingredients,
		steps: steps.map(({ from, changed, ...s }) => ({ ...s, text: from ? `${s.text} (From ${from}.)` : s.text })),
		notes: {
			...baseRecipe.notes,
			variations: [
				`Mixed in Kokpunkten, following ${choice.labels[base]}${picked.length ? ` with ${picked.join(', ')}` : ''}.`,
				baseRecipe.notes.variations
			]
				.filter(Boolean)
				.join(' ')
		}
	};
	return { recipe: recipeSchema.parse(recipe), steps };
}

function firstIngredient(row: DiffRow): Ingredient {
	return row.ingredients.find((i) => i)!;
}

/** The average of the versions' amounts, when they can be compared; eggs, cloves and cans come whole. */
function average(row: DiffRow): Amount | null {
	const r = meanAmount(row.amounts);
	if (!r || r.qty == null) return null;
	const counted = !r.unit || ['piece', 'clove', 'can', 'bunch'].includes(r.unit);
	return counted ? { ...r, qty: Math.max(1, Math.round(r.qty)) } : r;
}

/** Swaps an ingredient's name in step text, also matching its last word ("the guanciale" for "guanciale, diced"). */
function swapName(text: string, from: string, to: string): string {
	const words = [from, from.split(/[\s,(]/)[0], from.split(' ').at(-1)!].filter((w) => w.length > 2);
	for (const w of words) {
		const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
		if (re.test(text)) return text.replace(new RegExp(re.source, 'gi'), to);
	}
	return text;
}
