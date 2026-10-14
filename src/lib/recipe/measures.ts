import { singular } from '../import/vocabulary.ts';
import type { Ingredient } from './schema.ts';
import { convert, formatQty, scaleAmount, type Amount } from './units.ts';

const CANNED = /^(canned-|crushed-tomatoes$|coconut-milk$)/;

/**
 * Typical weight in grams of one piece, clove, bunch or can, by ingredient key.
 * Averages for ordinary supermarket produce, good enough for shopping and guessing.
 */
export const PIECE_GRAMS: Record<string, number> = {
	'yellow-onion': 150,
	'red-onion': 150,
	'white-onion': 150,
	'pearl-onion': 10,
	shallot: 30,
	garlic: 5,
	carrot: 70,
	parsnip: 120,
	celery: 40,
	leek: 200,
	potato: 150,
	'floury-potato': 150,
	'waxy-potato': 100,
	tomato: 120,
	'cherry-tomatoes': 15,
	cucumber: 300,
	zucchini: 200,
	eggplant: 300,
	'red-bell-pepper': 160,
	'green-bell-pepper': 160,
	'bell-pepper': 160,
	fennel: 250,
	beetroot: 150,
	'sweet-potato': 250,
	avocado: 170,
	lemon: 120,
	lime: 70,
	orange: 200,
	apple: 180,
	banana: 120,
	egg: 50,
	'egg-yolk': 18,
	'egg-white': 32,
	scallion: 15,
	'green-chili': 10,
	'red-chili': 10,
	jalapeno: 15,
	'serrano-chili': 6,
	ginger: 30,
	'button-mushroom': 20,
	mushroom: 20,
	shiitake: 15,
	broccoli: 400,
	cauliflower: 600,
	'white-cabbage': 1000,
	'green-cabbage': 1000,
	'napa-cabbage': 1000,
	'quail-egg': 10,
	'chicken-breast': 180,
	'chicken-thigh': 120,
	'cod-fillet': 150,
	'haddock-fillet': 150,
	'salmon': 150,
	'bay-leaf': 0.2,
	cilantro: 25,
	'flat-leaf-parsley': 25,
	dill: 25,
	basil: 25,
	mint: 25,
	'thai-basil': 25,
	'canned-tomatoes': 400,
	'crushed-tomatoes': 400,
	'canned-chickpeas': 400,
	'canned-kidney-beans': 400,
	'canned-black-beans': 400,
	'coconut-milk': 400
};

/** Other names recipes use for an ingredient in PIECE_GRAMS. */
const PIECE_ALIASES: Record<string, string> = {
	onion: 'yellow-onion',
	'spring-onion': 'scallion',
	'green-onion': 'scallion',
	'garlic-clove': 'garlic'
};
/** Words that make a piece weigh something else entirely: a dried chili is not a fresh one. */
const NOT_A_PIECE = new Set(['dried', 'ground', 'powdered', 'smoked', 'pickled', 'candied', 'crystallized', 'minced', 'paste', 'juice', 'zest']);

/**
 * The PIECE_GRAMS key for an ingredient key, also for plurals and qualified names that
 * recipes added by hand use: "carrots", "large-eggs", "roma-tomato". Null when unknown.
 */
export function pieceKey(key: string): string | null {
	const known = (k: string) => (PIECE_GRAMS[k] ? k : PIECE_GRAMS[PIECE_ALIASES[k]] ? PIECE_ALIASES[k] : null);
	if (known(key)) return known(key);
	const parts = key.split('-').map(singular);
	if (parts.some((p) => NOT_A_PIECE.has(p))) return null;
	for (let i = 0; i < parts.length; i++) {
		const k = known(parts.slice(i).join('-'));
		if (k) return k;
	}
	return null;
}

/** Grams in one piece, clove, bunch or can of an ingredient, through `pieceKey`. */
export const pieceGrams = (key: string): number | null => {
	const k = pieceKey(key);
	return k ? PIECE_GRAMS[k] : null;
};

const BUNCHES = new Set(['cilantro', 'flat-leaf-parsley', 'dill', 'basil', 'mint', 'thai-basil']);

/** What one of an ingredient's PIECE_GRAMS is called. */
export const pieceUnit = (key: string): 'piece' | 'clove' | 'bunch' | 'can' => {
	const k = pieceKey(key) ?? key;
	return k === 'garlic' ? 'clove' : BUNCHES.has(k) ? 'bunch' : CANNED.test(k) ? 'can' : 'piece';
};

/** How a counted ingredient reads in grams, e.g. 2 carrots → "≈ 140 g". Null when unknown or not counted. */
export function weightHint(ing: Ingredient, a: Amount): string | null {
	const each = pieceGrams(ing.key);
	if (!each || a.qty == null || !a.unit || !['piece', 'clove', 'bunch', 'can'].includes(a.unit)) return null;
	const g = a.qty * each;
	if (g < 5) return null;
	return `≈ ${g >= 1000 ? `${Math.round(g / 100) / 10} kg` : `${formatQty(g, 'g')} g`}`;
}

/** Grams in 1 dl of loose dry goods, spooned and levelled. */
export const GRAMS_PER_DL: Record<string, number> = {
	'all-purpose-flour': 60,
	'bread-flour': 60,
	'tipo-00-flour': 60,
	'whole-wheat-flour': 60,
	'self-raising-flour': 60,
	sugar: 85,
	'caster-sugar': 85,
	'brown-sugar': 80,
	'icing-sugar': 50,
	'rolled-oats': 35,
	breadcrumbs: 40,
	panko: 20,
	'cocoa-powder': 40,
	rice: 85,
	'long-grain-rice': 85,
	'basmati-rice': 85,
	'short-grain-rice': 85,
	'sushi-rice': 85,
	arborio: 90,
	'red-lentils': 85,
	semolina: 70,
	polenta: 70
};

/**
 * Rough grams per millilitre, for comparing "1 tsp" with "3 g" of the same ingredient.
 * Null when there is no sensible guess (a cup of pasta is too loose to weigh).
 */
export function gramsPerMl(key: string, role?: string | null): number | null {
	if (GRAMS_PER_DL[key]) return GRAMS_PER_DL[key] / 100;
	if (/salt$/.test(key)) return 1.2;
	if (/flakes$/.test(key)) return 0.35;
	if (/sugar$/.test(key)) return 0.85;
	if (/flour$/.test(key)) return 0.6;
	if (/(honey|syrup|molasses)$/.test(key)) return 1.4;
	if (/(-oil|^oil)$/.test(key)) return 0.92;
	if (/(butter|ghee|lard)$/.test(key)) return 0.95;
	if (/(parmesan|pecorino.*|cheese|grana-padano)$/.test(key)) return 0.4;
	if (/(water|stock|broth|wine|juice|milk|cream|vinegar|sauce|beer)$/.test(key)) return 1;
	if (/^(spice|seasoning|chili|pepper)$/.test(role ?? '') || /(pepper|paprika|cumin|cinnamon|nutmeg|powder|seeds|ground-.*)$/.test(key)) return 0.5;
	if (/^(herb|garnish)$/.test(role ?? '')) return 0.2;
	return null;
}

const PORTION_GRAMS: Record<string, number> = { pasta: 100, noodles: 90 };

/** What the rough measures stand for, in grams or millilitres. */
export const ROUGH = {
	can: 400,
	knob: 15,
	handful: 30,
	leafyHandful: 25,
	glass: 200,
	splash: 40,
	pastaPortion: PORTION_GRAMS.pasta,
	noodlePortion: PORTION_GRAMS.noodles,
	ricePortion: 75
};

const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

/**
 * Translates an amount into kitchen guesswork, the "rough" units ("att höfta"): handfuls, glasses, cans,
 * portions or pieces. Returns null when there is no sensible rough measure, so the
 * caller can fall back to metric.
 */
export function roughAmount(ing: Ingredient, scaled: Amount): string | null {
	const a = convert(scaled, 'metric');
	const q = a.qty == null ? null : a.qtyMax == null ? a.qty : (a.qty + a.qtyMax) / 2;
	if (q == null || !a.unit) return null;
	const role = ing.role ?? '';

	if (a.unit === 'tsp' || a.unit === 'krm') {
		const tsp = a.unit === 'krm' ? q / 5 : q;
		if (tsp <= 0.3 && ['spice', 'seasoning', 'salt', 'herb', 'chili'].includes(role)) return 'a pinch';
		return null;
	}

	const grams = a.unit === 'g' ? q : a.unit === 'kg' ? q * 1000 : null;
	const ml = a.unit === 'ml' ? q : a.unit === 'cl' ? q * 10 : a.unit === 'dl' ? q * 100 : a.unit === 'l' ? q * 1000 : null;
	const amount = grams ?? ml;
	if (amount == null) return null;

	if (CANNED.test(ing.key)) return `≈ ${formatQty(half(amount / ROUGH.can), 'can')} ${amount / ROUGH.can > 1.25 ? 'cans' : 'can'}`;

	if (grams != null) {
		const each = pieceGrams(ing.key);
		if (each && grams / each >= 0.4) return pieces(grams / each, pieceUnit(ing.key));
		const portion = PORTION_GRAMS[role] ?? (role === 'rice' ? ROUGH.ricePortion : undefined);
		if (portion) return `≈ ${formatQty(half(grams / portion), 'piece')} ${grams / portion > 1.25 ? 'portions' : 'portion'}`;
		if (['fat', 'dairy'].includes(role) && /butter|ghee|lard/.test(ing.key)) return knobs(grams / ROUGH.knob);
		if (role === 'cheese' || role === 'hard-cheese') return handfuls(grams / ROUGH.handful);
		if (role === 'nut' || role === 'topping' || role === 'leafy-green') return handfuls(grams / (role === 'leafy-green' ? ROUGH.leafyHandful : ROUGH.handful));
		const perDl = GRAMS_PER_DL[ing.key];
		if (perDl) return `≈ ${formatQty(half(grams / perDl), 'cup')} dl`;
		return null;
	}

	if (ml != null && ['liquid', 'stock', 'dairy', 'wine', 'sauce'].includes(role)) {
		if (ml < ROUGH.splash) return 'a splash';
		return `≈ ${formatQty(half(ml / ROUGH.glass), 'cup')} ${ml / ROUGH.glass > 1.25 ? 'glasses' : 'glass'}`;
	}
	if (ml != null && role === 'fat' && ml <= 60) return ml < 20 ? 'a glug' : 'a couple of glugs';
	return null;
}

/** "≈ 1 ½" (the name follows: carrot), "≈ 3 cloves" (garlic) or "≈ ½ bunch" (dill); big counts in whole pieces. */
function pieces(n: number, unit: 'piece' | 'clove' | 'bunch' | 'can'): string {
	const q = n >= 5 ? Math.round(n) : half(n);
	const word = unit === 'piece' ? '' : ` ${q > 1 ? (unit === 'bunch' ? 'bunches' : `${unit}s`) : unit}`;
	return `≈ ${formatQty(q, 'piece')}${word}`;
}
const knobs = (n: number) => (n <= 1.25 ? 'a knob' : `≈ ${formatQty(Math.round(n), 'piece')} knobs`);
const handfuls = (n: number) => (n <= 1.25 ? 'a handful' : `≈ ${formatQty(half(n), 'piece')} handfuls`);

/**
 * US cooks measure butter, flour, sugar and rice by volume, so weights of those become
 * cups or tablespoons. Everything else uses the plain unit conversion.
 */
export function usAmount(ing: Ingredient, a: Amount): Amount {
	const metric = convert(a, 'metric');
	const grams = metric.unit === 'g' ? 1 : metric.unit === 'kg' ? 1000 : null;
	if (grams == null) return convert(a, 'us');
	if (/^(butter|ghee|lard)$/.test(ing.key)) {
		const tbsp = scaleAmount({ ...metric, unit: 'tbsp' }, grams / 14.2);
		return (tbsp.qty ?? 0) >= 8 ? scaleAmount({ ...tbsp, unit: 'cup' }, 1 / 16) : tbsp;
	}
	const perDl = GRAMS_PER_DL[ing.key];
	if (perDl) {
		const ml = (metric.qty ?? 0) * grams * (100 / perDl);
		if (ml >= 60) return scaleAmount({ ...metric, unit: 'cup' }, (grams * 100) / perDl / 240);
		return scaleAmount({ ...metric, unit: 'tbsp' }, (grams * 100) / perDl / 15);
	}
	return convert(a, 'us');
}
