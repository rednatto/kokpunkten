/**
 * Ingredient families: keys that name the same thing in practice, so versions of a dish
 * that write "kosher-salt", "flaky-salt" or "salt" line up in one row when compared.
 */

/** Explicit members, for names a rule can't derive. Value is the family key. */
const SAME_AS: Record<string, string> = {
	pepper: 'black-pepper',
	'black-peppercorns': 'black-pepper',
	'ground-pepper': 'black-pepper',
	'freshly-ground-pepper': 'black-pepper',
	'flat-leaf-parsley': 'parsley',
	'curly-parsley': 'parsley',
	'italian-parsley': 'parsley',
	coriander: 'cilantro',
	'coriander-leaves': 'cilantro',
	'granulated-sugar': 'sugar',
	'white-sugar': 'sugar',
	'caster-sugar': 'sugar',
	'superfine-sugar': 'sugar',
	'unsalted-butter': 'butter',
	'salted-butter': 'butter',
	'extra-virgin-olive-oil': 'olive-oil',
	'vegetable-oil': 'neutral-oil',
	'sunflower-oil': 'neutral-oil',
	'canola-oil': 'neutral-oil',
	'rapeseed-oil': 'neutral-oil',
	'garlic-cloves': 'garlic',
	'yellow-onion': 'onion',
	'brown-onion': 'onion',
	'spanish-onion': 'onion',
	'parmigiano-reggiano': 'parmesan',
	'double-cream': 'heavy-cream',
	'whipping-cream': 'heavy-cream',
	'red-pepper-flakes': 'chili-flakes',
	'crushed-red-pepper-flakes': 'chili-flakes',
	'crushed-red-pepper': 'chili-flakes',
	'red-chili-flakes': 'chili-flakes',
	'chilli-flakes': 'chili-flakes',
	'pepper-flakes': 'chili-flakes'
};

/** Words in front of a key that only say which kind or form of it, e.g. kosher-salt. */
const KIND = /^(kosher|sea|coarse|flaky|fine|table|coarse-sea|fine-sea|flaky-sea|fresh|freshly-ground|ground|dried|whole|large|small|medium|ripe)-/;
/** Endings that name a part or form of the same ingredient, e.g. lemon-juice. */
const PART = /-(juice|leaves|sprigs|cloves|peppercorns)$/;

/** Families whose members are interchangeable even when the roles differ (salt as seasoning or garnish). */
const LOOSE = new Set(['salt', 'black-pepper', 'parsley', 'cilantro', 'sugar', 'onion', 'garlic', 'butter']);

/**
 * The family a key belongs to. Prefix and suffix rules only apply to herbs, spices, salt,
 * acids and other flavourings, so "dried-shrimp" stays apart from "shrimp".
 */
export function familyOf(key: string, role?: string | null): string {
	if (SAME_AS[key]) return SAME_AS[key];
	const flavouring = !role || /salt|seasoning|spice|herb|acid|garnish|aromatic|chili|sweetener|fat|allium|topping/.test(role);
	if (!flavouring) return key;
	let base = key.replace(KIND, '');
	if (base.endsWith('peppercorns') && base !== key) base = base.replace(/peppercorns$/, 'pepper');
	base = base.replace(PART, '');
	if (base.endsWith('salt')) base = 'salt';
	return SAME_AS[base] ?? base;
}

export const isLooseFamily = (family: string) => LOOSE.has(family);

/** "salt-and-pepper" style keys stand for two ingredients; returns their keys, or null. */
export function splitCompound(key: string): [string, string] | null {
	const m = /^(.+?)-and-(.+)$/.exec(key);
	if (!m) return null;
	const [a, b] = [familyOf(m[1]), familyOf(m[2])];
	return LOOSE.has(a) && LOOSE.has(b) ? [a, b] : null;
}

/** A readable name for a family key, used when no version names the plain ingredient. */
export const familyName = (family: string) => family.replaceAll('-', ' ');
