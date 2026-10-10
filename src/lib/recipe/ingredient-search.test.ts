import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingredientMatches, parseTerm, searchByIngredients, singular } from './ingredient-search';
import { recipeSchema, type Ingredient, type Recipe } from './schema';

const dir = new URL('../library/', import.meta.url);
const library: Recipe[] = readdirSync(dir)
	.filter((f) => f.endsWith('.json'))
	.flatMap((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as unknown[])
	.map((r) => recipeSchema.parse(r));

const ing = (key: string, name = key.replaceAll('-', ' '), role: string | null = null) =>
	({ id: 'x', key, name, role, optional: false, substitutes: [] }) as Ingredient;

describe('matching', () => {
	it('makes plurals meet', () => {
		expect(['potatoes', 'tomatoes', 'cherries', 'eggs', 'grass', 'asparagus'].map(singular)).toEqual([
			'potato',
			'tomato',
			'cherry',
			'egg',
			'grass',
			'asparagus'
		]);
	});

	it('translates Swedish terms', () => {
		expect(parseTerm('Potatis')).toEqual(['potato']);
		expect(parseTerm('vitlök')).toEqual(['garlic']);
		expect(parseTerm('falukorv')).toEqual(['falukorv']);
	});

	it('matches kinds of an ingredient but not products made from it', () => {
		const potato = parseTerm('potato');
		expect(ingredientMatches(ing('waxy-potato'), potato)).toBe(true);
		expect(ingredientMatches(ing('cooked-potatoes'), potato)).toBe(true);
		expect(ingredientMatches(ing('potato-starch'), potato)).toBe(false);
		expect(ingredientMatches(ing('chicken-stock'), parseTerm('chicken'))).toBe(false);
		expect(ingredientMatches(ing('chicken-thigh'), parseTerm('chicken'))).toBe(true);
		expect(ingredientMatches(ing('eggplant'), parseTerm('egg'))).toBe(false);
	});

	it('matches on the name and the role too', () => {
		expect(ingredientMatches(ing('falukorv', 'falukorv (Swedish bologna-style sausage)'), parseTerm('sausage'))).toBe(true);
		expect(ingredientMatches(ing('spaghetti', 'spaghetti', 'pasta'), parseTerm('pasta'))).toBe(true);
	});
});

describe('searchByIngredients', () => {
	const search = (...terms: string[]) => searchByIngredients(library, terms, (r) => r);

	it('finds falukorv and potato dishes, with recipes that have both first', () => {
		const hits = search('falukorv', 'potato');
		const both = hits.filter((h) => h.matched === 2).map((h) => h.item.dish);
		expect(both).toContain('pytt-i-panna');
		expect(hits[0].matched).toBe(2);
		expect(hits.some((h) => h.matched === 1)).toBe(true);
		expect(hits.every((h, i) => i === 0 || hits[i - 1].matched >= h.matched)).toBe(true);
	});

	it('ranks partial matches on the rarer ingredient first', () => {
		const partial = search('falukorv', 'potato').filter((h) => h.matched === 1);
		expect(partial[0].matches[0]?.key).toBe('falukorv');
	});

	it('reports which ingredient matched each term, and what is left to buy', () => {
		const hit = search('falukorv', 'potatis').find((h) => h.item.dish === 'pytt-i-panna' && h.matched === 2)!;
		expect(hit.matches.map((m) => m?.key)).toEqual(['falukorv', expect.stringMatching(/potato/)]);
		expect(hit.toBuy.map((i) => i.key)).not.toContain('salt');
		expect(hit.toBuy.map((i) => i.key)).not.toContain('falukorv');
	});

	it('leaves out recipes without any match, and ignores blank terms', () => {
		expect(search('  ')).toEqual([]);
		expect(search('unobtainium')).toEqual([]);
	});

	it('breaks ties with the preference, then fewer things to buy', () => {
		const a = library.find((r) => r.dish === 'omelette')!;
		const b = library.find((r) => r.dish === 'shakshuka')!;
		expect(searchByIngredients([a, b], ['egg'], (r) => r, (r) => (r === b ? -1 : 0))[0].item).toBe(b);
		const plain = searchByIngredients([a, b], ['egg'], (r) => r);
		expect(plain[0].toBuy.length).toBeLessThanOrEqual(plain[1].toBuy.length);
	});
});
