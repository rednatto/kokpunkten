import { describe, expect, it } from 'vitest';
import { closestTo, diffRecipes } from './diff';
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
		expect(first.changed).toMatch(/^pancetta instead of guanciale/);
	});

	it('adds an ingredient the base lacks to the step that handles the same things', () => {
		const garlic = mix.ingredients.find((i) => i.key === 'garlic')!;
		const first = steps[0];
		expect(first.uses).toContain(garlic.id);
		expect(first.text).toMatch(/Fry the pancetta[^.]*\. Add the garlic along with the pancetta\./);
		expect(first.changed).toMatch(/\+ garlic \(Pancetta and parmesan\)/);
		expect(steps.filter((s) => s.from)).toHaveLength(0);
	});

	it('rounds average amounts to what a cook would measure', () => {
		for (const i of mix.ingredients) {
			if (i.unit === 'g') expect(i.qty! % (i.qty! >= 50 ? 5 : 0.5)).toBe(0);
			if (i.unit === 'tsp' || i.unit === 'tbsp') expect((i.qty! * 8) % 1).toBe(0);
			if (i.unit === 'piece' || i.unit === 'clove') expect(Number.isInteger(i.qty)).toBe(true);
		}
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
		expect(text).toMatch(/garlic along with the guanciale/);
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

describe('mixRecipe on every dish', () => {
	const files = import.meta.glob('../library/*.json', { eager: true, import: 'default' }) as Record<string, unknown[]>;
	it('makes a valid recipe from any choice of rows, with no step borrowed twice', () => {
		let seed = 7;
		const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		for (const json of Object.values(files)) {
			const versions = json.map((r) => recipeSchema.parse(r));
			const diff = diffRecipes(versions, 4);
			for (let t = 0; t < 20; t++) {
				const rows = new Map<string, number | 'average'>();
				for (const r of diff.rows) if (rnd() < 0.6) rows.set(r.key, rnd() < 0.5 ? 'average' : r.ingredients.findIndex((i) => i));
				if (!rows.size) continue;
				const { steps } = mixRecipe(diff, { rows, base: closestTo(diff, new Set(rows.keys())), labels: versions.map((_, i) => `v${i}`), title: 'm' });
				const texts = steps.filter((s) => s.from).map((s) => s.text);
				expect(new Set(texts).size).toBe(texts.length);
			}
		}
	});
});
