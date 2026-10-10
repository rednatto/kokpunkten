import { z } from 'zod';

/** Import format version. Bump when a change would break existing JSON. */
export const FORMAT = 'kokpunkten.recipe/v0';

const slug = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'use lowercase words joined by hyphens, e.g. "yellow-onion"');

export const UNITS = [
	'g',
	'kg',
	'ml',
	'cl',
	'dl',
	'l',
	'tsp',
	'tbsp',
	'krm',
	'cup',
	'oz',
	'lb',
	'fl-oz',
	'piece',
	'clove',
	'pinch',
	'bunch',
	'can',
	'to-taste'
] as const;
export type Unit = (typeof UNITS)[number];

/** Common spellings an AI or a website might use, mapped to our units. */
const UNIT_ALIASES: Record<string, Unit> = {
	gram: 'g',
	grams: 'g',
	kilogram: 'kg',
	millilitre: 'ml',
	milliliter: 'ml',
	liter: 'l',
	litre: 'l',
	teaspoon: 'tsp',
	teaspoons: 'tsp',
	tsk: 'tsp',
	tablespoon: 'tbsp',
	tablespoons: 'tbsp',
	msk: 'tbsp',
	cups: 'cup',
	ounce: 'oz',
	ounces: 'oz',
	pound: 'lb',
	pounds: 'lb',
	lbs: 'lb',
	'fl oz': 'fl-oz',
	st: 'piece',
	pcs: 'piece',
	pieces: 'piece',
	cloves: 'clove',
	klyfta: 'clove',
	klyftor: 'clove',
	nypa: 'pinch',
	'to taste': 'to-taste',
	'efter smak': 'to-taste'
};

const unit = z.preprocess(
	(v) => {
		if (typeof v !== 'string') return v;
		const s = v.trim().toLowerCase();
		return UNIT_ALIASES[s] ?? s;
	},
	z.enum(UNITS)
);

/** Treat empty strings from sloppy JSON as missing. */
const optText = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
	z.string().trim().nullish()
);

const id = z.string().trim().min(1);

export const ingredientSchema = z.object({
	id,
	key: slug,
	name: z.string().trim().min(1),
	role: slug.nullish(),
	qty: z.number().positive().nullish(),
	qtyMax: z.number().positive().nullish(),
	unit: unit.nullish(),
	prep: optText,
	optional: z.boolean().default(false),
	group: optText,
	substitutes: z.array(z.string().trim().min(1)).default([]),
	original: optText
});

export const stepSchema = z.object({
	id,
	text: z.string().trim().min(1),
	uses: z.array(id).default([]),
	technique: z.array(z.string().trim().min(1)).default([]),
	durationMin: z.number().positive().nullish(),
	heat: z.enum(['low', 'medium-low', 'medium', 'medium-high', 'high']).nullish(),
	tempC: z.number().nullish(),
	critical: optText
});

export const sourceSchema = z.object({
	type: z.enum(['web', 'book', 'personal', 'ai-generated']),
	url: z.url().nullish(),
	name: optText,
	author: optText,
	book: z
		.object({
			title: z.string().trim().min(1),
			author: optText,
			isbn: optText,
			page: z.union([z.number(), z.string()]).nullish()
		})
		.nullish(),
	retrievedAt: optText,
	/** License of the source text, e.g. "Unlicense" or "CC BY-SA 4.0", for imported open datasets. */
	license: optText
});

export const recipeSchema = z
	.object({
		format: z.literal(FORMAT).default(FORMAT),
		dish: slug,
		title: z.string().trim().min(1),
		language: z.string().trim().min(2).default('sv'),
		source: sourceSchema,
		servings: z.number().positive(),
		time: z
			.object({
				prepMin: z.number().nonnegative().nullish(),
				cookMin: z.number().nonnegative().nullish(),
				totalMin: z.number().nonnegative().nullish()
			})
			.default({}),
		cuisine: z.array(slug).default([]),
		course: z.array(slug).default([]),
		tags: z.array(z.string().trim().min(1)).default([]),
		equipment: z.array(z.string().trim().min(1)).default([]),
		ingredients: z.array(ingredientSchema).min(1),
		steps: z.array(stepSchema).min(1),
		notes: z
			.object({
				techniques: optText,
				chemistry: optText,
				spiceProfile: optText,
				variations: optText
			})
			.default({})
	})
	.superRefine((r, ctx) => {
		// Ids must be unique, and `uses` may only point at ingredients or *earlier* steps,
		// so the steps always form a graph we can draw without cycles.
		const known = new Set<string>();
		r.ingredients.forEach((ing, i) => {
			if (known.has(ing.id))
				ctx.addIssue({ code: 'custom', path: ['ingredients', i, 'id'], message: `duplicate id "${ing.id}"` });
			known.add(ing.id);
			if (ing.qty != null && ing.qtyMax != null && ing.qtyMax < ing.qty)
				ctx.addIssue({ code: 'custom', path: ['ingredients', i, 'qtyMax'], message: 'qtyMax is smaller than qty' });
		});
		r.steps.forEach((step, i) => {
			if (known.has(step.id))
				ctx.addIssue({ code: 'custom', path: ['steps', i, 'id'], message: `duplicate id "${step.id}"` });
			step.uses.forEach((ref, j) => {
				if (!known.has(ref))
					ctx.addIssue({
						code: 'custom',
						path: ['steps', i, 'uses', j],
						message: `"${ref}" is not an ingredient or an earlier step`
					});
			});
			known.add(step.id);
		});
	});

export type Ingredient = z.infer<typeof ingredientSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Recipe = z.infer<typeof recipeSchema>;

export type ParseResult =
	| { ok: true; recipes: Recipe[] }
	| { ok: false; errors: string[] };

/**
 * Parse text pasted from an AI assistant: one recipe object or an array of them.
 * Tolerates markdown code fences and prose around the JSON, since assistants add them anyway.
 */
export function parseRecipes(text: string): ParseResult {
	const json = extractJson(text);
	if (json === undefined) return { ok: false, errors: ['Could not find any JSON in the pasted text.'] };

	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch (e) {
		return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
	}

	const items = Array.isArray(data) ? data : [data];
	if (items.length === 0) return { ok: false, errors: ['The pasted list is empty.'] };

	const recipes: Recipe[] = [];
	const errors: string[] = [];
	items.forEach((item, n) => {
		const res = recipeSchema.safeParse(item);
		const label = items.length > 1 ? `Recipe ${n + 1}: ` : '';
		if (res.success) recipes.push(res.data);
		else
			for (const issue of res.error.issues)
				errors.push(`${label}${issue.path.join('.') || '(root)'}: ${issue.message}`);
	});
	return errors.length ? { ok: false, errors } : { ok: true, recipes };
}

function extractJson(text: string): string | undefined {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = (fenced ? fenced[1] : text).trim();
	const start = body.search(/[[{]/);
	if (start < 0) return undefined;
	const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
	return end > start ? body.slice(start, end + 1) : undefined;
}
