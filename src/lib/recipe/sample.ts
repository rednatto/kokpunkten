/** Shown as the example in the AI prompt, and used by tests. Kept in input (unparsed) shape. */
export const sampleRecipe = {
	format: 'kokpunkten.recipe/v0',
	dish: 'spaghetti-carbonara',
	title: 'Spaghetti carbonara',
	language: 'en',
	source: { type: 'personal', name: 'Kokpunkten example' },
	servings: 4,
	time: { prepMin: 10, cookMin: 15, totalMin: 25 },
	cuisine: ['italian'],
	course: ['main'],
	tags: ['pasta', 'quick'],
	equipment: ['large pot', 'frying pan', 'bowl'],
	ingredients: [
		{ id: 'i1', key: 'guanciale', name: 'guanciale', role: 'cured-pork', qty: 150, unit: 'g', prep: 'cut into strips', substitutes: ['pancetta'], original: '150 g guanciale, cut into strips' },
		{ id: 'i2', key: 'egg-yolk', name: 'egg yolks', role: 'egg', qty: 4, unit: 'piece', original: '4 egg yolks' },
		{ id: 'i3', key: 'pecorino-romano', name: 'pecorino romano', role: 'hard-cheese', qty: 60, unit: 'g', prep: 'finely grated', substitutes: ['parmesan'], original: '60 g pecorino, finely grated' },
		{ id: 'i4', key: 'spaghetti', name: 'spaghetti', role: 'pasta', qty: 400, unit: 'g', original: '400 g spaghetti' },
		{ id: 'i5', key: 'black-pepper', name: 'black pepper', role: 'seasoning', qty: null, unit: 'to-taste', prep: 'freshly ground', original: 'black pepper' }
	],
	steps: [
		{ id: 's1', text: 'Fry the guanciale over medium heat until the fat renders and the edges crisp.', uses: ['i1'], technique: ['render'], durationMin: 8, heat: 'medium' },
		{ id: 's2', text: 'Whisk the yolks with most of the cheese and plenty of pepper.', uses: ['i2', 'i3', 'i5'], amounts: [{ ingredient: 'i3', qty: 45, unit: 'g' }], technique: ['whisk'] },
		{ id: 's3', text: 'Boil the pasta in well-salted water until al dente. Save 2 dl of the pasta water.', uses: ['i4'], technique: ['boil'], durationMin: 10 },
		{ id: 's4', text: 'Off the heat, toss the pasta with the pork and its fat, then the egg mixture. Loosen with pasta water until glossy. Serve with the rest of the cheese.', uses: ['s1', 's2', 's3', 'i3'], technique: ['emulsify', 'temper'], critical: 'Keep it below about 70 °C or the yolks scramble.' }
	],
	notes: {
		techniques: 'The sauce is an emulsion of rendered pork fat, starchy pasta water and egg yolk. The starch keeps it stable.',
		chemistry: 'Yolk proteins start to set around 65–70 °C, so the residual heat of the pasta thickens the sauce without curdling it.',
		spiceProfile: 'Black pepper is the only spice. The salty, tangy pecorino balances the fat.'
	}
};
