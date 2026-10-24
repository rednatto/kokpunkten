<script lang="ts">
	import { formatMinutes, stepInputLabel } from '#lib/display.ts';
	import { layers, schedule, stepGraph, stepLabel, tree } from '#lib/recipe/graph.ts';
	import type { Ingredient, Recipe } from '#lib/recipe/schema.ts';
	import { stepInputs } from '#lib/recipe/step-amounts.ts';
	import { settings } from '#lib/settings.svelte.ts';

	let { recipe, factor = 1, done, ontoggle }: { recipe: Recipe; factor?: number; done: Set<string>; ontoggle: (stepId: string) => void } = $props();

	const graph = $derived(stepGraph(recipe));
	const rows = $derived(layers(graph));
	const plan = $derived(schedule(graph));
	const table = $derived(tree(graph));
	const sequential = $derived(plan.steps.reduce((sum, s) => sum + (s.end - s.start), 0));
	const label = (step: Recipe['steps'][number], max?: number) => (settings.diagramFull ? step.text : stepLabel(step, max));
	const inputs = $derived(stepInputs(recipe));
	/** An ingredient going into a step, with how much of it when amounts are shown. */
	const input = (stepId: string, ing: Ingredient) => (settings.stepAmounts ? stepInputLabel(ing, inputs.get(stepId)?.get(ing.id), factor) : { amount: '', name: ing.name });

	// --- Flow: cards in rows by depth, joined by curves measured from the rendered cards.
	let box = $state<HTMLDivElement>();
	let edges = $state<{ d: string; from: string; to: string }[]>([]);
	let size = $state({ w: 0, h: 0 });
	function measure() {
		if (!box) return;
		const origin = box.getBoundingClientRect();
		const at = (id: string) => box!.querySelector(`[data-step="${id}"]`)!.getBoundingClientRect();
		size = { w: origin.width, h: origin.height };
		edges = graph.flatMap((g) =>
			g.after.map((a) => {
				const p = at(a);
				const c = at(g.step.id);
				const x1 = p.left + p.width / 2 - origin.left;
				const y1 = p.bottom - origin.top;
				const x2 = c.left + c.width / 2 - origin.left;
				const y2 = c.top - origin.top;
				const from = graph.find((p) => p.step.id === a)!;
				if (g.depth - from.depth > 1) {
					// Skips a row: run down the nearer side so the line doesn't hide behind cards in between.
					const side = x1 > origin.width / 2 ? origin.width - 6 : 6;
					return { d: `M${x1},${y1} C${x1},${y1 + 14} ${side},${y1 + 4} ${side},${y1 + 24} L${side},${y2 - 24} C${side},${y2 - 4} ${x2},${y2 - 14} ${x2},${y2 - 4}`, from: a, to: g.step.id };
				}
				const bend = Math.max(16, (y2 - y1) / 2);
				return { d: `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2 - 4}`, from: a, to: g.step.id };
			})
		);
	}
	$effect(() => {
		void graph;
		void settings.diagramFull;
		void settings.stepAmounts;
		void factor;
		if (settings.diagramView !== 'flow' || !box) return;
		const ro = new ResizeObserver(measure);
		ro.observe(box);
		measure();
		return () => ro.disconnect();
	});

	// --- Tree: the grid is at least as wide as its narrowest columns, so its background
	// (the lines between cells) stretches as far as the cells when the table scrolls sideways.
	const stepCol = $derived(settings.diagramFull ? 9 : 4.75);

	// --- Timeline: a tick every 5, 10, 15, 30 or 60 minutes, whichever gives about five.
	const tick = $derived([5, 10, 15, 30, 60, 120].find((t) => plan.total / t <= 6) ?? 240);
	const ticks = $derived(Array.from({ length: Math.floor(plan.total / tick) + 1 }, (_, n) => n * tick));
	const pct = (min: number) => `${(min / (plan.total || 1)) * 100}%`;
</script>

{#snippet adds(stepId: string, ings: Ingredient[])}
	<span class="adds">+ {#each ings as ing, n (ing.id)}{@const u = input(stepId, ing)}{#if n}{' · '}{/if}{#if u.amount}<strong>{u.amount}</strong>{' '}{/if}{u.name}{/each}</span>
{/snippet}

<div class="tabs" role="tablist" aria-label="Diagram design">
	{#each [['flow', 'Flow'], ['timeline', 'Timeline'], ['tree', 'Tree']] as const as [value, name]}
		<button role="tab" aria-selected={settings.diagramView === value} class:active={settings.diagramView === value} onclick={() => (settings.diagramView = value)}>{name}</button>
	{/each}
</div>

{#if settings.diagramView === 'flow'}
	<p class="muted how">Each row can be done at the same time. Lines show what goes into what.</p>
	<div class="flow" bind:this={box}>
		<svg width={size.w} height={size.h} aria-hidden="true">
			<defs>
				<marker id="arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M0,0 L8,4 L0,8 z" fill="var(--muted)" />
				</marker>
			</defs>
			{#each edges as e (e.from + e.to)}
				<path d={e.d} class:faded={done.has(e.to)} marker-end="url(#arrow)" />
			{/each}
		</svg>
		{#each rows as row, depth (depth)}
			<div class="layer">
				{#each row as g (g.step.id)}
					<button class="node" class:done={done.has(g.step.id)} data-step={g.step.id} onclick={() => ontoggle(g.step.id)} aria-pressed={done.has(g.step.id)}>
						<span class="no">{done.has(g.step.id) ? '✓' : g.no}</span>
						<span class="label">{label(g.step)}</span>
						{#if g.adds.length}{@render adds(g.step.id, g.adds)}{/if}
						{#if g.step.durationMin || g.step.heat}
							<span class="meta">{[g.step.durationMin && formatMinutes(g.step.durationMin, g.step.durationMaxMin), g.step.heat && `${g.step.heat} heat`].filter(Boolean).join(' · ')}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/each}
	</div>
{:else if settings.diagramView === 'timeline'}
	<p class="muted how">
		About <strong>{plan.total} min</strong> when side tasks run in parallel{#if sequential > plan.total}, against {sequential} min one after another{/if}.
		The dark bars decide the total; dashed ones have no time given.
	</p>
	<div class="gantt">
		<div class="axis">
			{#each ticks as t (t)}<span style:left={pct(t)}>{t}</span>{/each}
		</div>
		{#each plan.steps as s (s.step.id)}
			<button class="bar-row" class:done={done.has(s.step.id)} onclick={() => ontoggle(s.step.id)} aria-pressed={done.has(s.step.id)}>
				<span class="bar-label"><strong class="mark">{done.has(s.step.id) ? '✓' : s.no}</strong> {label(s.step, 48)}</span>
				{#if settings.stepAmounts && s.adds.length}{@render adds(s.step.id, s.adds)}{/if}
				<span class="track">
					{#each ticks as t (t)}<span class="grid" style:left={pct(t)}></span>{/each}
					<span class="bar" class:critical={s.critical} class:guessed={s.guessed} style:left={pct(s.start)} style:width={pct(s.end - s.start)}></span>
					<span class="when" style:left={pct(s.end)}>{s.guessed ? '' : `${s.end - s.start}′`}</span>
				</span>
			</button>
		{/each}
	</div>
{:else}
	<p class="muted how">Read left to right: each step combines the rows it spans, until the last step brings everything together.</p>
	<div class="tree-wrap">
		<div
			class="tree"
			style:grid-template-columns="minmax(6rem, 1.2fr) repeat({table.cols - 1}, minmax({stepCol}rem, 1fr))"
			style:min-width="calc({6 + (table.cols - 1) * stepCol}rem + {2 * table.cols + 2}px)" style:grid-template-rows="repeat({table.rows}, auto)">
			{#each table.cells as c, n (n)}
				{#if c.kind === 'ingredient'}
					{@const u = input(c.into!, c.ingredient!)}
					<div class="cell ing" style:grid-row="{c.row + 1} / span 1" style:grid-column="1 / span {c.colSpan}">
						{#if u.amount}<strong class="amount">{u.amount}</strong>{' '}{/if}{u.name}
					</div>
				{:else if c.kind === 'blank'}
					<div class="cell" style:grid-row="{c.row + 1} / span 1" style:grid-column="1 / span {c.colSpan}"></div>
				{:else}
					{@const g = c.step!}
					<button
						class="cell step"
						class:done={done.has(g.step.id)}
						style:grid-row="{c.row + 1} / span {c.rowSpan}"
						style:grid-column="{c.col + 1} / span {c.colSpan}"
						onclick={() => ontoggle(g.step.id)}
						aria-pressed={done.has(g.step.id)}
					>
						<strong class="mark">{done.has(g.step.id) ? '✓' : g.no}</strong>
						{label(g.step, 36)}
						{#if g.step.durationMin}<span class="meta">{formatMinutes(g.step.durationMin, g.step.durationMaxMin)}</span>{/if}
					</button>
				{/if}
			{/each}
		</div>
	</div>
{/if}

<style>
	.tabs {
		display: flex;
		margin: 0.5rem 0;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		overflow: hidden;
	}
	.tabs button {
		flex: 1;
		justify-content: center;
		font-weight: 500;
		border: none;
		border-radius: 0;
		background: transparent;
		color: var(--fg);
	}
	.tabs button.active {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.how {
		font-size: 0.85rem;
		margin: 0 0 0.75rem;
	}
	button {
		font: inherit;
		font-weight: 400;
		text-align: left;
		justify-content: stretch;
		color: var(--fg);
		min-height: 0;
	}
	/* Done steps stay readable: muted text and a green tick, not a faded block. */
	.done,
	.done .meta,
	.done .adds {
		color: var(--muted);
	}
	.done .mark {
		color: var(--accent);
	}

	/* Flow */
	.flow {
		position: relative;
		display: grid;
		gap: 1.75rem;
	}
	.flow svg {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: visible;
	}
	.flow path {
		fill: none;
		stroke: var(--muted);
		stroke-width: 1.5;
	}
	.flow path.faded {
		opacity: 0.3;
	}
	.layer {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}
	.node {
		position: relative;
		flex: 1 1 0;
		max-width: 15rem;
		align-content: start;
		display: grid;
		gap: 0.2rem;
		padding: 0.5rem 0.6rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		font-size: 0.85rem;
	}
	.no {
		position: absolute;
		top: -0.7rem;
		left: 0.5rem;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-fg);
		font-size: 0.75rem;
		font-weight: 700;
		display: grid;
		place-items: center;
	}
	.node.done {
		border-style: dashed;
		background: transparent;
	}
	.node.done .no {
		background: var(--bg);
		color: var(--accent);
		border: 1.5px solid var(--accent);
	}
	.label {
		font-weight: 600;
		margin-top: 0.2rem;
	}
	.adds {
		color: var(--accent);
		font-size: 0.8rem;
	}
	.meta {
		color: var(--muted);
		font-size: 0.75rem;
	}
	.adds strong,
	.amount {
		font-weight: 600;
		white-space: nowrap;
	}

	/* Timeline */
	.gantt {
		display: grid;
		gap: 0.35rem;
	}
	.axis {
		position: relative;
		height: 1rem;
		font-size: 0.7rem;
		color: var(--muted);
		margin-right: 1.5rem;
	}
	.axis span {
		position: absolute;
		transform: translateX(-50%);
	}
	.axis span:first-child {
		transform: none;
	}
	.bar-row {
		display: grid;
		gap: 0.15rem;
		padding: 0;
		border: none;
		background: none;
	}
	.bar-label {
		font-size: 0.8rem;
	}
	.bar-row .adds {
		font-size: 0.75rem;
	}
	.track {
		position: relative;
		height: 0.9rem;
		margin-right: 1.5rem;
	}
	.grid {
		position: absolute;
		top: 0;
		bottom: 0;
		border-left: 1px dotted var(--line);
	}
	.bar {
		position: absolute;
		top: 0;
		bottom: 0;
		min-width: 4px;
		border-radius: 0.3rem;
		background: color-mix(in srgb, var(--accent) 35%, var(--surface));
	}
	.bar.critical {
		background: var(--accent);
	}
	.bar.guessed {
		background: transparent;
		border: 1.5px dashed var(--accent);
	}
	.done .bar {
		opacity: 0.55;
	}
	.when {
		position: absolute;
		top: -0.1rem;
		padding-left: 0.25rem;
		font-size: 0.7rem;
		color: var(--muted);
	}

	/* Tree */
	.tree-wrap {
		overflow-x: auto;
		margin: 0 -1rem;
		padding: 0 1rem;
	}
	.tree {
		display: grid;
		gap: 2px;
		font-size: 0.75rem;
		background: var(--line);
		border: 2px solid var(--line);
		border-radius: 0.4rem;
	}
	.cell {
		padding: 0.35rem 0.45rem;
		background: var(--surface);
	}
	.cell.step {
		border: none;
		border-radius: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.15rem;
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
	}
	.cell.step.done {
		background: var(--surface);
	}
</style>
