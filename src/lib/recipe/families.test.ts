import { describe, expect, it } from 'vitest';
import { diffRecipes } from './diff';
import { familyOf, splitCompound } from './families';
import { recipeSchema, type Recipe } from './schema';
import { sampleRecipe } from './sample';
import cookies from '../library/chocolate-chip-cookies.json';
import lentilSoup from '../library/lentil-soup.json';
import roastPotatoes from '../library/roast-potatoes.json';

describe('families', () => {
	it('groups kinds and forms of the same flavouring', () => {
		expect(familyOf('kosher-salt', 'salt')).toBe('salt');
		expect(familyOf('crushed-red-pepper-flakes', 'chili')).toBe('chili-flakes');
		expect(familyOf('dried-chili-flakes', 'spice')).toBe('chili-flakes');
		expect(familyOf('flaky-sea-salt', 'garnish')).toBe('salt');
		expect(familyOf('black-peppercorns', 'spice')).toBe('black-pepper');
		expect(familyOf('flat-leaf-parsley', 'herb')).toBe('parsley');
		expect(familyOf('lemon-juice', 'acid')).toBe('lemon');
		expect(familyOf('dried-oregano', 'herb')).toBe('oregano');
	});

	it('leaves main ingredients alone', () => {
		expect(familyOf('dried-shrimp', 'protein')).toBe('dried-shrimp');
		expect(familyOf('ground-beef', 'meat')).toBe('ground-beef');
		expect(familyOf('lemon-zest', 'aromatic')).toBe('lemon-zest');
	});

	it('splits salt and pepper into two', () => {
		expect(splitCompound('salt-and-pepper')).toEqual(['salt', 'black-pepper']);
		expect(splitCompound('fish-and-chips')).toBeNull();
	});
});

const withIngredients = (title: string, change: (r: Recipe) => Recipe['ingredients']) => {
	const base = recipeSchema.parse(sampleRecipe);
	return recipeSchema.parse({ ...structuredClone(sampleRecipe), title, ingredients: change(base) });
};

describe('diff rows by family', () => {
	it('puts salt variants from different versions in one row', () => {
		const versions = (roastPotatoes as unknown[]).map((r) => recipeSchema.parse(r));
		const salt = diffRecipes(versions).rows.filter((r) => r.key.includes('salt'));
		expect(salt.map((r) => [r.key, r.count])).toEqual([['salt', 3]]);
	});

	it('treats a lemon and lemon juice as the same ingredient', () => {
		const versions = (lentilSoup as unknown[]).map((r) => recipeSchema.parse(r));
		const lemon = diffRecipes(versions).rows.filter((r) => r.key.includes('lemon'));
		expect(lemon.map((r) => [r.key, r.count])).toEqual([['lemon', 2]]);
	});

	it('keeps them apart when one version uses both, like flaky salt on top', () => {
		const versions = (cookies as unknown[]).map((r) => recipeSchema.parse(r));
		const keys = diffRecipes(versions).rows.map((r) => r.key);
		expect(keys).toContain('salt');
		expect(keys).toContain('flaky-salt');
	});

	it('lines "salt and pepper" up with the separate salt and pepper rows', () => {
		const a = withIngredients('A', (r) => [...r.ingredients, { id: 'i9', key: 'salt-and-pepper', name: 'salt and pepper', role: 'seasoning', qty: null, qtyMax: null, unit: 'to-taste', substitutes: [], optional: false }]);
		const b = withIngredients('B', (r) => [
			...r.ingredients,
			{ id: 'i9', key: 'kosher-salt', name: 'kosher salt', role: 'salt', qty: 1, qtyMax: null, unit: 'tsp', substitutes: [], optional: false },
			{ id: 'i10', key: 'black-pepper', name: 'black pepper', role: 'spice', qty: 0.5, qtyMax: null, unit: 'tsp', substitutes: [], optional: false }
		]);
		const diff = diffRecipes([a, b]);
		const salt = diff.rows.find((r) => r.key === 'salt')!;
		expect(salt.count).toBe(2);
		expect(diff.rows.find((r) => r.key === 'black-pepper')!.count).toBe(2);
	});
});
