import type { Ingredient, Recipe, Step } from './schema.ts';

/** Minutes assumed for a step that gives no duration, so the timeline still has something to draw. */
export const UNTIMED_MIN = 3;

/** A short label for a step: its first clause, trimmed to fit a diagram box. */
export function stepLabel(step: Step, max = 42): string {
	const first = step.text.split(/(?<=[.;:!?])\s|,\s(?:then|and)\s/)[0].replace(/[.;:!?]$/, '');
	return first.length <= max ? first : `${first.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[,;:]$/, '')}…`;
}

export interface GraphStep {
	step: Step;
	no: number;
	/** Earlier steps this one builds on. */
	after: string[];
	/** Ingredients that go in at this step. */
	adds: Ingredient[];
	/** Steps that build on this one. */
	before: string[];
	/** Longest chain of steps leading here, counting this one (1 = needs no earlier step). */
	depth: number;
}

/** Steps with their links in both directions. Ingredients no step mentions go in at the first step. */
export function stepGraph(recipe: Recipe): GraphStep[] {
	const ingById = new Map(recipe.ingredients.map((i) => [i.id, i]));
	const used = new Set(recipe.steps.flatMap((s) => s.uses));
	const unused = recipe.ingredients.filter((i) => !used.has(i.id));
	const nodes = recipe.steps.map((step, n): GraphStep => ({
		step,
		no: n + 1,
		after: step.uses.filter((u) => !ingById.has(u)),
		adds: [...step.uses.flatMap((u) => ingById.get(u) ?? []), ...(n === 0 ? unused : [])],
		before: [],
		depth: 1
	}));
	const byId = new Map(nodes.map((g) => [g.step.id, g]));
	for (const g of nodes) {
		for (const a of g.after) byId.get(a)!.before.push(g.step.id);
		g.depth = 1 + Math.max(0, ...g.after.map((a) => byId.get(a)!.depth));
	}
	return nodes;
}

/** Steps grouped by depth: everything in one row can happen at the same time. */
export function layers(graph: GraphStep[]): GraphStep[][] {
	const out: GraphStep[][] = [];
	for (const g of graph) (out[g.depth - 1] ??= []).push(g);
	return out;
}

export interface Scheduled extends GraphStep {
	start: number;
	end: number;
	/** True when the step had no duration and got UNTIMED_MIN. */
	guessed: boolean;
	lane: number;
	critical: boolean;
}

/**
 * Earliest-start schedule: each step starts when everything it builds on is done.
 * A step continues the lane of the step it follows when it can, so a chain reads as
 * one row; parallel work gets lanes of its own. The critical path is the chain that
 * decides the total time.
 */
export function schedule(graph: GraphStep[]): { steps: Scheduled[]; total: number; lanes: number } {
	const byId = new Map<string, Scheduled>();
	const laneEnd: number[] = [];
	const steps = graph.map((g) => {
		const minutes = g.step.durationMin ?? UNTIMED_MIN;
		const start = Math.max(0, ...g.after.map((a) => byId.get(a)!.end));
		const parentLanes = g.after.map((a) => byId.get(a)!).toSorted((a, b) => b.end - a.end).map((p) => p.lane);
		let lane = parentLanes.find((l) => laneEnd[l] <= start) ?? laneEnd.findIndex((end) => end <= start);
		if (lane < 0) lane = laneEnd.length;
		laneEnd[lane] = start + minutes;
		const s: Scheduled = { ...g, start, end: start + minutes, guessed: g.step.durationMin == null, lane, critical: false };
		byId.set(g.step.id, s);
		return s;
	});
	const total = Math.max(0, ...steps.map((s) => s.end));
	let at = steps.findLast((s) => s.end === total);
	while (at) {
		at.critical = true;
		const prev = at.after.map((a) => byId.get(a)!).filter((p) => p.end === at!.start);
		at = prev[0];
	}
	return { steps, total, lanes: laneEnd.length };
}

export interface TreeCell {
	/** A blank fills the ingredient columns beside a step that adds nothing, so the grid has no holes. */
	kind: 'ingredient' | 'step' | 'blank';
	ingredient?: Ingredient;
	/** The step an ingredient cell goes into, by id. */
	into?: string;
	step?: GraphStep;
	row: number;
	rowSpan: number;
	col: number;
	colSpan: number;
}

/**
 * The "Cooking for Engineers" table: ingredients down the left, and each step a cell to
 * their right spanning exactly the rows that feed into it, so the final step spans them all.
 * Steps are placed by how many steps lead to them; a cell stretches right until the step
 * that consumes it. A step used by several later steps is drawn under the first of them.
 */
export function tree(graph: GraphStep[]): { cells: TreeCell[]; rows: number; cols: number } {
	const byId = new Map(graph.map((g) => [g.step.id, g]));
	const owner = new Map<string, string>();
	for (const g of graph) for (const a of g.after) if (!owner.has(a)) owner.set(a, g.step.id);
	const children = (g: GraphStep) => g.after.filter((a) => owner.get(a) === g.step.id).map((a) => byId.get(a)!);
	const height = new Map<string, number>();
	const h = (g: GraphStep): number => {
		if (!height.has(g.step.id)) height.set(g.step.id, 1 + Math.max(0, ...children(g).map(h)));
		return height.get(g.step.id)!;
	};
	const roots = graph.filter((g) => !owner.has(g.step.id));
	const cols = 1 + Math.max(0, ...roots.map(h));
	const cells: TreeCell[] = [];
	let row = 0;
	const place = (g: GraphStep, endCol: number) => {
		const first = row;
		for (const c of children(g)) place(c, h(g));
		for (const ing of g.adds) cells.push({ kind: 'ingredient', ingredient: ing, into: g.step.id, row: row++, rowSpan: 1, col: 0, colSpan: h(g) });
		// A step with no inputs still needs a row, with a blank where its ingredients would be.
		if (row === first) cells.push({ kind: 'blank', row: row++, rowSpan: 1, col: 0, colSpan: h(g) });
		cells.push({ kind: 'step', step: g, row: first, rowSpan: row - first, col: h(g), colSpan: endCol - h(g) });
	};
	for (const r of roots) place(r, cols);
	return { cells, rows: row, cols };
}
