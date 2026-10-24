import { roughAmount, usAmount, weightHint } from './recipe/measures.ts';
import type { Ingredient } from './recipe/schema.ts';
import type { StepInput } from './recipe/step-amounts.ts';
import { convert, formatAmount, ingredientAmount, scaleAmount, type Amount } from './recipe/units.ts';
import { settings } from './settings.svelte.ts';

/** An amount in the cook's chosen units, plus a quieter hint (standard weight, or the exact amount behind a rough one). */
export function showAmount(ing: Ingredient, a: Amount): { main: string; hint: string | null } {
	const shown = settings.units === 'us' ? usAmount(ing, a) : convert(a, settings.units === 'rough' ? 'metric' : settings.units);
	const exact = formatAmount(shown, settings.numbers);
	if (settings.units === 'rough') {
		const rough = roughAmount(ing, a);
		if (rough) return { main: rough, hint: exact };
	}
	return { main: exact, hint: settings.units === 'us' ? null : weightHint(ing, a) };
}

/**
 * What goes into a step, as "45 g" and "pecorino", in the cook's units and servings.
 * A shared ingredient whose split the recipe doesn't give reads "part of 60 g"; without an
 * input (an ingredient no step lists, which the diagram puts in the first step) it is all of it.
 */
export function stepInputLabel(ing: Ingredient, input: StepInput | undefined, factor: number): { amount: string; name: string } {
	const amount = input ? input.amount : ingredientAmount(ing, 1);
	if (amount?.unit === 'to-taste' || (!amount && ing.unit === 'to-taste')) return { amount: '', name: `${ing.name} to taste` };
	if (amount) return { amount: showAmount(ing, scaleAmount(amount, factor)).main, name: ing.name };
	const total = showAmount(ing, ingredientAmount(ing, factor)).main;
	return { amount: total && `part of ${total}`, name: ing.name };
}

/** A step time: "20 min", or "60–120 min" when the source gives a range. */
export function formatMinutes(min: number, max?: number | null): string {
	return max != null && max > min ? `${min}–${max} min` : `${min} min`;
}

/** A cuisine slug as a name: "italian" as "Italian", "tex-mex" as "Tex-Mex", "middle-eastern" as "Middle Eastern". */
export const cuisineName = (slug: string) =>
	slug.replace(/(^|-)(\p{L})/gu, (_, sep: string, c: string) => `${sep}${c.toUpperCase()}`).replace(/^(Middle|North|South|East|West)-/, '$1 ');
