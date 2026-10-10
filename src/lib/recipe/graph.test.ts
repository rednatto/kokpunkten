import { describe, expect, it } from 'vitest';
import { layers, schedule, stepGraph, stepLabel, tree } from './graph';
import { recipeSchema } from './schema';
import lasagnaJson from '../library/lasagna.json';

const lasagna = recipeSchema.parse(lasagnaJson[0]);
const graph = stepGraph(lasagna);

describe('step graph', () => {
	it('links steps both ways and finds depths', () => {
		expect(graph.map((g) => g.depth)).toEqual([1, 2, 3, 1, 4, 5]);
		expect(graph[3].before).toEqual(['s5']);
		expect(layers(graph).map((l) => l.map((g) => g.no))).toEqual([[1, 4], [2], [3], [5], [6]]);
	});

	it('shortens step text to its first clause', () => {
		expect(stepLabel(lasagna.steps[5])).toBe('Bake until bubbling and golden');
		expect(stepLabel(lasagna.steps[0]).length).toBeLessThanOrEqual(42);
	});
});

describe('schedule', () => {
	const { steps, total, lanes } = schedule(graph);

	it('starts each step when its inputs are done and runs side work in parallel', () => {
		expect(steps.map((s) => [s.start, s.end])).toEqual([[0, 12], [12, 27], [27, 147], [0, 10], [147, 150], [150, 185]]);
		expect(total).toBe(185);
		expect(lanes).toBe(2);
		expect(steps[3].lane).toBe(1);
	});

	it('marks the chain that decides the total time', () => {
		expect(steps.filter((s) => s.critical).map((s) => s.no)).toEqual([1, 2, 3, 5, 6]);
		expect(steps[4].guessed).toBe(true);
	});
});

describe('tree', () => {
	const t = tree(graph);

	it('puts every ingredient in its own row and the last step across all of them', () => {
		expect(t.rows).toBe(lasagna.ingredients.length);
		const last = t.cells.find((c) => c.step?.no === 6)!;
		expect([last.row, last.rowSpan, last.col + last.colSpan]).toEqual([0, t.rows, t.cols]);
	});

	it('spans each step over exactly the rows that feed it', () => {
		const bechamel = t.cells.find((c) => c.step?.no === 4)!;
		const rows = t.cells.filter((c) => c.kind === 'ingredient' && c.row >= bechamel.row && c.row < bechamel.row + bechamel.rowSpan);
		expect(rows.map((c) => c.ingredient!.id)).toEqual(['i11', 'i12', 'i13', 'i14', 'i15', 'i16']);
		expect(bechamel.col + bechamel.colSpan).toBe(t.cells.find((c) => c.step?.no === 5)!.col);
	});
});
