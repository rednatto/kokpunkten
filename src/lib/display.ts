import { roughAmount, usAmount, weightHint } from './recipe/measures.ts';
import type { Ingredient } from './recipe/schema.ts';
import { convert, formatAmount, type Amount } from './recipe/units.ts';
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
