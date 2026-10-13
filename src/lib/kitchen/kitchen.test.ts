import { describe, expect, it } from 'vitest';
import { SWAPS, findSwaps } from './swaps.ts';
import { WEIGHABLES, equivalents, toBase } from './weights.ts';

const item = (key: string) => WEIGHABLES.find((w) => w.key === key)!;

describe('findSwaps', () => {
	it('finds by name prefix while typing', () => {
		expect(findSwaps('buttermi')[0].name).toBe('Buttermilk');
	});
	it('finds by Swedish and other names', () => {
		expect(findSwaps('smör').map((s) => s.name)).toContain('Butter');
		expect(findSwaps('lök')[0].name).toBe('Onion');
		expect(findSwaps('gräddfil')[0].name).toBe('Sour cream');
	});
	it('ranks a name match above an alias match', () => {
		expect(findSwaps('cream')[0].name).toMatch(/cream/i);
	});
	it('lists everything for an empty query', () => {
		expect(findSwaps('  ')).toHaveLength(SWAPS.length);
	});
});

describe('weights', () => {
	it('tells the volume of 100 g flour', () => {
		const { ml } = toBase(item('all-purpose-flour'), 100, 'g');
		expect(ml).toBeCloseTo(166.7, 0);
		expect(equivalents(item('all-purpose-flour'), 100, 'g')).toContainEqual({ value: '1.7', unit: 'dl' });
	});
	it('weighs a potato', () => {
		expect(equivalents(item('potato'), 2, 'each')[0]).toEqual({ value: '300', unit: 'g' });
	});
	it('does not guess a volume for produce', () => {
		expect(item('red-bell-pepper').gPerMl).toBeNull();
		expect(toBase(item('potato'), 100, 'g').ml).toBeNull();
	});
	it('knows liquids and butter', () => {
		expect(item('water').gPerMl).toBe(1);
		expect(toBase(item('butter'), 1, 'tbsp').g).toBeCloseTo(14.25, 1);
	});
});
