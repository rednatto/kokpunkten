<script lang="ts">
	import { resolve } from '$app/paths';
	import { liveQuery } from 'dexie';
	import { db, type StoredRecipe } from '#lib/db.ts';
	import { DISH_NAMES } from '#lib/dish-names.ts';

	const recipes = liveQuery(() => db.recipes.orderBy('addedAt').reverse().toArray());

	let query = $state('');
	let cuisine = $state('');
	let favoritesOnly = $state(false);

	interface Dish {
		slug: string;
		name: string;
		versions: StoredRecipe[];
		cuisines: string[];
		favorite: boolean;
		/** Lowercased text searched by the filter box: names, cuisines, tags and ingredients. */
		haystack: string;
	}

	function toDishes(rows: StoredRecipe[]): Dish[] {
		const groups = new Map<string, StoredRecipe[]>();
		for (const r of rows) groups.set(r.recipe.dish, [...(groups.get(r.recipe.dish) ?? []), r]);
		return [...groups].map(([slug, group]) => {
			const versions = group.toSorted((a, b) => a.addedAt - b.addedAt);
			const cuisines = [...new Set(versions.flatMap((v) => v.recipe.cuisine))];
			const words = versions.flatMap((v) => [
				v.recipe.title,
				...v.recipe.tags,
				...v.recipe.course,
				...v.recipe.ingredients.flatMap((i) => [i.name, i.key.replaceAll('-', ' ')])
			]);
			return {
				slug,
				name: DISH_NAMES[slug] ?? versions[0].recipe.title,
				versions,
				cuisines,
				favorite: versions.some((v) => v.favorite),
				haystack: [DISH_NAMES[slug] ?? '', ...cuisines, ...words].join(' ').toLowerCase()
			};
		});
	}

	const dishes = $derived($recipes ? toDishes($recipes) : []);
	const allCuisines = $derived([...new Set(dishes.flatMap((d) => d.cuisines))].sort());
	const shown = $derived.by(() => {
		const terms = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
		return dishes
			.filter((d) => (!favoritesOnly || d.favorite) && (!cuisine || d.cuisines.includes(cuisine)))
			.filter((d) => terms.every((t) => d.haystack.includes(t)))
			.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
	});

	const variant = (r: StoredRecipe) => r.recipe.source.name?.replace(/^Kokpunkten – /, '') ?? r.recipe.title;
</script>

{#if $recipes === undefined}
	<p class="muted">Loading…</p>
{:else if $recipes.length === 0}
	<div class="empty">
		<h1>No recipes yet</h1>
		<p class="muted">Ask your AI assistant for a recipe in Kokpunkten's format, then paste the answer here.</p>
		<a href={resolve('/add')} class="button">Add your first recipe</a>
	</div>
{:else}
	<div class="filters">
		<input type="search" bind:value={query} placeholder="Search dish or ingredient" aria-label="Search" />
		<div class="row">
			<select bind:value={cuisine} aria-label="Cuisine">
				<option value="">All cuisines</option>
				{#each allCuisines as c}<option value={c}>{c}</option>{/each}
			</select>
			<button class="ghost small" class:on={favoritesOnly} onclick={() => (favoritesOnly = !favoritesOnly)}>★ Favorites</button>
		</div>
	</div>

	<p class="muted small">{shown.length} {shown.length === 1 ? 'dish' : 'dishes'}</p>
	<ul class="list">
		{#each shown as d (d.slug)}
			<li class="card">
				<div class="head">
					<a href={resolve('/r/[id]', { id: d.versions[0].id })} class="title">{d.favorite ? '★ ' : ''}{d.name}</a>
					<span class="muted small">{d.cuisines.join(', ')}</span>
				</div>
				{#if d.versions.length > 1}
					<div class="row versions">
						{#each d.versions as v (v.id)}
							<a href={resolve('/r/[id]', { id: v.id })} class="chip">{v.favorite ? '★ ' : ''}{variant(v)}{#if v.rating} · {v.rating}/5{/if}</a>
						{/each}
						<a href={resolve('/d/[dish]', { dish: d.slug })} class="chip compare">Compare ⇄</a>
					</div>
				{/if}
			</li>
		{:else}
			<li class="muted">Nothing matches.</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		text-align: center;
		padding: 3rem 0;
	}
	.filters {
		display: grid;
		gap: 0.5rem;
	}
	.filters select {
		flex: 1;
		width: auto;
	}
	.on {
		background: var(--accent);
		color: var(--accent-fg);
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
	.small {
		font-size: 0.85rem;
	}
	.versions {
		margin-top: 0.5rem;
		gap: 0.4rem;
	}
	.compare {
		border-style: dashed;
	}
	.chip {
		font-size: 0.85rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		padding: 0.15rem 0.6rem;
		color: inherit;
		text-decoration: none;
	}
</style>
