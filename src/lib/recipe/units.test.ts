import { describe, expect, it } from 'vitest';
import { formatAmount, formatQty, normalizeMetric, scaleAmount, toMetric } from './units';

describe('units', () => {
	it('scales ranges', () => {
		expect(scaleAmount({ qty: 100, qtyMax: 150, unit: 'g' }, 2)).toEqual({ qty: 200, qtyMax: 300, unit: 'g' });
	});

	it('converts imperial to metric', () => {
		expect(formatAmount(normalizeMetric(toMetric({ qty: 1, qtyMax: null, unit: 'cup' })))).toBe('2.4 dl');
		expect(formatAmount(toMetric({ qty: 8, qtyMax: null, unit: 'oz' }))).toBe('225 g');
		expect(formatAmount(toMetric({ qty: 3, qtyMax: null, unit: 'lb' }))).toBe('1.4 kg');
	});

	it('leaves spoons and counts alone', () => {
		expect(toMetric({ qty: 2, qtyMax: null, unit: 'tbsp' }).unit).toBe('tbsp');
		expect(formatAmount({ qty: 3, qtyMax: null, unit: 'piece' })).toBe('3');
	});

	it('picks a readable metric unit after scaling', () => {
		expect(formatAmount(normalizeMetric({ qty: 1600, qtyMax: null, unit: 'g' }))).toBe('1.6 kg');
		expect(formatAmount(normalizeMetric({ qty: 0.5, qtyMax: null, unit: 'dl' }))).toBe('50 ml');
	});

	it('shows fractions for spoons and counts', () => {
		expect(formatQty(1.5, 'tbsp')).toBe('1 ½');
		expect(formatQty(0.33, 'tsp')).toBe('⅓');
		expect(formatQty(2, 'piece')).toBe('2');
	});

	it('handles to-taste', () => {
		expect(formatAmount({ qty: null, qtyMax: null, unit: 'to-taste' })).toBe('to taste');
	});
});
