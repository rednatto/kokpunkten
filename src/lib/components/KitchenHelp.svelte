<script lang="ts">
	import { findSwaps, swapsFor, swapsUsing, type Swappable } from '#lib/kitchen/swaps.ts';
	import { KITCHEN_MEASURES, UNIT_RULES, WEIGHABLES, equivalents, type InputUnit, type Weighable } from '#lib/kitchen/weights.ts';
	import { parseTerm } from '#lib/recipe/ingredient-search.ts';
	import type { Recipe } from '#lib/recipe/schema.ts';
	import { formatQty } from '#lib/recipe/units.ts';

	let {
		tab,
		recipes = [],
		scope = "this recipe's"
	}: {
		tab: 'swaps' | 'weights';
		/** The recipes open behind the dialog: swaps start with what they use. */
		recipes?: Pick<Recipe, 'ingredients' | 'course'>[];
		scope?: string;
	} = $props();

	let query = $state('');
	// Several versions of a dish count as one recipe with all their ingredients, in order.
	const forRecipe = $derived(
		recipes.length ? swapsFor({ ingredients: recipes.flatMap((r) => r.ingredients), course: [...new Set(recipes.flatMap((r) => r.course))] }) : []
	);
	let showAll = $state(false);
	// Another page behind the dialog starts with its own swaps again.
	$effect.pre(() => {
		void recipes;
		showAll = false;
	});
	/** Over a recipe, its own swaps until the cook searches or asks for all of them. */
	const recipeOnly = $derived(!showAll && !query.trim() && forRecipe.length > 0);
	const swaps = $derived(recipeOnly ? forRecipe : findSwaps(query));
	/** What the typed ingredient can stand in for, when the cook has it rather than lacks it. */
	const standsIn = $derived(recipeOnly ? [] : swapsUsing(query));

	const matchesQuery = (w: Weighable) => {
		const q = parseTerm(query);
		const name = parseTerm(w.name);
		return q.every((t) => name.some((n) => n.startsWith(t)));
	};
	const weighables = $derived(WEIGHABLES.filter(matchesQuery));
	const byVolume = $derived(weighables.filter((w) => w.gPerMl));
	const byPiece = $derived(weighables.filter((w) => w.each));

	let qty = $state(100);
	let unit = $state<InputUnit>('g');
	let picked = $state('all-purpose-flour');
	/** Typing in the search box picks the first ingredient that matches for the converter. */
	$effect(() => {
		if (!query.trim() || !weighables.length || weighables.some((w) => w.key === picked)) return;
		const first = parseTerm(query)[0];
		picked = (weighables.find((w) => parseTerm(w.name)[0]?.startsWith(first)) ?? weighables[0]).key;
	});
	const item = $derived(WEIGHABLES.find((w) => w.key === picked)!);
	const units = $derived<InputUnit[]>([
		'g',
		...(item.gPerMl ? (['dl', 'ml', 'cup', 'tbsp', 'tsp'] as const) : []),
		...(item.each ? (['each'] as const) : []),
		'oz',
		'lb'
	]);
	$effect(() => {
		if (!units.includes(unit)) unit = 'g';
	});
	const out = $derived(qty > 0 ? equivalents(item, qty, unit) : []);
	const unitLabel = (u: InputUnit) => (u === 'each' ? (item.eachUnit === 'piece' ? 'pieces' : `${item.eachUnit === 'bunch' ? 'bunches' : `${item.eachUnit}s`}`) : u);
</script>

<input type="search" bind:value={query} placeholder={tab === 'swaps' ? 'Out of it, or have it? e.g. buttermilk, yogurt' : 'Ingredient, e.g. flour, potato'} aria-label="Ingredient" autocapitalize="off" />

{#if tab === 'swaps'}
	{#if recipeOnly}
		<p class="muted small scope">
			For {scope} ingredients · <button class="link" onclick={() => (showAll = true)}>Show all swaps</button>
		</p>
	{:else if showAll && !query.trim() && forRecipe.length}
		<p class="muted small scope">
			All swaps · <button class="link" onclick={() => (showAll = false)}>Only {scope} ingredients</button>
		</p>
	{/if}
	{#snippet card(s: Swappable)}
		<li class="card">
			<div class="head">
				<strong>{s.name}</strong>
				{#if s.per}<span class="muted small">for {s.per}</span>{/if}
			</div>
			<ul class="swaps">
				{#each s.swaps as w}
					<li>
						<span class="use">{w.use}</span>
						{#if w.note}<span class="muted small note">{w.note}</span>{/if}
					</li>
				{/each}
			</ul>
		</li>
	{/snippet}
	{#if swaps.length || !standsIn.length}
		<ul class="list">
			{#each swaps as s (s.name)}
				{@render card(s)}
			{:else}
				<li class="muted">No common swap for that. Try a shorter word.</li>
			{/each}
		</ul>
	{/if}
	{#if standsIn.length}
		<h3 class="stands-in">{query.trim()} can stand in for</h3>
		<ul class="list">
			{#each standsIn as s (s.name)}
				{@render card(s)}
			{/each}
		</ul>
	{/if}
{:else}
	<div class="card convert">
		<div class="row">
			<input type="number" inputmode="decimal" min="0" step="any" bind:value={qty} aria-label="Amount" class="qty" />
			<select bind:value={unit} aria-label="Unit" class="unit">
				{#each units as u}<option value={u}>{unitLabel(u)}</option>{/each}
			</select>
			<select bind:value={picked} aria-label="Ingredient to convert" class="what">
				{#each WEIGHABLES as w (w.key)}<option value={w.key}>{w.name}</option>{/each}
			</select>
		</div>
		{#if out.length}
			<p class="result">
				≈ {#each out as e, i}{i ? ' · ' : ''}<strong>{e.value}</strong> {e.unit}{/each}
			</p>
		{/if}
	</div>

	{#if byVolume.length}
		<h3>1 dl weighs</h3>
		<table>
			<tbody>
				{#each byVolume as w (w.key)}
					<tr>
						<td>{w.name}</td>
						<td class="num">{formatQty(w.gPerMl! * 100, 'g')} g</td>
						<td class="num muted">100 g ≈ {formatQty(1 / w.gPerMl!, 'dl')} dl</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if byPiece.length}
		<h3>One piece weighs</h3>
		<table>
			<tbody>
				{#each byPiece as w (w.key)}
					<tr>
						<td>1 {w.eachUnit === 'piece' ? '' : `${w.eachUnit} `}{w.eachUnit === 'can' ? w.name.replace(/^canned /, '') : w.name}</td>
						<td class="num">≈ {w.each! >= 1 ? formatQty(w.each!, 'g') : w.each} g</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if !query.trim()}
		<h3>Kitchen measures</h3>
		<table>
			<tbody>
				{#each KITCHEN_MEASURES as r}<tr><td>{r.what}</td><td class="num">{r.is}</td></tr>{/each}
			</tbody>
		</table>
		<h3>Units</h3>
		<table>
			<tbody>
				{#each UNIT_RULES as r}<tr><td>{r.what}</td><td class="num">{r.is}</td></tr>{/each}
			</tbody>
		</table>
	{:else if !weighables.length}
		<p class="muted">No weight for that yet.</p>
	{/if}
{/if}

<style>
	.scope {
		margin: 0.25rem 0 0.5rem;
	}
	.link {
		all: unset;
		cursor: pointer;
		color: var(--accent);
		text-decoration: underline;
	}
	.list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.6rem;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}
	.swaps {
		margin: 0.4rem 0 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.35rem;
	}
	.note {
		display: block;
	}
	.convert {
		margin-top: 0.75rem;
	}
	.qty {
		width: 5.5rem;
	}
	.unit {
		width: auto;
	}
	.what {
		flex: 1;
		width: auto;
		min-width: 9rem;
	}
	.result {
		margin: 0.6rem 0 0;
		font-size: 1.05rem;
	}
	h3 {
		font-size: 1rem;
	}
	.stands-in::first-letter {
		text-transform: uppercase;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.95rem;
	}
	td {
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	td:first-child::first-letter {
		text-transform: uppercase;
	}
	.num {
		text-align: right;
		padding-left: 0.75rem;
		white-space: nowrap;
	}
</style>
