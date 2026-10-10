import { describe, expect, it } from 'vitest';
import { parseIngredientLine as parse } from './ingredient-line';

describe('parseIngredientLine', () => {
	it.each([
		['2 cups all-purpose flour', 2, null, 'cup', 'all-purpose flour'],
		['1 1/2 tsp salt', 1.5, null, 'tsp', 'salt'],
		['1 ½ msk smör', 1.5, null, 'tbsp', 'smör'],
		['2 dl vispgrädde', 2, null, 'dl', 'vispgrädde'],
		['400g potatoes', 400, null, 'g', 'potatoes'],
		['6-8 tbsp Butter', 6, 8, 'tbsp', 'Butter'],
		['5 to 6 cloves of garlic', 5, 6, 'clove', 'garlic'],
		['1 quart milk', 4, null, 'cup', 'milk'],
		['One can of garbanzo beans', 1, null, 'can', 'garbanzo beans'],
		['A bunch of fresh parsley', 1, null, 'bunch', 'fresh parsley'],
		['Pinch of salt', 1, null, 'pinch', 'salt'],
		['3 Eggs', 3, null, null, 'Eggs']
	])('%s', (line, qty, qtyMax, unit, name) => {
		expect(parse(line)).toMatchObject({ qty, qtyMax, unit, name });
	});

	it('reads "1 - 2/3 cups" as one and two thirds, not a shrinking range', () => {
		expect(parse('1 - 2/3 cups Milk').qty).toBeCloseTo(5 / 3);
		expect(parse('1 - 2/3 cups Milk').qtyMax).toBeNull();
	});

	it('handles the name-first form with alternative measures', () => {
		expect(parse('Guanciale or Smoked Pancetta (cleaned and cubed): 150 g | 5 oz')).toEqual({
			qty: 150,
			qtyMax: null,
			unit: 'g',
			name: 'Guanciale',
			alternatives: ['Smoked Pancetta'],
			prep: 'cleaned and cubed',
			optional: false
		});
	});

	it('prefers a metric amount given in parentheses', () => {
		expect(parse('1 pound (500g) spaghetti')).toMatchObject({ qty: 500, unit: 'g', name: 'spaghetti' });
	});

	it('splits off preparation, optional and "or 2"', () => {
		expect(parse('1 (or 2) clove(s) of garlic, roughly chopped')).toMatchObject({
			qty: 1,
			qtyMax: 2,
			unit: 'clove',
			name: 'garlic',
			prep: 'roughly chopped'
		});
		expect(parse('Fresh parsley (optional for serving)')).toMatchObject({ name: 'Fresh parsley', optional: true, prep: 'for serving' });
		expect(parse('Garlic powder, optional')).toMatchObject({ name: 'Garlic powder', optional: true });
	});

	it('marks "to taste" lines', () => {
		expect(parse('Salt and pepper to taste')).toMatchObject({ qty: null, unit: 'to-taste', name: 'Salt and pepper' });
	});

	it('does not read a leading "a" in a word as an amount', () => {
		expect(parse('apple sauce')).toMatchObject({ qty: null, name: 'apple sauce' });
	});
});
