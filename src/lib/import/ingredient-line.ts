import type { Unit } from '../recipe/schema.ts';
import { MASS_G, VOLUME_ML } from '../recipe/units.ts';

/** One ingredient line from a website or dataset, split into parts. Nothing here is canonical yet. */
export interface ParsedLine {
	qty: number | null;
	qtyMax: number | null;
	unit: Unit | null;
	/** What the ingredient is called, without amounts or preparation. */
	name: string;
	/** Further names after "or": "guanciale or pancetta" gives name "guanciale", alternatives ["pancetta"]. */
	alternatives: string[];
	prep: string | null;
	optional: boolean;
}

/** Unit spellings found in ingredient lines, in English and Swedish. The value scales the quantity. */
const UNIT_WORDS: [string[], Unit, number?][] = [
	[['g', 'gr', 'gram', 'grams', 'gramm'], 'g'],
	[['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'], 'kg'],
	[['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], 'ml'],
	[['cl', 'centiliter', 'centilitre'], 'cl'],
	[['dl', 'deciliter', 'decilitre'], 'dl'],
	[['l', 'liter', 'liters', 'litre', 'litres'], 'l'],
	[['tsp', 'tsps', 'teaspoon', 'teaspoons', 'tsk'], 'tsp'],
	[['tbsp', 'tbsps', 'tbs', 'tbl', 'tb', 'tablespoon', 'tablespoons', 'msk'], 'tbsp'],
	[['krm'], 'krm'],
	[['cup', 'cups', 'c'], 'cup'],
	[['pint', 'pints', 'pt'], 'cup', 2],
	[['quart', 'quarts', 'qt'], 'cup', 4],
	[['gallon', 'gallons', 'gal'], 'cup', 16],
	[['oz', 'ounce', 'ounces'], 'oz'],
	[['lb', 'lbs', 'pound', 'pounds'], 'lb'],
	[['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces'], 'fl-oz'],
	[['clove', 'cloves', 'clove(s)', 'klyfta', 'klyftor'], 'clove'],
	[['pinch', 'pinches', 'nypa', 'dash', 'dashes'], 'pinch'],
	[['bunch', 'bunches', 'knippe'], 'bunch'],
	[['can', 'cans', 'tin', 'tins', 'burk', 'burkar'], 'can'],
	[['st', 'pcs', 'piece', 'pieces'], 'piece']
];
const UNIT_INDEX = new Map(UNIT_WORDS.flatMap(([words, unit, factor]) => words.map((w) => [w, { unit, factor: factor ?? 1 }])));
const UNIT_RE = [...UNIT_INDEX.keys()]
	.sort((a, b) => b.length - a.length)
	.map((w) => w.replace(/[.()]/g, '\\$&'))
	.join('|');

const VULGAR: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };
const WORD_NUMBERS: Record<string, number> = {
	a: 1,
	an: 1,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	twelve: 12,
	half: 0.5,
	en: 1,
	ett: 1,
	två: 2,
	tre: 3,
	fyra: 4
};

const NUM = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:[.,]\\d+)?\\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛]|(?:${Object.keys(WORD_NUMBERS).join('|')})(?![a-zåäö]))`;
const RANGE_SEP = '\\s*(?:-|–|—|to|or|till|à)\\s*';
// An amount at the start: "1 1/2 cups", "2-3 tbsp", "400g", "~150 g", "a pinch".
const AMOUNT_RE = new RegExp(
	`^(?:about|approx\\.?|ca\\.?|~|<|up to)?\\s*(${NUM})(?:${RANGE_SEP}(${NUM}))?(?:\\s*(${UNIT_RE})(?=$|[\\s.,;:)]))?\\.?\\s*`,
	'i'
);

function toNumber(s: string): number {
	const t = s.trim().toLowerCase();
	if (t in WORD_NUMBERS) return WORD_NUMBERS[t];
	if (t in VULGAR) return VULGAR[t];
	const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
	const frac = t.match(/^(\d+)\/(\d+)$/);
	if (frac) return +frac[1] / +frac[2];
	const withVulgar = t.match(/^(\d+(?:[.,]\d+)?)\s*([½¼¾⅓⅔⅛])$/);
	if (withVulgar) return +withVulgar[1].replace(',', '.') + VULGAR[withVulgar[2]];
	return +t.replace(',', '.');
}

interface Amount {
	qty: number;
	qtyMax: number | null;
	unit: Unit | null;
	/** What is left of the text after the amount. */
	rest: string;
}

function readAmount(text: string): Amount | null {
	const m = text.match(AMOUNT_RE);
	if (!m) return null;
	const [all, a, b, unitWord] = m;
	const rest = text.slice(all.length);
	const isWord = (s: string) => /^[a-zåäö]+$/i.test(s);
	// "a" and "one" are only amounts when a unit or a noun follows: "a pinch of salt", "one onion".
	if (isWord(a) && !unitWord && (!rest || /^of\b/i.test(rest))) return null;
	const u = unitWord ? UNIT_INDEX.get(unitWord.toLowerCase()) : undefined;
	let qty = toNumber(a);
	let qtyMax = b ? toNumber(b) : null;
	// "1 - 2/3 cups" means one and two thirds, not a range that shrinks.
	if (qtyMax != null && qtyMax < qty) {
		if (qtyMax < 1) qty += qtyMax;
		qtyMax = null;
	}
	const f = u?.factor ?? 1;
	return {
		qty: qty * f,
		qtyMax: qtyMax == null ? null : qtyMax * f,
		unit: u?.unit ?? null,
		rest: rest.replace(/^of\s+/i, '')
	};
}

const METRIC = new Set<Unit>(['g', 'kg', 'ml', 'cl', 'dl', 'l']);

const PACKAGE_RE = new RegExp(
	`^(\\d+(?:[.,]\\d+)?\\s*(?:oz|ounce|ounces|ml|cl|g|gram|grams|l)\\.?)\\s+(?:(?:large|small)\\s+)?((cans?|tins?|bottles?|jars?|packages?|packets?|pkgs?|bags?|boxes|box|sachets?|blocks?)\\s+(?:of\\s+)?)?`,
	'i'
);

/** Same-kind units in a common base, so "½ cup + 2 tablespoons" can be added up. */
function inBase(unit: Unit | null): { base: number; table: string } | null {
	if (!unit) return null;
	if (unit in MASS_G) return { base: MASS_G[unit]!, table: 'mass' };
	if (unit in VOLUME_ML) return { base: VOLUME_ML[unit]!, table: 'volume' };
	return null;
}

/**
 * What follows an amount that is more of the same amount: "1 kg / 2 lbs potatoes" gives the same
 * amount in other units (the metric one wins), "½ cup + 2 tbsp" adds up, "3 / 4 lemons" is a range.
 * Updates `amount` in place and returns the rest of the text, or null when nothing followed.
 */
function moreOfAmount(amount: Amount): string | null {
	const slash = amount.rest.match(/^\/\s*/);
	if (slash) {
		const alt = readAmount(amount.rest.slice(slash[0].length));
		if (!alt) return null;
		if (alt.unit && METRIC.has(alt.unit) && (!amount.unit || !METRIC.has(amount.unit))) Object.assign(amount, { ...alt, rest: alt.rest });
		else if (!alt.unit && !amount.unit && alt.qty > amount.qty && amount.qtyMax == null) amount.qtyMax = alt.qty;
		return alt.rest;
	}
	const plus = amount.rest.match(/^\+\s*/);
	if (plus) {
		const extra = readAmount(amount.rest.slice(plus[0].length));
		if (!extra) return null;
		const [a, b] = [inBase(amount.unit), inBase(extra.unit)];
		if (a && b && a.table === b.table) {
			const add = (extra.qty * b.base) / a.base;
			amount.qty += add;
			if (amount.qtyMax != null) amount.qtyMax += add;
		}
		return extra.rest;
	}
	return null;
}

/**
 * Splits a free-text ingredient line into amount, unit, name and preparation.
 * Handles the shapes common on recipe sites and in open datasets:
 * "1 ½ cups flour, sifted", "2 dl vispgrädde", "Spaghetti: 320 g | 11 oz",
 * "1 pound (500g) spaghetti", "Salt and pepper to taste", "Parsley (optional)".
 */
export function parseIngredientLine(line: string): ParsedLine {
	let text = line
		.replace(/\*\*|__|`/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		// "3⁄4" with a fraction slash, ".5 tsp" without the zero.
		.replace(/⁄/g, '/')
		.replace(/(^|\s)\.(\d)/g, '$10.$2')
		.replace(/\s+/g, ' ')
		.trim();

	let optional = false;
	let orMore: number | null = null;
	const notes: string[] = [];
	let metricAlt: Amount | null = null;

	// Parenthesised asides: "(optional)", an alternative amount "(500g)", or a note.
	text = text.replace(/\s*\(([^()]*)\)/g, (_, inner: string) => {
		const s = inner.trim();
		if (/^optional\b/i.test(s)) {
			optional = true;
			const more = s.replace(/^optional\b[,;:]?\s*/i, '');
			if (more) notes.push(more);
		} else if (/^s$/i.test(s)) {
			// "clove(s)"
		} else if (new RegExp(`^or (${NUM})$`, 'i').test(s)) {
			// "1 (or 2) cloves"
			orMore = toNumber(s.slice(3));
		} else {
			const alt = readAmount(s);
			if (alt && !alt.rest && alt.unit) {
				if (METRIC.has(alt.unit)) metricAlt = alt;
			} else if (s) notes.push(s);
		}
		return ' ';
	});
	text = text.replace(/\s+/g, ' ').trim();
	if (/[,;]?\s*\boptional\b\.?$/i.test(text)) {
		optional = true;
		text = text.replace(/[,;]?\s*\boptional\b\.?$/i, '').trim();
	}

	// "Spaghetti: 320 g | 11 oz" puts the name first.
	const colon = text.match(/^([^:]+):\s*(.+)$/);
	if (colon && readAmount(colon[2])) text = `${colon[2]} ${colon[1]}`;
	// Alternative measures after "|": "320 g | 11 oz" keeps the first.
	text = text.replace(/\s*\|\s*[\d½¼¾⅓⅔⅛][^a-zA-Z]*(?:[a-zA-Z.]+)?/g, '').trim();

	// "A little bit of salt", "a handful of basil": no amount to read, and not part of the name.
	text = text.replace(/^(?:an?\s+)?(?:little\s+)?(bit|little|splash|drizzle|knob|handful)\s+of\s+/i, (_, what: string) => {
		notes.push(/^(bit|little)$/i.test(what) ? 'a little' : `a ${what.toLowerCase()}`);
		return '';
	});
	let amount = readAmount(text);
	if (amount) {
		text = amount.rest;
		const more = moreOfAmount(amount);
		if (more) text = more;
	} else {
		// "Pinch of salt", "Bunch of parsley": a unit with no number means one.
		const bare = text.match(new RegExp(`^(${UNIT_RE})\\s+of\\s+`, 'i'));
		const u = bare && UNIT_INDEX.get(bare[1].toLowerCase());
		if (u && bare[1].length > 2) {
			text = text.slice(bare[0].length);
			amount = { qty: u.factor, qtyMax: null, unit: u.unit, rest: text };
		}
	}
	// "1 15 oz can diced tomatoes", "2 33cl bottles of beer": a package size, not part of the name.
	if (amount && !amount.unit) {
		const pack = text.match(PACKAGE_RE);
		if (pack) {
			text = text.slice(pack[0].length);
			notes.unshift(`${pack[1].replace(/\s+/g, ' ').replace(/\.$/, '')}${pack[3] ? ` ${pack[3].toLowerCase().replace(/s$/, '')}` : ''}`);
			if (pack[3] && /^(can|tin)/i.test(pack[3])) amount.unit = 'can';
		}
		// "3 - inch piece stick cinnamon" is one piece three inches long.
		const inch = text.match(/^-?\s*(inch|in\.|cm)\s+(?:piece|pieces|stick|sticks)?\s*(?:of\s+)?/i);
		if (inch) {
			text = text.slice(inch[0].length);
			notes.unshift(`${amount.qty}-${inch[1].replace(/\.$/, '').toLowerCase()} piece`);
			amount.qty = 1;
			amount.qtyMax = null;
		}
	}
	if (amount && orMore != null && amount.qtyMax == null && orMore > amount.qty) amount.qtyMax = orMore;
	// Prefer the metric alternative over cups and pounds.
	const m = metricAlt as Amount | null;
	if (m && (!amount || !amount.unit || !METRIC.has(amount.unit))) amount = { ...m, rest: text };

	// "1-2 potatoes per serving"
	text = text.replace(/\s+(per (?:serving|person|portion))\b/i, (_, per: string) => {
		notes.push(per.toLowerCase());
		return '';
	});

	let unit: Unit | null = amount?.unit ?? null;
	if (/\b(to taste|efter smak|as needed|to serve)\b/i.test(text)) {
		text = text.replace(/,?\s*\b(to taste|efter smak|as needed|to serve)\b/i, '').trim();
		if (!amount) unit = 'to-taste';
	}

	// Name first, preparation after a comma or a dash: "onion, finely chopped".
	const [head, ...tail] = text.split(/\s*,\s*|\s+[-–—]\s+/);
	const prep = [...tail, ...notes].map((s) => s.trim()).filter(Boolean).join(', ') || null;
	const [name, ...alternatives] = head
		.replace(/[.;:]+$/, '')
		.split(/\s+or\s+|\s*\/\s*(?=[a-zåäö])/i)
		.map((s) => s.trim())
		.filter(Boolean);

	return {
		qty: amount?.qty ?? null,
		qtyMax: amount?.qtyMax ?? null,
		unit,
		name: name ?? head.trim(),
		alternatives,
		prep,
		optional
	};
}
