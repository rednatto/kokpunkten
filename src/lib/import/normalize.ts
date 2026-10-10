import { recipeSchema, type Ingredient, type Recipe, type Step } from '../recipe/schema.ts';
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
}

export interface NormalizeOptions {
	vocab: Vocabulary;
	/** Dish slugs that already exist, so "Carbonara" joins "spaghetti-carbonara". */
	dishes?: Iterable<string>;
	/** Used when the source gives no servings. */
	defaultServings?: number;
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

/**
 * Finds a known dish for a title: the same slug, the singular or plural of it,
 * or a known dish that the title is the unique short form of ("carbonara" for "spaghetti-carbonara").
 */
export function matchDish(title: string, dishes: Iterable<string>): string {
	const slug = slugify(title);
	const known = new Set(dishes);
	for (const cand of [slug, `${slug}s`, slug.replace(/s$/, '')]) if (known.has(cand)) return cand;
	const longer = [...known].filter((d) => d.endsWith(`-${slug}`) || d.startsWith(`${slug}-`));
	return longer.length === 1 ? longer[0] : slug;
}

const DURATION = /\b(\d+(?:[.,]\d+)?|an|half an?)\s*(?:(?:-|–|to)\s*(\d+(?:[.,]\d+)?)\s*)?(hours?|hrs?|h|minutes?|mins?)\b/gi;

/** The longest time a step mentions, in minutes: "simmer for 20–25 minutes" gives 25. */
export function stepMinutes(text: string): number | null {
	let best: number | null = null;
	for (const m of text.matchAll(DURATION)) {
		const n = (s: string) => (/^half/i.test(s) ? 0.5 : /^(an?|one)$/i.test(s) ? 1 : +s.replace(',', '.'));
		const value = n(m[2] ?? m[1]) * (/^h/i.test(m[3]) ? 60 : 1);
		if (value > 0 && (best == null || value > best)) best = value;
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

	const pending = new Set(ingredients.map((i) => i.id));
	const steps: Step[] = raw.steps
		.map(plainText)
		.filter(Boolean)
		.map((text, n) => {
			const said = ` ${words(text.replace(/[()]/g, ' ')).join(' ')} `;
			// An ingredient goes in at the first step that names it; each step follows the one before.
			const uses = [...pending].filter((id) => lookFor.get(id)!.some((p) => said.includes(` ${p} `)));
			uses.forEach((id) => pending.delete(id));
			return {
				id: `s${n + 1}`,
				text,
				uses: n > 0 ? [`s${n}`, ...uses] : uses,
				technique: [],
				durationMin: stepMinutes(text),
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
		title: plainText(raw.title),
		language: raw.language,
		source: raw.source,
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
