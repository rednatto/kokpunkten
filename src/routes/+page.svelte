<script lang="ts">
	import { resolve } from '$app/paths';
	import { liveQuery } from 'dexie';
	import { db, dishNames, type RecipeSummary } from '#lib/db.ts';
	import { dishName } from '#lib/dish-names.ts';
	import { cuisineName } from '#lib/display.ts';
	import { fromSwedish } from '#lib/recipe/ingredient-search.ts';

	// Summaries, not whole recipes: the list only needs names, cuisines and search words.
	let rows = $state<RecipeSummary[]>();
	let loadError = $state('');
	$effect(() => {
		const sub = liveQuery(() => db.summaries.toArray()).subscribe({
			next: (v) => ((loadError = ''), (rows = v)),
			error: (e: Error) => {
				console.error(e);
				loadError = `${e.name}: ${e.message}`;
			}
		});
		return () => sub.unsubscribe();
	});

	let query = $state('');
	let cuisine = $state('');
	let favoritesOnly = $state(false);
	let versionsOnly = $state(false);

	interface Dish {
		slug: string;
		name: string;
		versions: RecipeSummary[];
		cuisines: string[];
		favorite: boolean;
		/** Lowercased text searched by the filter box: names, cuisines, tags and ingredients. */
		haystack: string;
	}

	function toDishes(rows: RecipeSummary[], named: Map<string, string>): Dish[] {
		const groups = new Map<string, RecipeSummary[]>();
		for (const r of rows) groups.set(r.dish, [...(groups.get(r.dish) ?? []), r]);
		return [...groups].map(([slug, group]) => {
			const versions = group.toSorted((a, b) => a.addedAt - b.addedAt);
			const cuisines = [...new Set(versions.flatMap((v) => v.cuisine))];
			const name = dishName(slug, versions.map((v) => v.title), named);
			return {
				slug,
				name,
				versions,
				cuisines,
				favorite: versions.some((v) => v.favorite),
				haystack: [name, ...cuisines, ...versions.map((v) => v.words)].join(' ').toLowerCase()
			};
		});
	}

	const dishes = $derived(rows ? toDishes(rows, $dishNames) : []);
	const allCuisines = $derived([...new Set(dishes.flatMap((d) => d.cuisines))].sort());
	const shown = $derived.by(() => {
		// Each term as typed, or its English word: "kyckling" finds chicken, as on the ingredients page.
		const terms = query
			.toLowerCase()
			.split(/[\s,]+/)
			.filter(Boolean)
			.map((t) => [t, fromSwedish(t)].filter((w) => w != null));
		const compared = (d: Dish) => Number(d.versions.length > 1);
		// A search for chicken lists chicken dishes before dishes that only use chicken stock.
		const named = (d: Dish) => Number(terms.length > 0 && terms.every((t) => t.some((w) => d.name.toLowerCase().includes(w))));
		return dishes
			.filter((d) => (!favoritesOnly || d.favorite) && (!versionsOnly || compared(d)) && (!cuisine || d.cuisines.includes(cuisine)))
			.filter((d) => terms.every((t) => t.some((w) => d.haystack.includes(w))))
			// Dishes with versions to compare come first: comparing them is what the app is for.
			.sort(
				(a, b) =>
					Number(b.favorite) - Number(a.favorite) || named(b) - named(a) || compared(b) - compared(a) || a.name.localeCompare(b.name)
			);
	});

	// Draw the list a page at a time: more cards as the end comes into view.
	const PAGE = 40;
	let limit = $state(PAGE);
	$effect(() => {
		void [query, cuisine, favoritesOnly, versionsOnly];
		limit = PAGE;
	});
	function more(node: HTMLElement) {
		const io = new IntersectionObserver((e) => e[0].isIntersecting && (limit += PAGE), { rootMargin: '600px' });
		io.observe(node);
		return { destroy: () => io.disconnect() };
	}
</script>

{#if loadError}
	<p role="alert">Couldn't read your recipes ({loadError}).</p>
	<button class="small" onclick={() => location.reload()}>Reload</button>
{:else if rows === undefined}
	<p class="muted">Loading…</p>
{:else if rows.length === 0}
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
				{#each allCuisines as c}<option value={c}>{cuisineName(c)}</option>{/each}
			</select>
			<button class="ghost small" class:on={versionsOnly} aria-pressed={versionsOnly} onclick={() => (versionsOnly = !versionsOnly)}>⇄ Has versions</button>
			<button class="ghost small" class:on={favoritesOnly} aria-pressed={favoritesOnly} onclick={() => (favoritesOnly = !favoritesOnly)}>★ Favorites</button>
			<a href={resolve('/ingredients')} class="button ghost small">By ingredients</a>
		</div>
	</div>

	<p class="muted small">{shown.length} {shown.length === 1 ? 'dish' : 'dishes'}</p>
	<ul class="list">
		{#each shown.slice(0, limit) as d (d.slug)}
			<li class="card">
				<div class="head">
					<a href={resolve('/r/[id]', { id: d.versions[0].id })} class="title">{d.favorite ? '★ ' : ''}{d.name}</a>
					<span class="muted small">{d.cuisines.map(cuisineName).join(', ')}</span>
				</div>
				{#if d.versions.length > 1}
					<div class="row versions">
						<a href={resolve('/d/[dish]', { dish: d.slug })} class="chip compare">⇄ Compare {d.versions.length} versions</a>
						{#each d.versions as v (v.id)}
							<a href={resolve('/r/[id]', { id: v.id })} class="chip">{v.favorite ? '★ ' : ''}{v.variant}{#if v.rating} · {v.rating}/5{/if}</a>
						{/each}
					</div>
				{/if}
			</li>
		{:else}
			<li class="muted">Nothing matches.</li>
		{/each}
	</ul>
	{#if shown.length > limit}
		{#key limit}<div use:more class="muted small">Loading more…</div>{/key}
	{/if}
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
	.versions {
		margin-top: 0.5rem;
		gap: 0.4rem;
	}
</style>
