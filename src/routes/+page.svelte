<script lang="ts">
	import { resolve } from '$app/paths';
	import { liveQuery } from 'dexie';
	import { db, type StoredRecipe } from '#lib/db.ts';

	const recipes = liveQuery(() => db.recipes.orderBy('addedAt').reverse().toArray());

	/** Versions of the same dish are grouped, ready for the diff view. */
	function byDish(rows: StoredRecipe[]) {
		const groups = new Map<string, StoredRecipe[]>();
		for (const r of rows) groups.set(r.recipe.dish, [...(groups.get(r.recipe.dish) ?? []), r]);
		return [...groups.values()].sort((a, b) => Number(b.some((r) => r.favorite)) - Number(a.some((r) => r.favorite)));
	}
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
	<h1>Recipes</h1>
	<ul class="list">
		{#each byDish($recipes) as versions (versions[0].recipe.dish)}
			<li class="card">
				{#each versions as v (v.id)}
					<a href={resolve('/r/[id]', { id: v.id })} class="item">
						<span class="title">{v.favorite ? '★ ' : ''}{v.recipe.title}</span>
						<span class="muted small">
							{v.recipe.source.name ?? v.recipe.source.book?.title ?? v.recipe.source.type}
							{#if v.rating}· {'●'.repeat(v.rating)}{/if}
						</span>
					</a>
				{/each}
				{#if versions.length > 1}
					<p class="muted small versions">{versions.length} versions of this dish</p>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.empty {
		text-align: center;
		padding: 3rem 0;
	}
	.list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}
	.item {
		display: flex;
		flex-direction: column;
		padding: 0.35rem 0;
		color: inherit;
		text-decoration: none;
	}
	.item + .item {
		border-top: 1px solid var(--line);
	}
	.title {
		font-weight: 600;
	}
	.small {
		font-size: 0.85rem;
	}
	.versions {
		margin: 0.25rem 0 0;
	}
</style>
