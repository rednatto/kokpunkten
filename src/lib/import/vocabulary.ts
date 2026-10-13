import type { Recipe } from '../recipe/schema.ts';

/** A canonical ingredient: the key and role recipes use for it. */
export interface Term {
	key: string;
	role: string | null;
}

export interface Vocabulary {
	/** Normalized phrase ("olive oil", "egg yolk") to the ingredient it names. */
	phrases: Map<string, Term>;
	/** Longest phrase, in words, so matching knows how far to look. */
	maxWords: number;
}

/** "Tomatoes" and "tomato" should meet: a rough English singular, good enough for matching. */
export function singular(word: string): string {
	if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
	if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
	if (/(oes|ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
	if (word.endsWith('s')) return word.slice(0, -1);
	return word;
}

export function words(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/\([^)]*\)/g, ' ')
		.split(/[^a-z0-9åäöéèüñç']+/)
		.map((w) => w.replace(/'s?$/, ''))
		.filter(Boolean)
		.map(singular);
}

/** Lowercase ASCII hyphen slug, as the recipe schema wants for keys and dish names. */
export function slugify(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Everyday names for ingredients the library knows under a more specific key.
 * Only used when the library has the key, so the vocabulary never invents one.
 */
const EVERYDAY: Record<string, string> = {
	flour: 'all-purpose-flour',
	'plain flour': 'all-purpose-flour',
	'wheat flour': 'all-purpose-flour',
	'white flour': 'all-purpose-flour',
	cumin: 'ground-cumin',
	pepper: 'black-pepper',
	oregano: 'dried-oregano',
	'chicken broth': 'chicken-stock',
	'beef broth': 'beef-stock',
	'vegetable broth': 'vegetable-stock',
	'beef bouillon': 'beef-stock',
	'bread crumbs': 'breadcrumbs',
	vanilla: 'vanilla-extract',
	bayleaf: 'bay-leaf',
	yogurt: 'plain-yogurt',
	yoghurt: 'plain-yogurt',
	'dry yeast': 'instant-yeast',
	'paprika powder': 'sweet-paprika',
	curcuma: 'turmeric',
	cornflour: 'cornstarch',
	'corn starch': 'cornstarch',
	'garlic clove': 'garlic',
	'garbanzo bean': 'chickpeas'
};

/**
 * Builds the ingredient vocabulary from recipes that already have canonical keys and roles,
 * such as the built-in library. Each ingredient's name and key become phrases that point at it;
 * when a phrase is used for several keys, the most common one wins.
 */
export function buildVocabulary(recipes: Recipe[]): Vocabulary {
	const counts = new Map<string, Map<string, number>>();
	const roles = new Map<string, Map<string, number>>();
	const bump = <K>(m: Map<K, Map<string, number>>, k: K, v: string) => {
		const inner = m.get(k) ?? new Map<string, number>();
		inner.set(v, (inner.get(v) ?? 0) + 1);
		m.set(k, inner);
	};
	for (const r of recipes)
		for (const ing of r.ingredients) {
			for (const phrase of [ing.key.replaceAll('-', ' '), ing.name]) {
				const p = words(phrase).join(' ');
				if (p) bump(counts, p, ing.key);
			}
			if (ing.role) bump(roles, ing.key, ing.role);
		}
	for (const [phrase, key] of Object.entries(EVERYDAY))
		if (roles.has(key) || [...counts.values()].some((m) => m.has(key))) bump(counts, words(phrase).join(' '), key);
	const top = (m: Map<string, number> | undefined) =>
		m ? [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] : null;

	const phrases = new Map<string, Term>();
	let maxWords = 1;
	for (const [phrase, keys] of counts) {
		const key = top(keys)!;
		phrases.set(phrase, { key, role: top(roles.get(key)) });
		maxWords = Math.max(maxWords, phrase.split(' ').length);
	}
	return { phrases, maxWords };
}

/** Words that turn "garlic" into another ingredient when they follow it: garlic powder, chicken stock. */
const HEADS = new Set(
	'powder stock broth bouillon sauce juice paste oil flake extract zest seed water milk vinegar syrup jam'.split(
		' '
	)
);

export interface Match extends Term {
	/** The words in the name that matched, for finding the ingredient in step texts. */
	phrase: string;
}

/**
 * Finds the canonical ingredient in a free-text name: the longest known phrase inside it,
 * unless a word after it makes it something else ("garlic powder" is not garlic).
 */
export function matchIngredient(name: string, vocab: Vocabulary): Match | null {
	const w = words(name);
	for (let len = Math.min(vocab.maxWords, w.length); len > 0; len--) {
		// Prefer the match furthest right: in "smoked pork sausage" the noun comes last.
		for (let start = w.length - len; start >= 0; start--) {
			const phrase = w.slice(start, start + len).join(' ');
			const term = vocab.phrases.get(phrase);
			if (!term) continue;
			const next = w[start + len];
			if (next && HEADS.has(next)) continue;
			return { ...term, phrase };
		}
	}
	return null;
}
