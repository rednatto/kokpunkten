import type { Ingredient, Recipe } from './schema.ts';

/**
 * Swedish words a cook is likely to type, mapped to the English words the library uses.
 * Only whole search terms are looked up, so "lök" does not turn "vitlök" into onion.
 */
const SWEDISH: Record<string, string> = {
	potatis: 'potato',
	potatisar: 'potato',
	lök: 'onion',
	'gul lök': 'yellow onion',
	rödlök: 'red onion',
	purjolök: 'leek',
	vitlök: 'garlic',
	morot: 'carrot',
	morötter: 'carrot',
	ägg: 'egg',
	smör: 'butter',
	grädde: 'cream',
	gräddfil: 'sour cream',
	mjölk: 'milk',
	ost: 'cheese',
	kyckling: 'chicken',
	nötkött: 'beef',
	nötfärs: 'ground beef',
	köttfärs: 'ground beef',
	fläsk: 'pork',
	fläskkött: 'pork',
	skinka: 'ham',
	korv: 'sausage',
	lax: 'salmon',
	torsk: 'cod',
	fisk: 'fish',
	räkor: 'shrimp',
	ris: 'rice',
	tomat: 'tomato',
	tomater: 'tomato',
	svamp: 'mushroom',
	champinjoner: 'mushroom',
	citron: 'lemon',
	persilja: 'parsley',
	spenat: 'spinach',
	kål: 'cabbage',
	vitkål: 'cabbage',
	rödbetor: 'beet',
	bönor: 'bean',
	kikärtor: 'chickpea',
	linser: 'lentil',
	vetemjöl: 'flour',
	mjöl: 'flour',
	socker: 'sugar',
	honung: 'honey',
	vin: 'wine',
	äpple: 'apple',
	äpplen: 'apple'
};

/**
 * Words that turn an ingredient into a different product: someone with potatoes in the
 * fridge does not have potato starch, and chicken is not chicken stock.
 */
const DERIVED = new Set([
	'starch',
	'flour',
	'stock',
	'broth',
	'bouillon',
	'bun',
	'powder',
	'oil',
	'extract',
	'paste',
	'sauce',
	'vinegar',
	'flake'
]);

/** Kitchen basics most cooks have, so they don't count as something to buy. */
const PANTRY = new Set([
	'salt',
	'flaky-salt',
	'black-pepper',
	'white-pepper',
	'water',
	'neutral-oil',
	'olive-oil',
	'vegetable-oil',
	'butter',
	'sugar',
	'all-purpose-flour'
]);

/** Crude English singular, enough to make "potatoes" and "potato" meet. */
export function singular(word: string): string {
	if (word.length <= 3 || word.endsWith('ss') || word.endsWith('us')) return word;
	if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
	if (/(o|ch|sh|x)es$/.test(word)) return word.slice(0, -2);
	if (word.endsWith('s')) return word.slice(0, -1);
	return word;
}

const words = (text: string) =>
	text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
		.map(singular);

/** A search term as words to look for, with Swedish translated. Empty when nothing is left. */
export function parseTerm(term: string): string[] {
	const t = term.trim().toLowerCase().replace(/\s+/g, ' ');
	return words(SWEDISH[t] ?? t);
}

/** Whether `needle` appears as consecutive words in `hay`, and not as the start of a derived product. */
function containsTerm(hay: string[], needle: string[]): boolean {
	if (!needle.length) return false;
	for (let i = 0; i + needle.length <= hay.length; i++) {
		if (needle.every((w, j) => hay[i + j] === w) && !DERIVED.has(hay[i + needle.length])) return true;
	}
	return false;
}

/** Whether a recipe ingredient counts as the thing the cook searched for. */
export function ingredientMatches(ing: Ingredient, term: string[]): boolean {
	return (
		containsTerm(words(ing.key), term) ||
		containsTerm(words(ing.name), term) ||
		(ing.role != null && containsTerm(words(ing.role), term))
	);
}

export interface IngredientHit<T> {
	item: T;
	/** For each search term, the first ingredient that matched it, or null. */
	matches: (Ingredient | null)[];
	matched: number;
	/** Ingredients beyond the searched ones and the pantry basics: what the cook still needs. */
	toBuy: Ingredient[];
}

/**
 * Reverse search: which recipes use these ingredients. Recipes with every term come first,
 * then those with fewer, rarer terms counting for more; recipes with no match are left out.
 * Ties go to the recipe `prefer`
 * returns a lower number for (the cook's favorites and ratings), then to the one that needs
 * the fewest other ingredients.
 */
export function searchByIngredients<T>(
	items: T[],
	terms: string[],
	recipeOf: (item: T) => Recipe,
	prefer: (item: T) => number = () => 0
): IngredientHit<T>[] {
	const parsed = terms.map(parseTerm).filter((t) => t.length);
	if (!parsed.length) return [];

	const hits: IngredientHit<T>[] = [];
	for (const item of items) {
		const ingredients = recipeOf(item).ingredients;
		const matches = parsed.map((t) => ingredients.find((ing) => ingredientMatches(ing, t)) ?? null);
		const matched = matches.filter(Boolean).length;
		if (!matched) continue;
		const used = new Set(matches);
		const toBuy = ingredients.filter(
			(ing) => !used.has(ing) && !ing.optional && !PANTRY.has(ing.key) && !parsed.some((t) => ingredientMatches(ing, t))
		);
		hits.push({ item, matches, matched, toBuy });
	}
	// Among partial matches, a hit on a rare term (falukorv) says more than one on a common one (potato).
	const count = parsed.map((_, t) => hits.filter((h) => h.matches[t]).length);
	const rarity = (h: IngredientHit<T>) => h.matches.reduce((sum, m, t) => sum + (m ? 1 / count[t] : 0), 0);
	return hits.sort(
		(a, b) =>
			b.matched - a.matched ||
			rarity(b) - rarity(a) ||
			prefer(a.item) - prefer(b.item) ||
			a.toBuy.length - b.toBuy.length
	);
}
