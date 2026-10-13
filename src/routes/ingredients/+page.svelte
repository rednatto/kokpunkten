<script lang="ts">
	import { resolve } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { liveQuery } from 'dexie';
	import { db, type StoredRecipe } from '#lib/db.ts';
	import { DISH_NAMES } from '#lib/dish-names.ts';
	import { searchByIngredients, type IngredientHit } from '#lib/recipe/ingredient-search.ts';

	const recipes = liveQuery(() => db.recipes.toArray());

	/** The searched ingredients live in the URL (?i=falukorv,potato), so a search can be bookmarked or shared. */
	let terms = $state<string[]>(
		(page.url.searchParams.get('i') ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean)
	);
	let draft = $state('');

	function syncUrl() {
		const url = new URL(page.url.href);
		if (terms.length) url.searchParams.set('i', terms.join(','));
		else url.searchParams.delete('i');
		replaceState(url, {});
	}

	function add() {
		const fresh = draft
			.split(',')
			.map((t) => t.trim())
			.filter((t) => t && !terms.some((s) => s.toLowerCase() === t.toLowerCase()));
		draft = '';
		if (!fresh.length) return;
		terms = [...terms, ...fresh];
		syncUrl();
	}

	function remove(t: string) {
		terms = terms.filter((s) => s !== t);
		syncUrl();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			add();
		} else if (e.key === 'Backspace' && !draft && terms.length) {
			remove(terms[terms.length - 1]);
		}
	}

	/** Every ingredient name in the library, offered while typing. */
	const suggestions = $derived(
		[...new Set(($recipes ?? []).flatMap((r) => r.recipe.ingredients.map((i) => i.key.replaceAll('-', ' '))))].sort()
	);

	interface DishHit {
		slug: string;
		name: string;
		best: IngredientHit<StoredRecipe>;
		/** Other versions of the dish that match the same ingredients as the best one. */
		others: StoredRecipe[];
	}

	/** Favorites first, then higher ratings; unrated sits between 3 and 4. */
	const preference = (r: StoredRecipe) => (r.favorite ? -10 : 0) - (r.rating ?? 3.5);

	const hits = $derived.by((): DishHit[] => {
		if (!$recipes) return [];
		const byDish = new Map<string, DishHit>();
		for (const hit of searchByIngredients($recipes, terms, (r) => r.recipe, preference)) {
			const slug = hit.item.recipe.dish;
			const seen = byDish.get(slug);
			if (!seen) byDish.set(slug, { slug, name: DISH_NAMES[slug] ?? hit.item.recipe.title, best: hit, others: [] });
			else if (hit.matches.every((m, i) => !m === !seen.best.matches[i])) seen.others.push(hit.item);
		}
		return [...byDish.values()];
	});
	const all = $derived(hits.filter((h) => h.best.matched === terms.length));
	const some = $derived(hits.filter((h) => h.best.matched < terms.length));
	let showAllPartial = $state(false);
	const PARTIAL = 8;

	const variant = (r: StoredRecipe) => r.recipe.source.name?.replace(/^Kokpunkten – /, '') ?? r.recipe.title;
	const missing = (h: DishHit) => terms.filter((_, i) => !h.best.matches[i]);
</script>

<h1>Cook with what you have</h1>
<p class="muted small">Add ingredients to find recipes that use them. Swedish names like potatis or lök work too.</p>

<div class="input card">
	{#each terms as t (t)}
		<button class="term" onclick={() => remove(t)} aria-label="Remove {t}">{t} ×</button>
	{/each}
	<input
		bind:value={draft}
		{onkeydown}
		onblur={add}
		list="ingredient-names"
		enterkeyhint="search"
		autocapitalize="off"
		placeholder={terms.length ? 'Add another' : 'e.g. falukorv, potato'}
		aria-label="Ingredient"
	/>
	<datalist id="ingredient-names">
		{#each suggestions as s}<option value={s}></option>{/each}
	</datalist>
</div>

{#if $recipes === undefined}
	<p class="muted">Loading…</p>
{:else if terms.length}
	{#if terms.length > 1}<h2>With {terms.length === 2 ? 'both' : `all ${terms.length}`}</h2>{/if}
	<ul class="list">
		{#each all as h (h.slug)}
			{@render hit(h)}
		{:else}
			<li class="muted">No recipe uses {terms.length === 1 ? 'that' : 'all of them'}.</li>
		{/each}
	</ul>

	{#if some.length}
		<h2>With some of them</h2>
		<ul class="list">
			{#each showAllPartial ? some : some.slice(0, PARTIAL) as h (h.slug)}
				{@render hit(h)}
			{/each}
		</ul>
		{#if !showAllPartial && some.length > PARTIAL}
			<button class="ghost small more" onclick={() => (showAllPartial = true)}>Show {some.length - PARTIAL} more</button>
		{/if}
	{/if}
{/if}

{#snippet hit(h: DishHit)}
	{@const r = h.best.item}
	<li class="card">
		<div class="head">
			<a href={resolve('/r/[id]', { id: r.id })} class="title">{r.favorite ? '★ ' : ''}{h.name}</a>
			{#if r.rating}<span class="muted small">{r.rating}/5</span>{/if}
		</div>
		<p class="small uses">
			{#each h.best.matches.filter((m) => m !== null) as m, i}{i ? ', ' : ''}<mark>{m.name}</mark>{/each}
		</p>
		<p class="muted small">
			{#if missing(h).length}No {missing(h).join(', ')} · {/if}
			{h.best.toBuy.length
				? `${h.best.toBuy.length} more: ${h.best.toBuy
						.slice(0, 4)
						.map((i) => i.name)
						.join(', ')}${h.best.toBuy.length > 4 ? '…' : ''}`
				: 'Nothing else but pantry basics'}
		</p>
		{#if h.others.length}
			<div class="row versions">
				<span class="muted small">Also</span>
				{#each h.others as v (v.id)}
					<a href={resolve('/r/[id]', { id: v.id })} class="chip">{v.favorite ? '★ ' : ''}{variant(v)}</a>
				{/each}
				<a href={resolve('/d/[dish]', { dish: h.slug })} class="chip compare">Compare ⇄</a>
			</div>
		{/if}
	</li>
{/snippet}

<style>
	.input {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		padding: 0.5rem;
	}
	.input input {
		flex: 1;
		min-width: 8rem;
		width: auto;
		border: none;
		background: transparent;
		padding: 0.4rem;
	}
	.input input:focus {
		outline: none;
	}
	.term {
		min-height: 2rem;
		padding: 0 0.7rem;
		border-radius: 1rem;
		font-size: 0.9rem;
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
	.title {
		font-weight: 600;
		color: inherit;
		text-decoration: none;
	}
	.card p {
		margin: 0.3rem 0 0;
	}
	mark {
		background: none;
		color: var(--accent);
		font-weight: 600;
	}
	.versions {
		margin-top: 0.5rem;
		gap: 0.4rem;
	}
	.more {
		margin-top: 0.6rem;
		width: 100%;
	}
</style>
