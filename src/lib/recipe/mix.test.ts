import { describe, expect, it } from 'vitest';
import { diffRecipes } from './diff';
import { mixRecipe } from './mix';
import { recipeSchema } from './schema';
import carbonara from '../library/spaghetti-carbonara.json';

const versions = (carbonara as unknown[]).map((r) => recipeSchema.parse(r));
const diff = diffRecipes(versions, 4);
const labels = ['Roman classic', 'Pancetta and parmesan', 'With cream'];
/** The shared rows plus the given ones, all with amounts from `from`. */
const pick = (keys: string[], from: number | 'average') =>
	new Map([...diff.common.map((r) => r.key), ...keys].map((k) => [k, from] as const));

describe('mixRecipe', () => {
	const { recipe: mix, steps } = mixRecipe(diff, {
		rows: pick(['pancetta', 'pecorino-romano', 'egg-yolks', 'egg', 'garlic'], 'average'),
		base: 0,
		labels,
		title: 'Carbonara – my mix'
	});

	it('is a valid recipe with the chosen ingredients only', () => {
		const keys = mix.ingredients.map((i) => i.key);
		expect(keys).toContain('pancetta');
		expect(keys).toContain('garlic');
		expect(keys).not.toContain('guanciale');
		expect(keys).not.toContain('heavy-cream');
		expect(mix.servings).toBe(4);
		expect(mix.steps.length).toBe(steps.length);
	});

	it('swaps picked ingredients into the base method', () => {
		const first = steps[0];
		expect(first.text).toMatch(/pancetta/i);
		expect(first.text).not.toMatch(/guanciale/i);
		expect(first.changed).toBe('pancetta instead of guanciale');
	});

	it('borrows the steps that use ingredients the base lacks, before the last step', () => {
		const garlic = mix.ingredients.find((i) => i.key === 'garlic')!;
		const borrowed = steps.filter((s) => s.from);
		expect(borrowed.length).toBeGreaterThan(0);
		expect(borrowed.every((s) => s.from === 'Pancetta and parmesan')).toBe(true);
		expect(borrowed.some((s) => s.uses.includes(garlic.id))).toBe(true);
		const last = steps.at(-1)!;
		expect(borrowed.every((s) => last.uses.includes(s.id))).toBe(true);
	});

	it('speaks of the picked ingredients everywhere, borrowed steps included', () => {
		const other = mixRecipe(diff, {
			rows: pick(['guanciale', 'parmesan', 'egg-yolks', 'egg', 'garlic'], 0),
			base: 0,
			labels,
			title: 'mix'
		});
		const text = other.steps.map((s) => s.text).join(' ');
		expect(text).not.toMatch(/pancetta|pecorino/i);
		expect(other.steps.some((s) => s.from && /guanciale/.test(s.text))).toBe(true);
	});

	it('takes the middle amount when asked for averages', () => {
		const pepper = mix.ingredients.find((i) => i.key === 'black-pepper')!;
		const amounts = diff.rows.find((r) => r.key === 'black-pepper')!.amounts.map((a) => a!.qty);
		expect(pepper.qty).toBeGreaterThan(Math.min(...(amounts as number[])) - 0.01);
		expect(pepper.qty).toBeLessThan(Math.max(...(amounts as number[])) + 0.01);
	});

	it('leaves a pick-one slot empty when nothing is picked', () => {
		const none = mixRecipe(diff, { rows: pick(['egg-yolks', 'egg', 'pecorino-romano'], 'average'), base: 0, labels, title: 'mix' });
		expect(none.recipe.ingredients.some((i) => ['guanciale', 'pancetta', 'bacon'].includes(i.key))).toBe(false);
		expect(none.steps[0].text).toMatch(/Skip this step: no guanciale/);
	});

	it('takes an amount from the version it was picked from', () => {
		const rows = pick(['guanciale', 'pecorino-romano', 'egg-yolks', 'egg'], 'average');
		rows.set('black-pepper', 1);
		const { recipe } = mixRecipe(diff, { rows, base: 0, labels, title: 'mix' });
		const pepper = diff.rows.find((r) => r.key === 'black-pepper')!.amounts[1]!;
		expect(recipe.ingredients.find((i) => i.key === 'black-pepper')!.qty).toBe(pepper.qty);
	});
});
