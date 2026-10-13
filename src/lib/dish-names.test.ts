import { describe, expect, it } from 'vitest';
import { dishName, genericDishName } from './dish-names.ts';

describe('genericDishName', () => {
	it('takes the words of a title that spell the dish', () => {
		expect(genericDishName('chicken-tikka-masala', ['Easy Weeknight Chicken Tikka Masala (Restaurant Style)'])).toBe('Chicken tikka masala');
		expect(genericDishName('creme-brulee', ['Classic crème brûlée with vanilla'])).toBe('Crème brûlée');
	});

	it('looks through every version', () => {
		expect(genericDishName('carbonara', ['Rich and creamy pasta', 'Carbonara by Marcella'])).toBe('Carbonara');
	});

	it('falls back on what the cook typed, then the slug', () => {
		expect(genericDishName('chicken-curry', ['Kycklingcurry med kokosmjölk'], 'chicken curry')).toBe('Chicken curry');
		expect(genericDishName('chicken-curry', ['Kycklingcurry med kokosmjölk'], 'kycklinggryta')).toBe('Chicken curry');
	});
});

describe('dishName', () => {
	it("prefers the cook's name, then the library's", () => {
		expect(dishName('pad-thai', ['Pad Thai (Bangkok street style)'])).toBe('Pad thai');
		expect(dishName('pad-thai', ['x'], new Map([['pad-thai', 'Our pad thai']]))).toBe('Our pad thai');
	});
});
