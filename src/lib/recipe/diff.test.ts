import { describe, expect, it } from 'vitest';
import { amountRange, closestVersion, diffRecipes, rowMean, rowRange, seasonedInSteps, sharedDimension } from './diff';
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

	it('counts a head of garlic as cloves, not as one clove', () => {
		const withGarlic = (title: string, garlic: object) =>
			recipeSchema.parse({ ...structuredClone(sampleRecipe), title, ingredients: [...sampleRecipe.ingredients, { id: 'i9', key: 'garlic', role: 'allium', ...garlic }] });
		const versions = [
			withGarlic('Head', { name: 'garlic', qty: 1, unit: 'piece', original: '1 head garlic, halved' }),
			withGarlic('Heads', { name: 'heads of garlic', qty: 2, unit: 'piece' }),
			withGarlic('Cloves', { name: 'garlic', qty: 4, unit: 'clove' })
		];
		const garlic = diffRecipes(versions).rows.find((r) => r.key === 'garlic')!;
		expect(garlic.amounts.map((a) => [a?.qty, a?.unit])).toEqual([[10, 'clove'], [20, 'clove'], [4, 'clove']]);
	});

	it('weighs pieces that are slices, sticks or leaves when versions count differently', () => {
		const withIng = (title: string, ing: object) =>
			recipeSchema.parse({ ...structuredClone(sampleRecipe), title, ingredients: [...sampleRecipe.ingredients, { id: 'i9', ...ing }] });
		const row = (key: string, a: object, b: object) =>
			diffRecipes([withIng('A', { key, name: key, ...a }), withIng('B', { key, name: key, ...b })]).rows.find((r) => r.key === key)!.amounts.map((x) => [x?.qty, x?.unit]);
		expect(row('butter', { qty: 1, unit: 'piece', original: '1 stick of butter' }, { qty: 100, unit: 'g' })).toEqual([[113, 'g'], [100, 'g']]);
		expect(row('ginger', { qty: 4, unit: 'piece', original: '4 thin slices ginger' }, { qty: 1, unit: 'tbsp' })).toEqual([[12, 'g'], [1, 'tbsp']]);
		expect(row('basil', { qty: 12, unit: 'piece', original: '12 basil leaves' }, { qty: 10, unit: 'g' })).toEqual([[6, 'g'], [10, 'g']]);
		// Versions that count the same way keep their own numbers.
		expect(row('basil', { qty: 12, unit: 'piece', original: '12 basil leaves' }, { qty: 10, unit: 'piece', original: '10 fresh basil' })).toEqual([[12, 'piece'], [10, 'piece']]);
	});
});

describe('amountRange', () => {
	it('spans comparable amounts and gives up on mixed units', () => {
		expect(amountRange([{ qty: 1, qtyMax: null, unit: 'dl' }, { qty: 150, qtyMax: null, unit: 'ml' }])).toEqual({ qty: 100, qtyMax: 150, unit: 'ml' });
		expect(amountRange([{ qty: 1, qtyMax: null, unit: 'piece' }, { qty: 100, qtyMax: null, unit: 'g' }])).toBeNull();
	});
});

describe('rowRange', () => {
	const ing = (key: string) => ({ id: 'x', key, name: key.replaceAll('-', ' '), role: 'chili' }) as never;
	const row = (key: string, amounts: [number, string][]) => ({
		key,
		role: 'chili',
		amounts: amounts.map(([qty, unit]) => ({ qty, qtyMax: null, unit }) as never),
		ingredients: amounts.map(() => ing(key))
	});

	it('puts teaspoons, grams and pinches in one unit', () => {
		const r = rowRange(row('crushed-red-pepper-flakes', [[0.5, 'tsp'], [3, 'g'], [1, 'pinch'], [2, 'tsp'], [1, 'tbsp']]))!;
		expect(r.unit).toBe('tsp');
		expect(r.qty).toBeCloseTo(0.31 / 5);
		expect(r.qtyMax).toBe(3);
	});

	it('turns grams of garlic into cloves when most versions count cloves', () => {
		const r = rowRange(row('garlic', [[2, 'clove'], [4, 'clove'], [15, 'g']]))!;
		expect(r).toEqual({ unit: 'clove', qty: 2, qtyMax: 4 });
	});
});

describe('sharedDimension', () => {
	const row = (key: string, amounts: ([number, string] | null)[]) => ({
		key,
		role: 'hard-cheese',
		amounts: amounts.map((a) => (a ? ({ qty: a[0], qtyMax: null, unit: a[1] } as never) : null)),
		ingredients: amounts.map((a) => (a ? ({ id: 'x', key, name: key, role: 'hard-cheese' } as never) : null))
	});

	it('shows cheeses side by side in grams, not millilitres and grams', () => {
		const parmesan = row('parmesan', [[1, 'cup'], null, null]);
		const pecorino = row('pecorino-romano', [null, [70, 'g'], [50, 'g']]);
		const dim = sharedDimension([parmesan, pecorino]);
		expect(dim).toBe('mass');
		expect(rowRange(parmesan, dim)?.unit).toBe('g');
	});

	it('gives up when a row would lose an amount', () => {
		expect(sharedDimension([row('mystery-thing', [[1, 'cup'], null]), row('other-thing', [null, [70, 'g']])])).toBeNull();
	});
});

describe('outliers', () => {
	const batter = (title: string, servings: number, flour: number, milk: number, eggs: number) =>
		recipeSchema.parse({
			...structuredClone(sampleRecipe),
			dish: 'pancakes',
			title,
			servings,
			ingredients: [
				{ id: 'i1', key: 'all-purpose-flour', name: 'flour', role: 'flour', qty: flour, unit: 'g' },
				{ id: 'i2', key: 'whole-milk', name: 'milk', role: 'dairy', qty: milk, unit: 'ml' },
				{ id: 'i3', key: 'egg', name: 'eggs', role: 'egg', qty: eggs, unit: 'piece' },
				{ id: 'i4', key: 'salt', name: 'salt', role: 'salt', qty: 1, unit: 'pinch' }
			],
			steps: [{ id: 's1', text: 'Whisk and fry.', uses: ['i1', 'i2', 'i3', 'i4'] }]
		});

	it('finds a version whose amounts are all off by the same factor, and leaves it out of range and average', () => {
		// The last one is written for one serving, so at four servings it reads as four times everything.
		const diff = diffRecipes([batter('A', 4, 250, 500, 2), batter('B', 4, 200, 400, 2), batter('C', 4, 240, 450, 3), batter('D', 1, 200, 200, 2)]);
		expect(diff.offScale.map((f) => f && Math.round(f))).toEqual([null, null, null, 4]);
		const milk = diff.rows.find((r) => r.key === 'whole-milk')!;
		expect(milk.outliers).toEqual([3]);
		expect(rowRange(milk)).toEqual({ unit: 'ml', qty: 400, qtyMax: 500 });
		expect(rowMean(milk)!.qty).toBeCloseTo(450);
	});

	it('marks a single amount far from what three others use', () => {
		const diff = diffRecipes([batter('A', 4, 250, 500, 2), batter('B', 4, 200, 400, 2), batter('C', 4, 240, 450, 3), batter('D', 4, 230, 1600, 2)]);
		expect(diff.offScale.every((f) => f === null)).toBe(true);
		expect(diff.rows.find((r) => r.key === 'whole-milk')!.outliers).toEqual([3]);
		expect(diff.rows.find((r) => r.key === 'all-purpose-flour')!.outliers).toEqual([]);
	});

	it('marks nothing when versions simply differ', () => {
		const diff = diffRecipes([batter('A', 4, 250, 500, 2), batter('B', 4, 120, 250, 1), batter('C', 4, 300, 700, 4)]);
		expect(diff.offScale.every((f) => f === null)).toBe(true);
		expect(diff.rows.every((r) => !r.outliers.length)).toBe(true);
	});
});

describe('seasonedInSteps', () => {
	const steps = (text: string) => recipeSchema.parse({ ...structuredClone(sampleRecipe), steps: [{ id: 's1', text, uses: [] }] });

	it('counts salt and pepper to taste in a step as used', () => {
		const r = steps('Season with salt and pepper to taste.');
		expect(seasonedInSteps(r, { key: 'black-pepper', role: 'seasoning' })).toBe(true);
		expect(seasonedInSteps(r, { key: 'coarse-salt', role: 'salt' })).toBe(true);
		expect(seasonedInSteps(r, { key: 'cumin', role: 'spice' })).toBe(false);
	});

	it('only looks for seasonings, not main ingredients', () => {
		expect(seasonedInSteps(steps('Fry the guanciale.'), { key: 'guanciale', role: 'cured-pork' })).toBe(false);
	});
});
