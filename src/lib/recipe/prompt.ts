import { FORMAT, UNITS } from './schema';
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
- Put a step's time in "durationMin" when the source gives one.
- "notes": explain the techniques and the chemistry involved (Maillard reaction, emulsions, gelatinisation…) and the spice profile, at most 3 sentences each. Leave a note out rather than guess.
- "source" must be the real URL or book reference. Never fabricate a source.

Example of one recipe object:
${JSON.stringify(sampleRecipe, null, 1)}`;
}
