/**
 * Cooking progress (ticked ingredients, done steps, chosen servings) lives here,
 * outside the recipe page, so it survives a trip to Compare or another recipe.
 * It's kept per tab: a fresh tab starts a fresh cook.
 */

export interface Progress {
	/** null = the recipe's own servings. */
	servings: number | null;
	have: string[];
	done: string[];
}

const KEY = 'kokpunkten.cooking';

/** Progress per recipe id. */
const cooking = $state<Record<string, Progress>>(load());

const empty: Progress = { servings: null, have: [], done: [] };

export const progress = (recipeId: string): Progress => cooking[recipeId] ?? empty;

export function setServings(recipeId: string, servings: number | null) {
	update(recipeId, { servings });
}

export function toggleHave(recipeId: string, ingredientId: string) {
	update(recipeId, { have: toggle(progress(recipeId).have, ingredientId) });
}

export function toggleDone(recipeId: string, stepId: string) {
	update(recipeId, { done: toggle(progress(recipeId).done, stepId) });
}

function toggle(list: string[], key: string) {
	return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

function update(recipeId: string, changes: Partial<Progress>) {
	const next = { ...progress(recipeId), ...changes };
	if (next.servings === null && !next.have.length && !next.done.length) delete cooking[recipeId];
	else cooking[recipeId] = next;
	save();
}

function load(): Record<string, Progress> {
	try {
		const saved = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
		return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
	} catch {
		return {};
	}
}

function save() {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(cooking));
	} catch {
		// Private mode or storage full: progress still survives navigation, just not a reload.
	}
}
