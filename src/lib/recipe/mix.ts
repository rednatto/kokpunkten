import { baseValue, COMBINED_ROLES, fromBase, rowMean, rowValues, type DiffRow, type RecipeDiff } from './diff.ts';
import { gramsPerMl, PIECE_GRAMS } from './measures.ts';
import { recipeSchema, type Ingredient, type Recipe, type Step } from './schema.ts';
import { shareOf } from './step-amounts.ts';
import { basicGroup } from './table-tree.ts';
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
	// Only an option that stands in for another takes its place in the steps.
	const swapSlotOf = new Map(diff.slots.flatMap((s) => (s.pickOne ? s.options.map((o) => [o.row.key, s.role] as const) : [])));
	const chosen = diff.rows.filter((r) => choice.rows.has(r.key));
	const shared = familyAmounts(diff, choice);

	// New ingredient ids, and a way back from any version's ingredient id to the new one.
	const ingredients: Ingredient[] = [];
	const newId = new Map<string, string>(); // `${version}:${oldId}` → new id
	const rowId = new Map<string, string>(); // row key → new id
	const rowOf = new Map<string, DiffRow>(); // new id → row
	const rowIdOf = (v: number, oldId: string) => newId.get(`${v}:${oldId}`)!;
	chosen.forEach((row, n) => {
		const from = choice.rows.get(row.key)!;
		const v = typeof from === 'number' && row.ingredients[from] ? from : row.ingredients[base] ? base : row.ingredients.findIndex((i) => i);
		const src = row.ingredients[v]!;
		const id = `i${n + 1}`;
		const own = row.amounts[v]!;
		const amount = from === 'average' ? (shared.get(row.key) ?? average(row) ?? own) : own.qty == null ? own : roundAmount(own, row.key);
		ingredients.push({ ...src, id, qty: amount.qty, qtyMax: amount.qtyMax, unit: amount.unit ?? src.unit, group: undefined });
		rowId.set(row.key, id);
		rowOf.set(id, row);
		row.ingredients.forEach((ing, w) => ing && newId.set(`${w}:${ing.id}`, id));
	});

	// Each version's ingredients that were swapped for a pick, or left out, by `${version}:${id}`.
	const replaced = new Map<string, { id: string; from: string; to: string }>();
	const dropped = new Map<string, string>();
	for (const row of diff.rows) {
		if (rowId.has(row.key)) continue;
		const role = swapSlotOf.get(row.key);
		// Another option of the same slot that was chosen takes this one's place in the steps.
		const pick = role ? chosen.find((r) => swapSlotOf.get(r.key) === role) : undefined;
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
		// A step's share of a shared ingredient carries over to the mix's amount of it.
		const amounts = step.amounts.flatMap((a) => {
			const to = ingredients.find((i) => i.id === newId.get(`${v}:${a.ingredient}`));
			const from = diff.versions[v].ingredients.find((i) => i.id === a.ingredient);
			return to && from ? (shareOf(a, from, to) ?? []) : [];
		}).filter((a, n, all) => all.findIndex((b) => b.ingredient === a.ingredient) === n);
		steps.push({ ...step, id, uses: [...new Set(uses)], amounts, ...extra });
		return id;
	};

	// Chosen ingredients the base version doesn't have go in where their own version adds
	// them: into the base step that handles the same things (chili flakes with the garlic
	// and oil), or else as that one step, borrowed.
	const attach = new Map<string, { id: string; name: string; from: string; with: string }[]>(); // base step id → extras
	const plans = chosen.flatMap((row) => {
		if (row.ingredients[base] || replacedInBase.has(rowId.get(row.key)!)) return [];
		const from = choice.rows.get(row.key);
		const v = typeof from === 'number' && row.ingredients[from] ? from : row.ingredients.findIndex((i) => i);
		const ing = row.ingredients[v]!;
		const intro = diff.versions[v].steps.find((s) => s.uses.includes(ing.id));
		// No step of its own uses it (a garnish "to taste"): it goes in at the end.
		const finish = { step: baseRecipe.steps.at(-1)!, with: '' };
		return [{ id: rowId.get(row.key)!, v, intro, match: intro ? matchingStep(intro, v, ing.id) : finish }];
	});
	// One borrowed step per version step, in that version's order.
	const borrowed = [...new Map(plans.flatMap((p) => (!p.match && p.intro ? [[`${p.v}:${p.intro.id}`, { step: p.intro, v: p.v }] as const] : []))).values()].toSorted(
		(a, b) => a.v - b.v || diff.versions[a.v].steps.indexOf(a.step) - diff.versions[b.v].steps.indexOf(b.step)
	);
	const name = (id: string) => ingredients.find((i) => i.id === id)!.name;
	for (const { id, v, intro, match } of plans) {
		// An ingredient whose own step is borrowed anyway goes in there.
		if (!match || borrowed.some((b) => b.v === v && b.step === intro)) continue;
		attach.set(match.step.id, [...(attach.get(match.step.id) ?? []), { id, name: name(id), from: choice.labels[v], with: match.with && name(match.with) }]);
	}

	/**
	 * The base step that does the same job as `intro` in version `v`: the one using most of
	 * the chosen ingredients `intro` uses, directly or through the steps it builds on.
	 */
	function matchingStep(intro: Step, v: number, self: string): { step: Step; with: string } | null {
		const own = diff.versions[v].steps;
		const inputs = (s: Step) => s.uses.flatMap((u) => (u === self ? [] : (newId.get(`${v}:${u}`) ?? replaced.get(`${v}:${u}`)?.id ?? [])));
		// Salt and pepper go in everywhere, so they say nothing about where; a main ingredient
		// (beef) only joins a step that has another main ingredient, not just the oil.
		const mainSelf = !basicGroup(rowOf.get(rowIdOf(v, self))!);
		const anchor = (id: string) => {
			const r = rowOf.get(id)!;
			const group = basicGroup(r);
			return group !== 'Salt, pepper and spices' || !/salt|pepper/.test(r.key) ? !mainSelf || !group : false;
		};
		let wanted = inputs(intro).filter(anchor);
		if (!wanted.length) wanted = intro.uses.flatMap((u) => own.find((s) => s.id === u) ?? []).flatMap(inputs).filter(anchor);
		if (!wanted.length) return null;
		let best: { step: Step; with: string } | null = null;
		let bestScore = 0;
		for (const s of baseRecipe.steps) {
			const shared = s.uses.flatMap((u) => newId.get(`${base}:${u}`) ?? replaced.get(`${base}:${u}`)?.id ?? []).filter((id) => wanted.includes(id));
			if (shared.length > bestScore) [best, bestScore] = [{ step: s, with: shared[0] }, shared.length];
		}
		return best;
	}

	const last = baseRecipe.steps.length - 1;
	baseRecipe.steps.forEach((step, n) => {
		const extra = attach.get(step.id) ?? [];
		// "Add the garlic along with the pancetta.", right after the sentence that adds the pancetta.
		const withExtras = (s: Step): Step => {
			let text = s.text;
			for (const [w, xs] of Map.groupBy(extra, (x) => x.with)) {
				const names = list(xs.map((x) => x.name));
				const line = w ? `Add the ${names} along with the ${w}.` : `Finish with the ${names}.`;
				const sentences = text.split(/(?<=[.!?])\s+/);
				const at = w ? sentences.findIndex((t) => swapName(t, w, '\u0000') !== t) : -1;
				sentences.splice(at < 0 ? sentences.length : at + 1, 0, line);
				text = sentences.join(' ');
			}
			return { ...s, text };
		};
		const tag = (c: Partial<MixedStep>): Partial<MixedStep> => {
			if (!extra.length) return c;
			const plus = extra.map((x) => `+ ${x.name} (${x.from})`).join(', ');
			return { changed: [c.changed, plus].filter(Boolean).join(', ') };
		};
		if (n === last) {
			// Borrowed steps go in before the last step, which then brings them in too.
			const extraIds = borrowed.map(({ step: s, v }) => add(rewrite(s, v), v, { from: choice.labels[v] }));
			const id = add(withExtras(rewrite(step, base)), base, tag(changes(step)));
			steps.find((s) => s.id === id)!.uses.push(...extraIds, ...extra.map((x) => x.id));
			return;
		}
		const id = add(withExtras(rewrite(step, base)), base, tag(changes(step)));
		steps.find((s) => s.id === id)!.uses.push(...extra.map((x) => x.id));
	});

	/**
	 * Swaps picked ingredients into a step's text, wherever the text names them: steps often
	 * mention an ingredient they don't list ("serve with the rest of the pecorino").
	 */
	function rewrite(step: Step, v: number): Step {
		let text = step.text;
		for (const ing of diff.versions[v].ingredients) {
			const r = replaced.get(`${v}:${ing.id}`);
			if (r) text = swapName(text, r.from, r.to);
		}
		const left = step.uses.flatMap((u) => dropped.get(`${v}:${u}`) ?? []);
		const onlyLeftOut = left.length === step.uses.length;
		if (left.length) text += onlyLeftOut ? ` (Skip this step: no ${left.join(' or ')}.)` : ` (Leave out the ${list(left)}.)`;
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

/** The average of the versions' amounts in one unit, rounded to what a cook would measure. */
function average(row: DiffRow): Amount | null {
	const r = rowMean(row);
	return r && r.qty != null ? roundAmount(r, row.key) : null;
}

/** A version's amount of a row in grams, or null when it has none or it can't be weighed. */
function grams(row: DiffRow, v: number): number | null {
	const b = baseValue(row.amounts[v]);
	const key = row.ingredients[v]?.key ?? row.key;
	if (!b) return null;
	if (b.dim === 'mass') return b.value;
	if (b.dim === 'volume') {
		const d = gramsPerMl(key, row.role) ?? gramsPerMl(row.key, row.role);
		return d == null ? null : b.value * d;
	}
	const each = PIECE_GRAMS[key] ?? PIECE_GRAMS[row.key];
	return each ? b.value * each : null;
}

/**
 * Average amounts for chosen ingredients that stand in for each other (whole eggs and yolks),
 * averaged as a family rather than one by one. Averaged separately, a version with 5 eggs and
 * one with 4 yolks make "3 eggs and 3½ yolks", more than any version uses. Instead each
 * version's total weight of the chosen members is averaged, and split in the base version's
 * proportions (or the members' own averages, when the base doesn't use them all), with
 * each member kept within the amounts versions use of it. Rows that can't be weighed keep their own average.
 */
export function familyAmounts(diff: RecipeDiff, choice: Pick<MixChoice, 'rows' | 'base'>): Map<string, Amount> {
	const out = new Map<string, Amount>();
	const rows = diff.rows.filter((r) => choice.rows.get(r.key) === 'average' && !basicGroup(r) && !COMBINED_ROLES.has(r.role));
	for (const group of Map.groupBy(rows, (r) => r.role).values()) {
		if (group.length < 2) continue;
		// A version whose amounts are all off by some factor (a wrong serving count) stays out, as in the row averages.
		const totals = diff.versions.flatMap((_, v) => {
			const used = diff.offScale[v] == null ? group.filter((r) => r.ingredients[v]) : [];
			return used.length ? [used.map((r) => grams(r, v))] : [];
		});
		if (totals.some((t) => t.some((g) => g == null))) continue;
		const mean = totals.reduce<number>((s, t) => s + t.reduce<number>((a, g) => a + g!, 0), 0) / totals.length;
		const inBase = group.every((r) => grams(r, choice.base) != null);
		const weight = (r: DiffRow) => {
			if (inBase) return grams(r, choice.base)!;
			const gs = r.amounts.flatMap((_, v) => grams(r, v) ?? []);
			return gs.reduce((s, g) => s + g, 0) / gs.length;
		};
		const total = group.reduce((s, r) => s + weight(r), 0);
		// No member gets more or less of itself than the versions use (not 5 yolks when they use 3 or 4).
		const clamp = (r: DiffRow, g: number) => {
			const gs = r.amounts.flatMap((_, v) => grams(r, v) ?? []);
			return Math.min(Math.max(g, Math.min(...gs)), Math.max(...gs));
		};
		const amounts = group.map((r) => fromGrams(r, clamp(r, (mean * weight(r)) / total)));
		if (amounts.some((a) => !a)) continue;
		group.forEach((r, n) => out.set(r.key, roundAmount(amounts[n]!, r.key)));
	}
	return out;
}

/** Grams of a row's ingredient as an amount in the unit the row is compared in. */
function fromGrams(row: DiffRow, g: number): Amount | null {
	const dim = rowValues(row)?.dim;
	const v = row.ingredients.findIndex((i) => i);
	const key = row.ingredients[v]!.key;
	if (dim === 'mass') return fromBase('mass', g, null);
	if (dim === 'volume') {
		const d = gramsPerMl(key, row.role) ?? gramsPerMl(row.key, row.role);
		return d ? fromBase('volume', g / d, null) : null;
	}
	const each = PIECE_GRAMS[key] ?? PIECE_GRAMS[row.key];
	return dim && each ? fromBase(dim, g / each, null) : null;
}

const to = (q: number, step: number) => Math.round(q / step) * step;

/** Things that only come whole: eggs and their parts. Other pieces (half a lemon, half an apple) can be halved. */
const WHOLE = /(^|-)eggs?(-|$)|yolks?$|whites?$/;

/**
 * Rounds an amount to kitchen precision: whole eggs and cloves, half a lemon, quarter spoons,
 * grams to 5 above 50 g. `key` is the ingredient's key, which decides whether a piece can be halved.
 */
export function roundAmount(a: Amount, key = ''): Amount {
	const r = roundQty(a, key);
	// A range's top end rounds the same way ("1½–3 eggs" becomes "2–3 eggs").
	if (a.qtyMax == null || r.unit !== a.unit) return r;
	const top = roundQty({ ...a, qty: a.qtyMax, qtyMax: null }, key).qty!;
	return { ...r, qtyMax: top > r.qty! ? top : null };
}

function roundQty(a: Amount, key: string): Amount {
	const q = a.qty!;
	switch (a.unit) {
		case 'g':
			return { ...a, qty: q >= 50 ? to(q, 5) : q >= 10 ? to(q, 1) : Math.max(0.5, to(q, 0.5)) };
		case 'ml':
			return { ...a, qty: q >= 100 ? to(q, 10) : to(q, 5) || 5 };
		case 'tsp':
			return q < 0.125 ? { unit: 'pinch', qty: 1, qtyMax: null } : { ...a, qty: q < 0.25 ? 0.125 : to(q, 0.25) };
		case 'tbsp':
			return { ...a, qty: Math.max(0.25, to(q, 0.25)) };
		case 'piece':
			if (!WHOLE.test(key) && q < 3) return { ...a, qty: Math.max(0.5, to(q, 0.5)) };
			return { ...a, qty: Math.max(1, Math.round(q)) };
		case null:
		case 'clove':
		case 'can':
		case 'bunch':
		case 'pinch':
			return { ...a, qty: Math.max(1, Math.round(q)) };
		default:
			return { ...a, qty: to(q, 0.25) || q };
	}
}

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** Swaps an ingredient's name in step text, also matching its last word ("the guanciale" for "guanciale, diced"). */
function swapName(text: string, from: string, to: string): string {
	const words = [from, from.split(/[\s,(]/)[0], from.split(' ').at(-1)!].filter((w) => w.length > 2);
	for (const w of words) {
		const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
		if (re.test(text)) return text.replace(new RegExp(re.source, 'gi'), to);
	}
	return text;
}
