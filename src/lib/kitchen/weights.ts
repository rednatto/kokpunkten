import { GRAMS_PER_DL, PIECE_GRAMS, ROUGH, gramsPerMl } from '../recipe/measures.ts';
import { MASS_G, VOLUME_ML, formatQty } from '../recipe/units.ts';
import type { Unit } from '../recipe/schema.ts';

export interface Weighable {
	key: string;
	name: string;
	/** Grams per millilitre, when a volume of it can be weighed. */
	gPerMl: number | null;
	/** Grams in one piece, clove, bunch or can. */
	each: number | null;
	/** What one of `each` is called: piece, clove, bunch or can. */
	eachUnit: 'piece' | 'clove' | 'bunch' | 'can';
}

/** Pourable and spreadable everyday ingredients, on top of the dry goods with a measured weight per dl. */
const LIQUIDS_AND_FATS = ['water', 'milk', 'heavy-cream', 'olive-oil', 'butter', 'honey', 'salt', 'salt-flakes', 'grated-parmesan', 'coconut-milk'];
/** Only these weigh sensibly by volume: a dl of chopped bell pepper is anyone's guess. */
const BY_VOLUME = new Set([...Object.keys(GRAMS_PER_DL), ...LIQUIDS_AND_FATS]);

const NAMES: Record<string, string> = {
	'all-purpose-flour': 'all-purpose flour (vetemjöl)',
	'tipo-00-flour': 'tipo 00 flour',
	'grated-parmesan': 'parmesan, grated',
	arborio: 'arborio rice',
	salmon: 'salmon fillet'
};

const BUNCHES = new Set(['cilantro', 'flat-leaf-parsley', 'dill', 'basil', 'mint', 'thai-basil']);

const unitFor = (key: string): Weighable['eachUnit'] =>
	key === 'garlic' ? 'clove' : BUNCHES.has(key) ? 'bunch' : /^(canned-|crushed-tomatoes$|coconut-milk$)/.test(key) ? 'can' : 'piece';

/** Every ingredient the app has a weight for, by volume, by piece or both, sorted by name. */
export const WEIGHABLES: Weighable[] = [...new Set([...Object.keys(GRAMS_PER_DL), ...LIQUIDS_AND_FATS, ...Object.keys(PIECE_GRAMS)])]
	.map((key) => ({
		key,
		name: NAMES[key] ?? key.replaceAll('-', ' '),
		gPerMl: BY_VOLUME.has(key) ? gramsPerMl(key) : null,
		each: PIECE_GRAMS[key] ?? null,
		eachUnit: unitFor(key)
	}))
	.filter((w) => w.gPerMl != null || w.each != null)
	.sort((a, b) => a.name.localeCompare(b.name));

export type InputUnit = 'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'dl' | 'l' | 'cup' | 'tbsp' | 'tsp' | 'each';

/** An amount of one ingredient in grams and millilitres; null when that side is unknown. */
export function toBase(w: Weighable, qty: number, unit: InputUnit): { g: number | null; ml: number | null } {
	let g: number | null = null;
	let ml: number | null = null;
	if (unit === 'each') g = w.each == null ? null : qty * w.each;
	else if (unit in MASS_G) g = qty * MASS_G[unit as Unit]!;
	else ml = qty * VOLUME_ML[unit as Unit]!;
	if (g == null && ml != null && w.gPerMl) g = ml * w.gPerMl;
	if (ml == null && g != null && w.gPerMl) ml = g / w.gPerMl;
	return { g, ml };
}

export interface Equivalent {
	value: string;
	unit: string;
}

const plural = (q: number, one: string, many: string) => (q > 1.1 ? many : one);

/** The same amount told in the other measures a cook might reach for. */
export function equivalents(w: Weighable, qty: number, unit: InputUnit): Equivalent[] {
	const { g, ml } = toBase(w, qty, unit);
	const out: Equivalent[] = [];
	if (g != null && unit !== 'g') out.push(g >= 1000 ? { value: formatQty(g / 1000, 'kg'), unit: 'kg' } : { value: formatQty(g, 'g'), unit: 'g' });
	if (g != null && w.each && unit !== 'each') {
		const n = g / w.each;
		out.push({ value: formatQty(n, 'piece'), unit: plural(n, w.eachUnit, w.eachUnit === 'bunch' ? 'bunches' : `${w.eachUnit}s`) });
	}
	if (ml != null) {
		if (!['dl', 'ml', 'l'].includes(unit)) out.push(ml >= 1000 ? { value: formatQty(ml / 1000, 'l'), unit: 'l' } : ml >= 50 ? { value: formatQty(ml / 100, 'dl'), unit: 'dl' } : { value: formatQty(ml, 'ml'), unit: 'ml' });
		if (unit !== 'cup' && ml >= 60) out.push({ value: formatQty(ml / 240, 'cup'), unit: plural(ml / 240, 'cup', 'cups') });
		if (unit !== 'tbsp' && ml >= 7.5 && ml < 240) out.push({ value: formatQty(ml / 15, 'tbsp'), unit: 'tbsp' });
		if (unit !== 'tsp' && ml < 30) out.push({ value: formatQty(ml / 5, 'tsp'), unit: 'tsp' });
	}
	if (g != null && unit !== 'oz' && unit !== 'lb') out.push(g >= 454 ? { value: formatQty(g / MASS_G.lb!, 'lb'), unit: 'lb' } : { value: formatQty(g / MASS_G.oz!, 'oz'), unit: 'oz' });
	return out;
}

export interface Rule {
	what: string;
	is: string;
}

/** The rough measures the app uses in its "att höfta" view, and the units it converts between. */
export const KITCHEN_MEASURES: Rule[] = [
	{ what: 'a knob of butter', is: `≈ ${ROUGH.knob} g` },
	{ what: 'a handful of grated cheese or nuts', is: `≈ ${ROUGH.handful} g` },
	{ what: 'a handful of leaves (spinach, rocket)', is: `≈ ${ROUGH.leafyHandful} g` },
	{ what: 'a glass of liquid', is: `≈ ${ROUGH.glass / 100} dl` },
	{ what: 'a splash', is: `under ${ROUGH.splash} ml` },
	{ what: 'a can (tomatoes, beans, coconut milk)', is: `${ROUGH.can} g, beans ≈ 240 g drained` },
	{ what: 'a portion of pasta (dry)', is: `${ROUGH.pastaPortion} g` },
	{ what: 'a portion of rice (raw)', is: `${ROUGH.ricePortion} g` },
	{ what: 'a pinch', is: '≈ ¼ krm, under 0.5 g of salt' },
	{ what: 'a stick of butter (US)', is: '113 g, 8 tbsp' }
];

export const UNIT_RULES: Rule[] = [
	{ what: '1 krm', is: '1 ml' },
	{ what: '1 tsp (tsk)', is: '5 ml' },
	{ what: '1 tbsp (msk)', is: '15 ml, 3 tsp' },
	{ what: '1 dl', is: '100 ml, 6 ⅔ tbsp' },
	{ what: '1 US cup', is: '2.4 dl, 16 tbsp' },
	{ what: '1 fl oz', is: '30 ml' },
	{ what: '1 oz', is: '28 g' },
	{ what: '1 lb', is: '454 g, 16 oz' },
	{ what: 'oven 175 °C', is: '350 °F, gas 4' },
	{ what: 'oven 200 °C', is: '400 °F, gas 6' },
	{ what: 'oven 225 °C', is: '440 °F, gas 7' }
];
