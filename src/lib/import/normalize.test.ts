import { describe, expect, it } from 'vitest';
import { sampleRecipe } from '../recipe/sample';
import { recipeSchema } from '../recipe/schema';
import { matchDish, normalizeRecipe, stepHeat, stepMinutes, stepTempC, type RawRecipe } from './normalize';
import { buildVocabulary, matchIngredient } from './vocabulary';

const vocab = buildVocabulary([recipeSchema.parse(sampleRecipe)]);

describe('vocabulary', () => {
	it('matches names to canonical keys and roles', () => {
		expect(matchIngredient('Guanciale', vocab)).toMatchObject({ key: 'guanciale', role: 'cured-pork' });
		expect(matchIngredient('freshly grated pecorino romano', vocab)).toMatchObject({ key: 'pecorino-romano' });
		expect(matchIngredient('egg yolks', vocab)).toMatchObject({ key: 'egg-yolk' });
	});

	it('does not take a derived product for the ingredient', () => {
		expect(matchIngredient('spaghetti sauce', vocab)).toBeNull();
	});
});

describe('step details', () => {
	it('finds the longest time', () => {
		expect(stepMinutes('Simmer for 20–25 minutes, then rest 5 min.')).toBe(25);
		expect(stepMinutes('Bake for 1 hour.')).toBe(60);
		expect(stepMinutes('Stir the pasta well.')).toBeNull();
	});

	it('reads temperatures in °C and °F', () => {
		expect(stepTempC('Heat the oven to 180°C.')).toBe(180);
		expect(stepTempC('Bake at 350 °F')).toBe(175);
		expect(stepTempC('Preheat to 425 degrees.')).toBe(220);
	});

	it('reads heat levels', () => {
		expect(stepHeat('Fry over medium heat')).toBe('medium');
		expect(stepHeat('At medium/low heat melt the butter')).toBe('medium-low');
	});
});

describe('matchDish', () => {
	const dishes = ['spaghetti-carbonara', 'pancakes', 'swedish-pancakes'];
	it('joins known dishes by slug, plural or unique short form', () => {
		expect(matchDish('Swedish Pancakes', dishes)).toBe('swedish-pancakes');
		expect(matchDish('Pancake', dishes)).toBe('pancakes');
		expect(matchDish('Carbonara', dishes)).toBe('spaghetti-carbonara');
		expect(matchDish('Apple pie', dishes)).toBe('apple-pie');
	});
});

describe('normalizeRecipe', () => {
	const raw: RawRecipe = {
		title: 'Carbonara',
		language: 'en',
		ingredients: [
			{ line: 'Spaghetti: 320 g | 11 oz' },
			{ line: 'Eggs: 5' },
			{ line: 'Guanciale or pancetta (cubed): 150 g' },
			{ line: 'Pecorino romano (grated)(optional)' }
		],
		steps: [
			'Whisk the **eggs** with the pecorino.',
			'Boil the spaghetti for 9 minutes.',
			'Fry the guanciale over medium heat.',
			'Toss everything together off the heat.'
		],
		tags: ['Quick'],
		source: { type: 'web', url: 'https://example.com/carbonara/', name: 'Example', license: 'Unlicense' }
	};

	it('produces a valid recipe with keys, roles and linked steps', () => {
		const res = normalizeRecipe(raw, { vocab, dishes: ['spaghetti-carbonara'] });
		if (!res.ok) throw new Error(res.errors.join('\n'));
		const r = res.recipe;
		expect(r.dish).toBe('spaghetti-carbonara');
		expect(r.ingredients.map((i) => i.key)).toEqual(['spaghetti', 'egg', 'guanciale', 'pecorino-romano']);
		expect(r.ingredients[1]).toMatchObject({ qty: 5, unit: 'piece', role: null });
		expect(r.ingredients[2].substitutes).toEqual(['pancetta']);
		expect(r.ingredients[3].optional).toBe(true);
		expect(r.steps[0]).toMatchObject({ text: 'Whisk the eggs with the pecorino.', uses: ['i2', 'i4'] });
		expect(r.steps[1]).toMatchObject({ uses: ['s1', 'i1'], durationMin: 9 });
		expect(r.steps[2]).toMatchObject({ uses: ['s2', 'i3'], heat: 'medium' });
		expect(r.source.license).toBe('Unlicense');
		expect(res.warnings).toContain('no servings given, assumed 4');
	});
});
