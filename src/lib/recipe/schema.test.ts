import { describe, expect, it } from 'vitest';
import { parseRecipes, recipeSchema } from './schema';
import { sampleRecipe } from './sample';

const clone = () => structuredClone(sampleRecipe) as Record<string, any>;

describe('recipeSchema', () => {
	it('accepts the sample recipe', () => {
		expect(recipeSchema.safeParse(sampleRecipe).success).toBe(true);
	});

	it('maps unit aliases', () => {
		const r = clone();
		r.ingredients[0].unit = 'Grams';
		r.ingredients[1].unit = 'msk';
		const res = recipeSchema.parse(r);
		expect(res.ingredients[0].unit).toBe('g');
		expect(res.ingredients[1].unit).toBe('tbsp');
	});

	it('rejects a step that uses an unknown or later id', () => {
		const r = clone();
		r.steps[0].uses = ['s4'];
		const res = recipeSchema.safeParse(r);
		expect(res.success).toBe(false);
		expect(res.error!.issues[0].message).toMatch(/not an ingredient or an earlier step/);
	});

	it('rejects duplicate ids', () => {
		const r = clone();
		r.ingredients[1].id = 'i1';
		expect(recipeSchema.safeParse(r).success).toBe(false);
	});
});

describe('parseRecipes', () => {
	it('reads an array wrapped in a markdown fence with prose around it', () => {
		const text = 'Here you go:\n```json\n' + JSON.stringify([sampleRecipe, sampleRecipe]) + '\n```\nEnjoy!';
		const res = parseRecipes(text);
		expect(res.ok && res.recipes.length).toBe(2);
	});

	it('reports which recipe and field failed', () => {
		const bad = clone();
		delete bad.servings;
		const res = parseRecipes(JSON.stringify([sampleRecipe, bad]));
		expect(res.ok).toBe(false);
		expect(!res.ok && res.errors[0]).toMatch(/^Recipe 2: servings/);
	});

	it('explains when there is no JSON', () => {
		const res = parseRecipes('Sorry, I could not find that recipe.');
		expect(!res.ok && res.errors[0]).toMatch(/Could not find any JSON/);
	});
});
