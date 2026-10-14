import { describe, expect, it } from 'vitest';
import { definingLabel, versionLabel, versionLabels, versionSource } from './labels';
import { recipeSchema, type Recipe } from './schema';
import { sampleRecipe } from './sample';

const version = (source: object, ingredients = sampleRecipe.ingredients, extra: object = {}): Recipe =>
	recipeSchema.parse({ ...structuredClone(sampleRecipe), source, ingredients, ...extra });
const roman = version({ type: 'ai-generated', name: 'Kokpunkten – Roman classic' });
const imported = (author: string, swap: string) =>
	version(
		{ type: 'web', name: 'Public Domain Recipes', author, url: 'https://example.com' },
		sampleRecipe.ingredients.map((i) => (i.id === 'i1' ? { ...i, key: swap, name: swap } : i))
	);

describe('version labels', () => {
	it("uses the app's own name without its prefix, and no source line", () => {
		expect(versionLabel(roman)).toBe('Roman classic');
		expect(versionSource(roman)).toBeNull();
	});

	it('prefers a given variant name, with the site and author on the second line', () => {
		const r = version({ type: 'web', name: 'Public Domain Recipes', author: 'Ada' }, sampleRecipe.ingredients, { variant: 'Yolks only' });
		expect(versionLabel(r)).toBe('Yolks only');
		expect(versionSource(r)).toBe('Public Domain Recipes · Ada');
	});

	it('names a version by the main ingredients only it uses, not salt or pepper', () => {
		expect(definingLabel(imported('Ada', 'pancetta'), [roman])).toBe('With pancetta');
		expect(definingLabel(roman, [roman])).toBeNull();
	});

	it('gives every version of a dish a different name', () => {
		expect(versionLabels([roman, imported('Ada', 'pancetta'), imported('Bo', 'bacon')])).toEqual(['Roman classic', 'With pancetta', 'With bacon']);
		expect(versionLabels([roman, imported('Ada', 'bacon'), imported('Bo', 'bacon')])).toEqual(['Roman classic', 'With bacon (Ada)', 'With bacon (Bo)']);
	});

	it('keeps the names of versions from different sites', () => {
		const site = (name: string, swap: string) =>
			version({ type: 'web', name, url: 'https://example.com' }, sampleRecipe.ingredients.map((i) => (i.id === 'i1' ? { ...i, key: swap, name: swap } : i)));
		expect(versionLabels([roman, site('Saveur (Rita Sodi)', 'pancetta'), site('Serious Eats', 'pancetta')])).toEqual([
			'Roman classic',
			'Saveur (Rita Sodi)',
			'Serious Eats'
		]);
	});
});
