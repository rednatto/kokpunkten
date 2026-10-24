import type { Recipe } from './recipe/schema.ts';

/**
 * The kitchen tools (swaps, weights, units, timers) open in one dialog from the header
 * on every page. A page that shows recipes says which, so swaps start with their ingredients.
 */

export type ToolsTab = 'swaps' | 'weights' | 'units' | 'timers';

export const tools = $state<{
	tab: ToolsTab;
	/** The recipes on the page behind the dialog, if any. */
	recipes: Pick<Recipe, 'ingredients' | 'course'>[];
	/** "this recipe's" or "this dish's", for the line above filtered swaps. */
	scope: string;
}>({ tab: 'swaps', recipes: [], scope: '' });

let dialog: HTMLDialogElement | undefined;

export function registerToolsDialog(d: HTMLDialogElement | undefined) {
	dialog = d;
}

export function openTools(tab?: ToolsTab) {
	if (tab) tools.tab = tab;
	if (!dialog?.open) dialog?.showModal();
}

export function closeTools() {
	dialog?.close();
}

/** Called from a page's $effect: the page's recipes, cleared again when the page goes away. */
export function showingRecipes(recipes: Pick<Recipe, 'ingredients' | 'course'>[], scope: string) {
	tools.recipes = recipes;
	tools.scope = scope;
	return () => {
		if (tools.recipes !== recipes) return;
		tools.recipes = [];
		tools.scope = '';
	};
}
