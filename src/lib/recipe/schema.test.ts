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

describe('lenient step and servings input', () => {
	const step = (patch: Record<string, unknown>) => {
		const r = clone();
		Object.assign(r.steps[0], patch);
		return recipeSchema.parse(r).steps[0];
	};

	it('moves a temperature written as heat into tempC', () => {
		const s = step({ heat: '200 °C' });
		expect(s.heat).toBeUndefined();
		expect(s.tempC).toBe(200);
		expect(step({ heat: '180C' }).tempC).toBe(180);
		expect(step({ heat: 175 }).tempC).toBe(175);
		expect(step({ heat: '400 °F' }).tempC).toBe(204);
	});

	it('keeps an explicit tempC over a temperature in heat', () => {
		expect(step({ heat: '200 °C', tempC: 220 }).tempC).toBe(220);
	});

	it('reads tempC written as a string', () => {
		expect(step({ heat: null, tempC: '225 °C' }).tempC).toBe(225);
	});

	it('normalizes heat level spellings', () => {
		expect(step({ heat: 'Medium high' }).heat).toBe('medium-high');
		expect(step({ heat: 'high/medium' }).heat).toBe('medium-high');
		expect(step({ heat: 'low heat' }).heat).toBe('low');
		expect(step({ heat: 'medel' }).heat).toBe('medium');
	});

	it('still rejects heat that is neither a level nor a temperature', () => {
		const r = clone();
		r.steps[0].heat = 'scorching';
		expect(recipeSchema.safeParse(r).success).toBe(false);
	});

	it('reads servings written as text', () => {
		const r = clone();
		r.servings = '4–6 portions';
		expect(recipeSchema.parse(r).servings).toBe(4);
	});

	it('says plainly when a required field is missing', () => {
		const r = clone();
		delete r.servings;
		const res = parseRecipes(JSON.stringify(r));
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.errors).toEqual(['servings: required field is missing (expected number)']);
	});
});
