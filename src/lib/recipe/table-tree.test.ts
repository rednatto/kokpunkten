import { describe, expect, it } from 'vitest';
import { diffRecipes } from './diff';
import { recipeSchema } from './schema';
import { basicGroup, tableTree } from './table-tree';
import carbonara from '../library/spaghetti-carbonara.json';
import salmon from '../library/baked-salmon.json';

const tree = (json: unknown[]) => tableTree(diffRecipes(json.map((r) => recipeSchema.parse(r))));

describe('basicGroup', () => {
	it('groups by what an ingredient is before its role tag', () => {
		expect(basicGroup({ key: 'lemon-zest', role: 'acid' })).toBe('Zest, ginger and aromatics');
		expect(basicGroup({ key: 'orange-zest', role: 'aromatic' })).toBe('Zest, ginger and aromatics');
		expect(basicGroup({ key: 'garlic', role: 'aromatic' })).toBe('Onion and garlic');
		expect(basicGroup({ key: 'lemon-juice', role: 'acid' })).toBe('Acid');
		expect(basicGroup({ key: 'red-bell-pepper', role: 'vegetable' })).toBeNull();
		expect(basicGroup({ key: 'guanciale', role: 'cured-pork' })).toBeNull();
	});
});

describe('tableTree', () => {
	it('groups same-role main ingredients and puts basics last', () => {
		const t = tree(carbonara as unknown[]);
		const pork = t.find((g) => g.title === 'Cured pork')!;
		expect(pork.leaves.map((l) => l.row.key).sort()).toEqual(['bacon', 'guanciale', 'pancetta']);
		const firstBasic = t.findIndex((g) => g.basic);
		expect(t.slice(firstBasic).every((g) => g.basic)).toBe(true);
		expect(t.some((g) => g.title === 'Oil and fat')).toBe(true);
	});

	it('gives a row one sub-entry per name the versions use', () => {
		const t = tree(salmon as unknown[]);
		const oil = t.find((g) => g.title === 'Oil and fat')!.leaves.find((l) => l.row.key === 'olive-oil')!;
		expect(oil.subs.map((s) => s.name.toLowerCase()).sort()).toEqual(['extra virgin olive oil', 'olive oil']);
	});

	it('does not split a row over plurals', () => {
		const eggs = tree(carbonara as unknown[]).flatMap((g) => g.leaves).find((l) => l.row.key === 'egg')!;
		expect(eggs.subs).toEqual([]);
	});

	it('treats spelling variants of a name as one sub-entry', () => {
		const versions = (salmon as unknown[]).map((r) => recipeSchema.parse(r));
		const hyphened = structuredClone(versions[0]);
		hyphened.ingredients = hyphened.ingredients.map((i) => (i.key === 'olive-oil' ? { ...i, name: 'extra-virgin olive oil' } : i));
		const t = tableTree(diffRecipes([hyphened, ...versions]));
		const oil = t.find((g) => g.title === 'Oil and fat')!.leaves.find((l) => l.row.key === 'olive-oil')!;
		expect(oil.subs.map((s) => s.name.toLowerCase().replace('-', ' ')).sort()).toEqual(['extra virgin olive oil', 'olive oil']);
	});
});
