import { describe, expect, it } from 'vitest';
import { roughAmount, weightHint } from './measures';
import { ingredientSchema, type Ingredient, type Unit } from './schema';
import type { Amount } from './units';

const ing = (key: string, role: string, name = key): Ingredient => ingredientSchema.parse({ id: 'i', key, role, name });
const amt = (qty: number, unit: Unit): Amount => ({ qty, qtyMax: null, unit });

describe('rough amounts (att höfta)', () => {
	it('turns weights of produce into pieces', () => {
		expect(roughAmount(ing('carrot', 'vegetable'), amt(140, 'g'))).toBe('≈ 2');
		expect(roughAmount(ing('yellow-onion', 'allium'), amt(75, 'g'))).toBe('≈ ½');
	});

	it('uses portions, cans, knobs, handfuls and glasses', () => {
		expect(roughAmount(ing('spaghetti', 'pasta'), amt(400, 'g'))).toBe('≈ 4 portions');
		expect(roughAmount(ing('canned-tomatoes', 'vegetable'), amt(800, 'g'))).toBe('≈ 2 cans');
		expect(roughAmount(ing('butter', 'fat'), amt(15, 'g'))).toBe('a knob');
		expect(roughAmount(ing('parmesan', 'hard-cheese'), amt(60, 'g'))).toBe('≈ 2 handfuls');
		expect(roughAmount(ing('chicken-stock', 'stock'), amt(4, 'dl'))).toBe('≈ 2 glasses');
		expect(roughAmount(ing('all-purpose-flour', 'flour'), amt(180, 'g'))).toBe('≈ 3 dl');
		expect(roughAmount(ing('ground-cumin', 'spice'), amt(0.25, 'tsp'))).toBe('a pinch');
	});

	it('gives up when there is no sensible guess', () => {
		expect(roughAmount(ing('ground-beef', 'meat'), amt(500, 'g'))).toBeNull();
	});
});

describe('standard weights', () => {
	it('shows grams for counted produce', () => {
		expect(weightHint(ing('carrot', 'vegetable'), amt(2, 'piece'))).toBe('≈ 140 g');
		expect(weightHint(ing('garlic', 'allium'), amt(3, 'clove'))).toBe('≈ 15 g');
		expect(weightHint(ing('mystery', 'vegetable'), amt(2, 'piece'))).toBeNull();
	});
});

describe('US volumes for baking staples', () => {
	it('measures butter in tablespoons and flour in cups', async () => {
		const { usAmount } = await import('./measures');
		const { formatAmount } = await import('./units');
		expect(formatAmount(usAmount(ing('butter', 'fat'), amt(30, 'g')))).toBe('2 tbsp');
		expect(formatAmount(usAmount(ing('butter', 'fat'), amt(225, 'g')))).toBe('1 cup');
		expect(formatAmount(usAmount(ing('all-purpose-flour', 'flour'), amt(250, 'g')))).toBe('1 ¾ cups');
		expect(formatAmount(usAmount(ing('ground-beef', 'meat'), amt(450, 'g')))).toBe('16 oz');
	});
});
