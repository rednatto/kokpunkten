import { describe, expect, it } from 'vitest';
import { amountRange, closestVersion, diffRecipes } from './diff';
import { recipeSchema } from './schema';
import { sampleRecipe } from './sample';

const roman = recipeSchema.parse(sampleRecipe);
const pancetta = recipeSchema.parse({
	...structuredClone(sampleRecipe),
	title: 'Pancetta carbonara',
	ingredients: sampleRecipe.ingredients.map((i) =>
		i.id === 'i1' ? { ...i, key: 'pancetta', name: 'pancetta', qty: 200 } : i.id === 'i3' ? { ...i, key: 'parmesan', name: 'parmesan' } : i
	)
});
const cream = recipeSchema.parse({
	...structuredClone(sampleRecipe),
	title: 'Cream carbonara',
	servings: 2,
	ingredients: [...sampleRecipe.ingredients, { id: 'i6', key: 'heavy-cream', name: 'cream', role: 'dairy', qty: 1, unit: 'dl' }],
	steps: [...sampleRecipe.steps, { id: 's5', text: 'Stir in the cream.', uses: ['s4', 'i6'] }]
});

describe('diffRecipes', () => {
	const diff = diffRecipes([roman, pancetta, cream]);

	it('finds the ingredients every version shares, scaled to the same servings', () => {
		expect(diff.common.map((r) => r.key).sort()).toEqual(['black-pepper', 'egg-yolk', 'spaghetti']);
		const pasta = diff.common.find((r) => r.key === 'spaghetti')!;
		expect(pasta.amounts.map((a) => a?.qty)).toEqual([400, 400, 800]);
	});

	it('groups different ingredients in the same role into a pick-one slot', () => {
		const pork = diff.slots.find((s) => s.role === 'cured-pork')!;
		expect(pork.options.map((o) => [o.row.key, o.versions])).toEqual([
			['guanciale', [0, 2]],
			['pancetta', [1]]
		]);
	});

	it('lists additions that only some versions make', () => {
		expect(diff.extras.map((r) => r.key)).toEqual(['heavy-cream']);
	});

	it('picks the version closest to the choices', () => {
		expect(closestVersion(diff, new Map([['cured-pork', 'pancetta']]), new Set())).toBe(1);
		expect(closestVersion(diff, new Map([['cured-pork', 'guanciale']]), new Set(['heavy-cream']))).toBe(2);
	});
});

describe('amountRange', () => {
	it('spans comparable amounts and gives up on mixed units', () => {
		expect(amountRange([{ qty: 1, qtyMax: null, unit: 'dl' }, { qty: 150, qtyMax: null, unit: 'ml' }])).toEqual({ qty: 100, qtyMax: 150, unit: 'ml' });
		expect(amountRange([{ qty: 1, qtyMax: null, unit: 'piece' }, { qty: 100, qtyMax: null, unit: 'g' }])).toBeNull();
	});
});
