import { describe, expect, it } from 'vitest';
import { sampleRecipe } from '../recipe/sample';
import { recipeSchema } from '../recipe/schema';
import { linkSteps, matchDish, namesIn, normalizeRecipe, sentenceCase, stepDuration, stepHeat, stepTempC, type RawRecipe } from './normalize';
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
	it('finds the longest time, keeping both ends of a range', () => {
		expect(stepDuration('Simmer for 20–25 minutes, then rest 5 min.')).toEqual({ min: 20, max: 25 });
		expect(stepDuration('Boil fish and bones on medium heat for 1-2 hours.')).toEqual({ min: 60, max: 120 });
		expect(stepDuration('Bake for 1 hour.')).toEqual({ min: 60, max: null });
		expect(stepDuration('Stir the pasta well.')).toBeNull();
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

	it('joins other names for a dish', () => {
		expect(matchDish('Spanish Tortilla', ['tortilla-espanola'])).toBe('tortilla-espanola');
		expect(matchDish("Shepherd's Pie", ['shepherds-pie'])).toBe('shepherds-pie');
		expect(matchDish('Banana Pancakes', ['pancakes'])).toBe('banana-pancakes');
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
		expect(r.steps[1]).toMatchObject({ uses: ['i1'], durationMin: 9 });
		expect(r.steps[2]).toMatchObject({ uses: ['i3'], heat: 'medium' });
		expect(r.steps[3]).toMatchObject({ uses: ['s1', 's2', 's3'] });
		expect(r.source.license).toBe('Unlicense');
		expect(res.warnings).toContain('no servings given, assumed 4');
	});
});

describe('linkSteps', () => {
	const ing = (id: string, name: string, role: string | null = null) => ({ id, role, lookFor: [name] });

	it('does not hang a separate preparation off the step before', () => {
		const uses = linkSteps(
			[
				'Cook some rice and set aside.',
				'Prepare the stock by boiling fish for 1-2 hours.',
				'In a pot, heat some oil and add the onion.',
				'Add the garlic and tomato.',
				'Add the fish and let simmer.',
				'If you are using rice, add it to each serving.'
			],
			[ing('i1', 'rice'), ing('i2', 'fish'), ing('i3', 'oil', 'fat'), ing('i4', 'onion'), ing('i5', 'garlic'), ing('i6', 'tomato')]
		);
		expect(uses).toEqual([['i1'], ['i2'], ['i3', 'i4'], ['s3', 'i5', 'i6'], ['s2', 's4'], ['s1', 's5']]);
	});

	it('carries on through steps that name nothing, past a pan being heated', () => {
		const uses = linkSteps(
			['Mix the flour and milk.', 'Let the batter rest for 15 minutes.', 'Heat a pan with butter.', 'Spread a ladle of batter in the pan.'],
			[ing('i1', 'flour'), ing('i2', 'milk'), ing('i3', 'butter', 'fat')]
		);
		expect(uses).toEqual([['i1', 'i2'], ['s1'], ['i3'], ['s2', 's3']]);
	});

	it('leaves the other strand out of a "while" clause', () => {
		const uses = linkSteps(
			['Fry the potato slowly.', 'While the potato fries, beat the egg.', 'Add the potato to the egg.', 'Flip it over and cook another 5 minutes.'],
			[ing('i1', 'potato'), ing('i2', 'egg')]
		);
		expect(uses).toEqual([['i1'], ['i2'], ['s1', 's2'], ['s3']]);
	});
});

describe('titles', () => {
	const names = namesIn(['Serve with Greek yogurt.', 'Wrap the beef in pastry as for Beef Wellington.', 'Fry the zucchini in the air fryer.']);
	it('tells names from ordinary words by how the texts write them', () => {
		expect(names.has('greek')).toBe(true);
		expect(names.has('wellington')).toBe(true);
		expect(names.has('wrap')).toBe(false);
		expect(names.has('zucchini')).toBe(false);
	});
	it('turns Title Case into sentence case, keeping names', () => {
		expect(sentenceCase('Air Fryer Zucchini', names)).toBe('Air fryer zucchini');
		expect(sentenceCase('Beef Wellington', names)).toBe('Beef Wellington');
		expect(sentenceCase('Greek Salad', names)).toBe('Greek salad');
		expect(sentenceCase('BBQ Ribs', names)).toBe('BBQ ribs');
	});
});
