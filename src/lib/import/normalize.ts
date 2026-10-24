import { recipeSchema, type Ingredient, type Recipe, type Step } from '../recipe/schema.ts';
import { DISH_ALIASES } from './dish-aliases.ts';
import { parseIngredientLine } from './ingredient-line.ts';
import { matchIngredient, slugify, words, type Vocabulary } from './vocabulary.ts';

/**
 * A recipe as most sources have it: a title, ingredient lines and step texts.
 * Dataset adapters and the URL importer (schema.org Recipe) produce this; `normalizeRecipe` does the rest.
 */
export interface RawRecipe {
	title: string;
	/** The dish slug when the adapter knows it; otherwise it is derived from the title. */
	dish?: string;
	language: string;
	ingredients: { line: string; group?: string | null }[];
	steps: string[];
	servings?: number | null;
	prepMin?: number | null;
	cookMin?: number | null;
	totalMin?: number | null;
	cuisine?: string[];
	course?: string[];
	tags?: string[];
	source: Recipe['source'];
	/** Short name telling this version apart from the dish's other versions. */
	variant?: string | null;
}

export interface NormalizeOptions {
	vocab: Vocabulary;
	/** Dish slugs that already exist, so "Carbonara" joins "spaghetti-carbonara". */
	dishes?: Iterable<string>;
	/** Used when the source gives no servings. */
	defaultServings?: number;
	/** Words that keep their capital when a Title Case title becomes sentence case (see `sentenceCase`). */
	names?: Set<string>;
}

export type NormalizeResult =
	| { ok: true; recipe: Recipe; warnings: string[] }
	| { ok: false; errors: string[] };

/** Removes markdown and HTML that sources leave in their texts. */
export function plainText(s: string): string {
	return s
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/\*\*|__|`/g, '')
		.replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|[.,;:!?]|$)/g, '$1$2')
		.replace(/\s+/g, ' ')
		.trim();
}

/** "Shepherd's pie" is shepherds-pie, not shepherd-s-pie. */
const dishSlug = (title: string) => slugify(title.replace(/['’](?=s\b)/gi, ''));

/** Alias slug to dish slug, from DISH_ALIASES. */
const ALIAS_INDEX = new Map(Object.entries(DISH_ALIASES).flatMap(([dish, names]) => names.map((n) => [dishSlug(n), dish])));

/**
 * "Air Fryer Zucchini" as "Air fryer zucchini", the way the library writes titles. Words in
 * `names` keep their capital ("Beef Wellington", "Greek salad"), and so does anything
 * that isn't a plain capitalized word ("BBQ", "McDonald").
 */
export function sentenceCase(title: string, names: Set<string>): string {
	let first = true;
	return title.replace(/\p{L}+/gu, (w) => {
		const keep = first || !/^\p{Lu}\p{Ll}+$/u.test(w) || names.has(w.toLowerCase());
		first = false;
		return keep ? w : w.toLowerCase();
	});
}

/**
 * Words a corpus treats as names: capitalized inside a sentence more often than written in
 * lowercase. Capitals at the start of a sentence or line say nothing, so they don't count.
 */
export function namesIn(texts: Iterable<string>): Set<string> {
	const lower = new Map<string, number>();
	const upper = new Map<string, number>();
	for (const text of texts) {
		for (const m of text.matchAll(/\p{L}+/gu)) {
			const w = m[0];
			const k = w.toLowerCase();
			if (w === k) lower.set(k, (lower.get(k) ?? 0) + 1);
			else if (!/(^|[.!?:;(])\s*$/.test(text.slice(Math.max(0, m.index - 4), m.index))) upper.set(k, (upper.get(k) ?? 0) + 1);
		}
	}
	return new Set([...upper].filter(([w, n]) => n > (lower.get(w) ?? 0)).map(([w]) => w));
}

/**
 * Finds a known dish for a title: the same slug, the singular or plural of it, another name for it
 * ("Spanish tortilla" for "tortilla-espanola"), or a known dish that the title is the unique short form of
 * ("carbonara" for "spaghetti-carbonara").
 */
export function matchDish(title: string, dishes: Iterable<string>): string {
	const slug = dishSlug(title);
	const known = new Set(dishes);
	for (const cand of [slug, `${slug}s`, slug.replace(/s$/, '')]) {
		if (known.has(cand)) return cand;
		const alias = ALIAS_INDEX.get(cand);
		if (alias && known.has(alias)) return alias;
	}
	const longer = [...known].filter((d) => d.endsWith(`-${slug}`) || d.startsWith(`${slug}-`));
	return longer.length === 1 ? longer[0] : slug;
}

const DURATION = /\b(\d+(?:[.,]\d+)?|an|half an?)\s*(?:(?:-|–|to)\s*(\d+(?:[.,]\d+)?)\s*)?(hours?|hrs?|h|minutes?|mins?)\b/gi;

/**
 * The longest time a step mentions, in minutes. A range keeps both ends, so the timer can start at the
 * lower one: "simmer for 20–25 minutes" gives { min: 20, max: 25 }, "bake 1 hour" { min: 60, max: null }.
 */
export function stepDuration(text: string): { min: number; max: number | null } | null {
	let best: { min: number; max: number | null } | null = null;
	const n = (s: string) => (/^half/i.test(s) ? 0.5 : /^(an?|one)$/i.test(s) ? 1 : +s.replace(',', '.'));
	for (const m of text.matchAll(DURATION)) {
		const unit = /^h/i.test(m[3]) ? 60 : 1;
		const lo = n(m[1]) * unit;
		const hi = m[2] ? n(m[2]) * unit : null;
		const d = hi != null && hi > lo && lo > 0 ? { min: lo, max: hi } : { min: hi ?? lo, max: null };
		if (d.min > 0 && (best == null || (d.max ?? d.min) > (best.max ?? best.min))) best = d;
	}
	return best;
}

/** An oven or oil temperature in °C: "180°C", "350 °F", "350 degrees" (assumed °F when that high). */
export function stepTempC(text: string): number | null {
	const m = text.match(/(\d{2,3})\s*(?:°|º|degrees?|grader)\s*(c|f|celsius|fahrenheit)?\b/i);
	if (!m) return null;
	const n = +m[1];
	const f = m[2] ? /^f/i.test(m[2]) : n >= 250;
	return f ? Math.round(((n - 32) * 5) / 9 / 5) * 5 : n;
}

export function stepHeat(text: string): Step['heat'] | null {
	const m = text.match(/\b(low|medium|high)(?:\s*(?:-|\/|to)\s*(low|medium|high))?\s+heat\b/i);
	if (!m) return null;
	const [a, b] = [m[1].toLowerCase(), m[2]?.toLowerCase()];
	if (!b || a === b) return a as Step['heat'];
	if (a === 'medium' || b === 'medium') return `medium-${a === 'medium' ? b : a}` as Step['heat'];
	return 'medium';
}

/** Words that describe an ingredient rather than name it. */
const DESCRIBERS = new Set(
	'fresh dried ground whole large small medium extra virgin plain sweet hot smoked grated chopped sliced black white red green yellow brown light dark raw cooked frozen canned'.split(' ')
);

/** Ingredients too common to say which earlier step a step builds on: oil in two pans is not one strand. */
const SHARED_ROLES = new Set(['fat', 'salt', 'seasoning', 'spice', 'liquid', 'sweetener']);
/** A step that starts something of its own: a new vessel, a parallel task, or equipment to get ready. */
const STARTS_NEW =
	/^(?:meanwhile|while\b|in (?:a|an|another)\b|prepare\b|preheat\b|(?:heat|warm) (?:up )?(?:the |a |an )?(?:oven|grill|pan|skillet|wok|pot|frying pan|griddle|barbecue|bbq)\b)|\b(?:another|a separate|a second|a clean)\s+(?:\w+\s+)?(?:bowl|pan|pot|saucepan|skillet|dish|tray|wok|casserole)\b/i;
/** A step that works on what the step before it made, even when it only names new ingredients. */
const CONTINUES =
	/^(?:add|stir|mix in|pour|return|transfer|then|continue|reduce|cover|uncover|turn|flip|season|serve|top|garnish|sprinkle|fold|bring|let|leave|keep)\b|\b(?:the (?:mixture|dough|batter|sauce|pan|pot|saucepan|skillet|wok|bowl|dish|blender|rest)|remaining|reserved|serve)\b/i;
/** A step whose result waits for later, so the next step does not carry on from it. */
const PARKS = /\b(?:set|put|keep|leave) (?:it |them )?aside\b|\breserve\b[^.]*\.?\s*$/i;
/** A step that gets a pan or the oven ready, so the step after it carries on from the one before. */
const READIES = /^(?:pre)?heat\b|^warm\b|^grease\b|^line\b/i;
/** A step that brings the separate parts together. */
const COMBINES = /\b(?:everything|both mixtures|all the components)\b/i;

/**
 * What each step uses: the ingredients that first appear in it, the earlier steps that last handled an
 * ingredient it names again, and the step before it when the text carries on from there ("Add the garlic",
 * "let the mixture rest", a step that names nothing or names something already in use).
 * A step that starts on its own does not hang off the one before: a new vessel ("In a pot…"), a parallel
 * task ("Meanwhile…"), a step after one that sets its result aside, or one that only handles new
 * ingredients ("Boil the spaghetti").
 */
export function linkSteps(texts: string[], ingredients: { id: string; role: string | null; lookFor: string[] }[]): string[][] {
	const pending = new Set(ingredients.map((i) => i.id));
	const lastStep = new Map<string, number>();
	const consumed = new Set<number>();
	const out: string[][] = [];
	texts.forEach((text, n) => {
		// "While the potatoes are frying, beat the eggs": the potatoes belong to another strand.
		const own = text.replace(/^(?:while|as)\b[^,]*,\s*/i, '');
		const said = ` ${words(own.replace(/[()]/g, ' ')).join(' ')} `;
		const named = ingredients.filter((i) => i.lookFor.some((p) => said.includes(` ${p} `)));
		const fresh = named.filter((i) => pending.has(i.id)).map((i) => i.id);
		const after = new Set<number>();
		for (const i of named) {
			const last = lastStep.get(i.id);
			if (last != null && !SHARED_ROLES.has(i.role ?? '')) after.add(last);
		}
		if (n > 0 && COMBINES.test(text)) {
			for (let k = 0; k < n; k++) if (!consumed.has(k)) after.add(k);
		} else if (n > 0 && !STARTS_NEW.test(text) && !PARKS.test(texts[n - 1])) {
			// "Once it boils, add the rice": the condition says nothing about where the step starts.
			const main = own.replace(/^(?:if|once|when|after)\b[^,]*,\s*/i, '');
			if (CONTINUES.test(main) || fresh.length < named.length || !named.length) {
				after.add(n - 1);
				// "Heat a pan" made nothing to carry on from, so the step before it continues too.
				if (n > 1 && READIES.test(texts[n - 1])) after.add(n - 2);
			}
		}
		for (const i of named) lastStep.set(i.id, n);
		fresh.forEach((id) => pending.delete(id));
		after.forEach((k) => consumed.add(k));
		out.push([...[...after].sort((a, b) => a - b).map((k) => `s${k + 1}`), ...fresh]);
	});
	return out;
}

/** Turns a raw recipe into the Kokpunkten format and validates it. */
export function normalizeRecipe(raw: RawRecipe, opts: NormalizeOptions): NormalizeResult {
	const warnings: string[] = [];
	const ingredients: Ingredient[] = [];
	const lookFor = new Map<string, string[]>();

	for (const { line, group } of raw.ingredients) {
		const p = parseIngredientLine(line);
		const name = plainText(p.name).toLowerCase();
		const match = matchIngredient(name, opts.vocab);
		const key = match?.key ?? slugify(words(name).join(' '));
		if (!key) {
			warnings.push(`skipped ingredient line "${line}"`);
			continue;
		}
		if (!match) warnings.push(`unknown ingredient "${name}"`);
		const id = `i${ingredients.length + 1}`;
		ingredients.push({
			id,
			key,
			name,
			role: match?.role ?? null,
			qty: p.qty,
			qtyMax: p.qtyMax,
			unit: p.unit ?? (p.qty != null ? 'piece' : null),
			prep: p.prep,
			optional: p.optional,
			group: group ?? null,
			substitutes: p.alternatives.map((a) => a.toLowerCase()),
			original: plainText(line)
		});
		// How a step text would mention it: the matched phrase, the name or its last word,
		// its first word when that names nothing else ("pecorino" for pecorino romano), and the alternatives.
		const own = words(name);
		const first = own.length > 1 && !DESCRIBERS.has(own[0]) && (opts.vocab.phrases.get(own[0])?.key ?? key) === key ? own[0] : null;
		const alts = p.alternatives.map((a) => words(a).join(' '));
		lookFor.set(id, [...new Set([match?.phrase, own.at(-1), own.join(' '), first, ...alts].filter((s): s is string => !!s))]);
	}

	const texts = raw.steps.map(plainText).filter(Boolean);
	const links = linkSteps(
		texts,
		ingredients.map((i) => ({ id: i.id, role: i.role ?? null, lookFor: lookFor.get(i.id)! }))
	);
	const steps: Step[] = texts.map((text, n) => {
		const duration = stepDuration(text);
		return {
			id: `s${n + 1}`,
			text,
			uses: links[n],
			amounts: [],
			technique: [],
			durationMin: duration?.min ?? null,
			durationMaxMin: duration?.max ?? null,
			heat: stepHeat(text),
			tempC: stepTempC(text),
			critical: null
		};
	});

	let servings = raw.servings ?? null;
	const tags = [...new Set((raw.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
	if (!servings) {
		servings = opts.defaultServings ?? 4;
		warnings.push(`no servings given, assumed ${servings}`);
	}

	const res = recipeSchema.safeParse({
		dish: raw.dish ?? matchDish(raw.title, opts.dishes ?? []),
		title: opts.names ? sentenceCase(plainText(raw.title), opts.names) : plainText(raw.title),
		language: raw.language,
		source: raw.source,
		variant: raw.variant,
		servings,
		time: { prepMin: raw.prepMin ?? null, cookMin: raw.cookMin ?? null, totalMin: raw.totalMin ?? sum(raw.prepMin, raw.cookMin) },
		cuisine: raw.cuisine ?? [],
		course: raw.course ?? [],
		tags,
		ingredients,
		steps
	});
	if (!res.success) return { ok: false, errors: res.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
	return { ok: true, recipe: res.data, warnings };
}

function sum(a?: number | null, b?: number | null): number | null {
	return a == null && b == null ? null : (a ?? 0) + (b ?? 0);
}
