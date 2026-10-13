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

describe('parseIngredientLine, messy imports', () => {
	it.each([
		['1 kg / 2 lbs potatoes', 1, null, 'kg', 'potatoes'],
		['32 oz / 950ml Chicken Stock or Broth', 950, null, 'ml', 'Chicken Stock'],
		['7 1/2 cups / 1.75 liters water', 1.75, null, 'l', 'water'],
		['1lbs./500g liver (chicken, beef, poultry etc.)', 500, null, 'g', 'liver'],
		['100 g / ½ cups butter', 100, null, 'g', 'butter'],
		['3 / 4 lemons', 3, 4, null, 'lemons'],
		['3⁄4 cup milk', 0.75, null, 'cup', 'milk'],
		['.5 TB ground allspice', 0.5, null, 'tbsp', 'ground allspice'],
		['<1 liter of milk', 1, null, 'l', 'milk'],
		['1 cup + 2 1/2 Tbsp Butter, divided', 1 + 2.5 / 16, null, 'cup', 'Butter'],
		['½ cup + 2 tablespoons (150ml) cold whole milk', 150, null, 'ml', 'cold whole milk'],
		['1-2 potatoes per serving', 1, 2, null, 'potatoes']
	])('%s', (line, qty, qtyMax, unit, name) => {
		const p = parse(line);
		expect(p).toMatchObject({ qtyMax, unit, name });
		expect(p.qty).toBeCloseTo(qty);
	});

	it('moves a package size out of the name', () => {
		expect(parse('1 15 oz can diced tomatoes')).toMatchObject({ qty: 1, unit: 'can', name: 'diced tomatoes', prep: '15 oz can' });
		expect(parse('2 33cl bottles of brown beer')).toMatchObject({ qty: 2, name: 'brown beer', prep: '33cl bottle' });
		expect(parse('1 8oz cream cheese')).toMatchObject({ qty: 1, name: 'cream cheese', prep: '8oz' });
		expect(parse('1 14.5 oz (400 grams) canned tomatoes')).toMatchObject({ qty: 400, unit: 'g', name: 'canned tomatoes' });
	});

	it('reads "3 - inch piece" as one piece', () => {
		expect(parse('3 - inch piece stick cinnamon')).toMatchObject({ qty: 1, name: 'stick cinnamon', prep: '3-inch piece' });
	});

	it('drops "a little bit of" from the name', () => {
		expect(parse('a little bit of salt (1/3 of a teaspoon)')).toMatchObject({ qty: null, name: 'salt' });
		expect(parse('A handful of basil leaves')).toMatchObject({ qty: null, name: 'basil leaves', prep: 'a handful' });
	});
});
