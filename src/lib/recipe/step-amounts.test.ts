import { describe, expect, it } from 'vitest';
import { diffRecipes } from './diff.ts';
import { mixRecipe } from './mix.ts';
import { sampleRecipe } from './sample.ts';
import { recipeSchema } from './schema.ts';
import { stepInputs } from './step-amounts.ts';

const carbonara = recipeSchema.parse(sampleRecipe);
const amount = (r = carbonara, step: string, ing: string) => stepInputs(r).get(step)!.get(ing)!.amount;

describe('stepInputs', () => {
	it('gives a step all of an ingredient no other step uses', () => {
		expect(amount(carbonara, 's1', 'i1')).toEqual({ qty: 150, qtyMax: null, unit: 'g' });
	});

	it("takes a shared ingredient's split from the steps, and the rest goes to the step without one", () => {
		expect(amount(carbonara, 's2', 'i3')).toEqual({ qty: 45, qtyMax: null, unit: 'g' });
		expect(amount(carbonara, 's4', 'i3')).toEqual({ qty: 15, qtyMax: null, unit: 'g' });
		expect(stepInputs(carbonara).get('s4')!.get('i3')!.shared).toBe(true);
	});

	it('works the rest out across units: 3 tbsp of 1 dl oil leaves 55 ml', () => {
		const r = recipeSchema.parse({
			...structuredClone(sampleRecipe),
			ingredients: [{ id: 'i1', key: 'olive-oil', name: 'olive oil', qty: 1, unit: 'dl' }],
			steps: [
				{ id: 's1', text: 'Fry the bread in 3 tbsp oil.', uses: ['i1'], amounts: [{ ingredient: 'i1', qty: 3, unit: 'tbsp' }] },
				{ id: 's2', text: 'Whisk in the rest of the oil.', uses: ['i1'] }
			]
		});
		expect(amount(r, 's2', 'i1')).toEqual({ qty: 0.55, qtyMax: null, unit: 'dl' });
	});

	it("leaves the split unknown when the recipe doesn't give it, and keeps to-taste as it is", () => {
		const r = recipeSchema.parse({
			...structuredClone(sampleRecipe),
			steps: sampleRecipe.steps.map((s) => ({ ...s, amounts: [], uses: s.id === 's1' ? [...s.uses, 'i5'] : s.uses }))
		});
		expect(amount(r, 's2', 'i3')).toBeNull();
		expect(amount(r, 's1', 'i5')).toEqual({ qty: null, qtyMax: null, unit: 'to-taste' });
	});

	it('rejects an amount for an ingredient the step does not use', () => {
		const r = structuredClone(sampleRecipe) as { steps: { amounts?: unknown[] }[] };
		r.steps[0].amounts = [{ ingredient: 'i3', qty: 10, unit: 'g' }];
		expect(recipeSchema.safeParse(r).success).toBe(false);
	});
});

describe('mixed recipes', () => {
	it("carry a step's share of an ingredient over to the mix's amount", () => {
		const more = recipeSchema.parse({
			...structuredClone(sampleRecipe),
			source: { type: 'personal', name: 'More cheese' },
			ingredients: sampleRecipe.ingredients.map((i) => (i.id === 'i3' ? { ...i, qty: 80 } : i))
		});
		const diff = diffRecipes([carbonara, more]);
		const row = diff.rows.find((r) => r.key === 'pecorino-romano')!;
		const rows = new Map(diff.rows.map((r) => [r.key, r === row ? 1 : 0] as const));
		const { recipe } = mixRecipe(diff, { rows, base: 0, labels: ['A', 'B'], title: 'Mix' });
		const cheese = recipe.ingredients.find((i) => i.key === 'pecorino-romano')!;
		// 45 of 60 g is three quarters; three quarters of 80 g is 60 g.
		expect(stepInputs(recipe).get('s2')!.get(cheese.id)!.amount).toMatchObject({ qty: 60, unit: 'g' });
	});
});
