import { FORMAT, HEATS, UNITS } from './schema';
import { sampleRecipe } from './sample';

export interface PromptOptions {
	dish: string;
	versions: number;
	language: string;
	/** Optional: a URL or book reference instead of a web search. */
	source?: string;
}

/** The prompt a user copies into their own AI assistant. Its answer is pasted back into the app. */
export function buildPrompt({ dish, versions, language, source }: PromptOptions): string {
	const task = source?.trim()
		? `Read this recipe source: ${source.trim()} (or the attached photo of a cookbook page). Output 1 version.`
		: `Find ${versions} well-regarded, clearly different versions of the recipe "${dish.trim()}" online. Prefer sources with good ratings or a reputation for testing their recipes. Output one version per source.`;

	return `${task}

Output a JSON array of recipe objects in the format below, and nothing else: no prose, no markdown.

Rules:
- Copy facts (ingredients, amounts, times, temperatures) exactly from the source. Never invent missing amounts: use null.
- Use metric units if the source gives them; otherwise keep the source unit. Allowed units: ${UNITS.join(', ')}.
- "format" is always "${FORMAT}".
- "dish" is the same lowercase hyphenated English slug for every version of the same dish, e.g. "spaghetti-carbonara".
- Ingredient "key" is a lowercase hyphenated English canonical name ("yellow-onion", "heavy-cream"). "role" is the culinary slot it fills ("cured-pork", "hard-cheese", "acid", "fat", "aromatic", "pasta"), so versions using different ingredients for the same job can be compared.
- "original" is the ingredient line exactly as the source wrote it.
- Write "name", step "text" and "notes" in ${language}. Each step is one or two short imperative sentences. No personal stories and no filler.
- Step "uses" lists the ingredient ids and earlier step ids the step consumes. Every ingredient should be used by some step.
- When several steps use the same ingredient ("half the butter", "2 tbsp of the oil", "the rest of the cheese"), give each of those steps "amounts": the part of the ingredient it takes, as {"ingredient": id, "qty", "unit"}. Work the split out from the step text and the ingredient line; the step that takes "the rest" may leave its entry out. A step that is the only one using an ingredient needs no "amounts" entry.
- Put a step's time in "durationMin" when the source gives one. For a range ("1–2 hours") put the lower end in "durationMin" and the upper in "durationMaxMin".
- Step "heat" is the stove level, one of: ${HEATS.join(', ')}. An oven, oil or water temperature goes in "tempC" as a number in °C (200, not "200 °C"); convert °F to °C.
- "notes": explain the techniques and the chemistry involved (Maillard reaction, emulsions, gelatinisation…) and the spice profile, at most 3 sentences each. Leave a note out rather than guess.
- "source" must be the real URL or book reference. Never fabricate a source.

Fields (required ones must always be present; leave out or use null for optional ones you don't know):
- Recipe, required: "format", "dish", "title", "source", "servings" (a number, e.g. 4; if the source gives a range use the lower number; if it gives none, estimate from the amounts), "ingredients" (at least 1), "steps" (at least 1).
- Recipe, optional: "language", "time" {"prepMin", "cookMin", "totalMin"} as numbers of minutes, "cuisine", "course", "tags", "equipment" as arrays of strings, "notes" {"techniques", "chemistry", "spiceProfile", "variations"}.
- "source", required: "type" (one of: web, book, personal, ai-generated). Optional: "url", "name", "author", "book" {"title", "author", "isbn", "page"}.
- Ingredient, required: "id" (unique, e.g. "i1"), "key", "name". Optional: "role", "qty" and "qtyMax" (positive numbers: 1.5, not "1 1/2"; "qtyMax" only for ranges), "unit", "prep", "optional" (true/false), "group", "substitutes", "original".
- Step, required: "id" (unique, e.g. "s1"), "text". Optional: "uses", "amounts" (array of {"ingredient", "qty", "qtyMax", "unit"}; "unit" defaults to the ingredient's), "technique" (array of strings), "durationMin" and "durationMaxMin" (numbers), "heat", "tempC" (number), "critical" (what must not go wrong).
- All numbers are plain JSON numbers without units or quotes.

Example of one recipe object:
${JSON.stringify(sampleRecipe, null, 1)}`;
}
