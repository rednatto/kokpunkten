<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { liveQuery } from 'dexie';
	import { onDestroy } from 'svelte';
	import { db, type StoredRecipe } from '#lib/db.ts';
	import { roughAmount, usAmount, weightHint } from '#lib/recipe/measures.ts';
	import type { Ingredient } from '#lib/recipe/schema.ts';
	import { convert, formatAmount, ingredientAmount } from '#lib/recipe/units.ts';
	import { settings } from '#lib/settings.svelte.ts';
	import Timer from './Timer.svelte';

	const id = $derived(page.params.id!);
	// null = not found; undefined = still loading.
	let row = $state<StoredRecipe | null | undefined>(undefined);
	$effect(() => {
		const current = id; // read here so the effect re-runs when the URL changes
		return watch(() => db.recipes.get(current), (r) => (row = r ?? null));
	});

	// Cooking state belongs to one recipe. Moving between versions reuses this page,
	// so state is tagged with its recipe id and anything from another recipe is ignored.
	let cooking = $state<{ id: string; servings: number | null; have: Set<string>; done: Set<string> }>({
		id: '',
		servings: null,
		have: new Set(),
		done: new Set()
	});
	const mine = $derived(cooking.id === id ? cooking : { id, servings: null, have: new Set<string>(), done: new Set<string>() });
	const haveIng = $derived(mine.have);
	const doneStep = $derived(mine.done);

	const recipe = $derived(row?.recipe);
	const servings = $derived(mine.servings ?? recipe?.servings ?? null);
	const factor = $derived(recipe && servings ? servings / recipe.servings : 1);
	const setCooking = (changes: Partial<typeof cooking>) => (cooking = { ...mine, ...changes });
	const ingName = $derived(new Map(recipe?.ingredients.map((i) => [i.id, i.name]) ?? []));
	const stepNo = $derived(new Map(recipe?.steps.map((s, n) => [s.id, n + 1]) ?? []));

	const dish = $derived(recipe?.dish);
	let siblings = $state<StoredRecipe[]>([]);
	$effect(() => {
		const d = dish; // read here so the effect re-runs when the dish changes
		return watch(() => (d ? db.recipes.where('recipe.dish').equals(d).toArray() : []), (rows) => (siblings = rows));
	});

	/** Subscribes to a live database query; the returned cleanup lets $effect re-subscribe when inputs change. */
	function watch<T>(query: () => Promise<T> | T, set: (value: T) => void) {
		const sub = liveQuery(query).subscribe({ next: set, error: (e) => console.error(e) });
		return () => sub.unsubscribe();
	}

	/** The amount to show, plus a quieter hint (standard weight, or the exact amount behind a rough one). */
	function amountFor(ing: Ingredient): { main: string; hint: string | null } {
		const a = ingredientAmount(ing, factor);
		const shown = settings.units === 'us' ? usAmount(ing, a) : convert(a, settings.units === 'rough' ? 'metric' : settings.units);
		const exact = formatAmount(shown, settings.numbers);
		if (settings.units === 'rough') {
			const rough = roughAmount(ing, a);
			if (rough) return { main: rough, hint: exact };
		}
		return { main: exact, hint: settings.units === 'us' ? null : weightHint(ing, a) };
	}

	function toggle(set: Set<string>, key: string) {
		const next = new Set(set);
		if (!next.delete(key)) next.add(key);
		return next;
	}

	function usesLabel(ref: string) {
		return ingName.get(ref) ?? `step ${stepNo.get(ref)}`;
	}

	// Keep the screen on while cooking, where the browser supports it.
	let wakeLock: WakeLockSentinel | null = null;
	let awake = $state(false);
	async function toggleAwake() {
		if (wakeLock) {
			await wakeLock.release();
			wakeLock = null;
			awake = false;
			return;
		}
		try {
			wakeLock = await navigator.wakeLock.request('screen');
			awake = true;
			wakeLock.addEventListener('release', () => {
				wakeLock = null;
				awake = false;
			});
		} catch {
			awake = false;
		}
	}
	onDestroy(() => wakeLock?.release());

	const update = (changes: Partial<{ favorite: boolean; rating: number | null; note: string }>) =>
		db.recipes.update(id, changes);

	async function remove() {
		if (!confirm('Delete this recipe from this device?')) return;
		await db.recipes.delete(id);
		await goto(resolve('/'));
	}
</script>

{#if row === undefined}
	<p class="muted">Loading…</p>
{:else if row === null || !recipe}
	<p>Recipe not found. <a href={resolve('/')}>Back to recipes</a></p>
{:else}
	<h1>{recipe.title}</h1>
	<p class="muted meta">
		{#if recipe.source.url}
			<a href={recipe.source.url} target="_blank" rel="noopener">{recipe.source.name ?? 'Source'}</a>
		{:else}
			{recipe.source.name ?? recipe.source.book?.title ?? recipe.source.type}
		{/if}
		{#if recipe.time.totalMin}· {recipe.time.totalMin} min{/if}
		{#if recipe.cuisine.length}· {recipe.cuisine.join(', ')}{/if}
	</p>

	{#if siblings && siblings.length > 1}
		<nav class="row others" aria-label="Versions of this dish">
			{#each siblings as s (s.id)}
				<a href={resolve('/r/[id]', { id: s.id })} class="chip" class:current={s.id === id} aria-current={s.id === id ? 'page' : undefined}>
					{s.recipe.source.name?.replace(/^Kokpunkten – /, '') ?? s.recipe.title}
				</a>
			{/each}
		</nav>
	{/if}

	<div class="row controls">
		<div class="row stepper" aria-label="Servings">
			<button class="ghost small" onclick={() => setCooking({ servings: Math.max(1, (servings ?? 1) - 1) })} aria-label="Fewer servings">−</button>
			<span><strong>{servings}</strong> servings</span>
			<button class="ghost small" onclick={() => setCooking({ servings: (servings ?? 0) + 1 })} aria-label="More servings">+</button>
		</div>
		<select bind:value={settings.units} aria-label="Units" class="units">
			<option value="original">As written</option>
			<option value="metric">Metric</option>
			<option value="us">US cups</option>
			<option value="rough">Rough (att höfta)</option>
		</select>
		<button class="ghost small" onclick={() => (settings.numbers = settings.numbers === 'fraction' ? 'decimal' : 'fraction')} aria-label="Fractions or decimals">
			{settings.numbers === 'fraction' ? '½ → 0.5' : '0.5 → ½'}
		</button>
		{#if 'wakeLock' in navigator}
			<button class="ghost small" class:on={awake} onclick={toggleAwake}>{awake ? 'Screen stays on' : 'Keep screen on'}</button>
		{/if}
	</div>

	<h2>Ingredients</h2>
	<ul class="checklist">
		{#each recipe.ingredients as ing, n (ing.id)}
			{@const amt = amountFor(ing)}
			{#if ing.group && ing.group !== recipe.ingredients[n - 1]?.group}
				<li class="group">{ing.group}</li>
			{/if}
			<li class:done={haveIng.has(ing.id)}>
				<label>
					<input type="checkbox" checked={haveIng.has(ing.id)} onchange={() => setCooking({ have: toggle(haveIng, ing.id) })} />
					<span>
						<strong class="amount">{amt.main}</strong>
						{ing.name}{#if ing.prep}<span class="muted">, {ing.prep}</span>{/if}
						{#if amt.hint}<span class="muted hint"> ({amt.hint})</span>{/if}
						{#if ing.optional}<span class="muted"> (optional)</span>{/if}
						{#if ing.substitutes.length}<span class="muted sub">or {ing.substitutes.join(', ')}</span>{/if}
					</span>
				</label>
			</li>
		{/each}
	</ul>

	<h2>Steps</h2>
	<ol class="steps">
		{#each recipe.steps as step (step.id)}
			<li class:done={doneStep.has(step.id)}>
				<button class="num" onclick={() => setCooking({ done: toggle(doneStep, step.id) })} aria-pressed={doneStep.has(step.id)}>
					{doneStep.has(step.id) ? '✓' : stepNo.get(step.id)}
				</button>
				<div>
					<p>{step.text}</p>
					{#if step.critical}<p class="critical">⚠ {step.critical}</p>{/if}
					<div class="row tags">
						{#if step.heat}<span class="tag">{step.heat} heat</span>{/if}
						{#if step.tempC}<span class="tag">{step.tempC} °C</span>{/if}
						{#if step.uses.length}<span class="muted uses">uses {step.uses.map(usesLabel).join(', ')}</span>{/if}
					</div>
					{#if step.durationMin}<Timer minutes={step.durationMin} />{/if}
				</div>
			</li>
		{/each}
	</ol>

	{#if Object.values(recipe.notes).some(Boolean)}
		<h2>Why it works</h2>
		{#each [['Techniques', recipe.notes.techniques], ['Chemistry', recipe.notes.chemistry], ['Spices and flavour', recipe.notes.spiceProfile], ['Variations', recipe.notes.variations]] as [label, text]}
			{#if text}
				<details>
					<summary>{label}</summary>
					<p>{text}</p>
				</details>
			{/if}
		{/each}
	{/if}

	<h2>Yours</h2>
	<div class="card mine">
		<div class="row">
			<button class="ghost small" onclick={() => update({ favorite: !row!.favorite })}>
				{row.favorite ? '★ Favorite' : '☆ Favorite'}
			</button>
			<div class="row rating" aria-label="Rating">
				{#each [1, 2, 3, 4, 5] as n}
					<button
						class="ghost small dot"
						class:filled={(row.rating ?? 0) >= n}
						aria-label="Rate {n} of 5"
						onclick={() => update({ rating: row!.rating === n ? null : n })}>●</button>
				{/each}
			</div>
		</div>
		<textarea
			rows="3"
			placeholder="Your notes, e.g. less salt next time"
			value={row.note}
			onchange={(e) => update({ note: e.currentTarget.value })}
			style="font-family: inherit; font-size: 1rem"
		></textarea>
		{#if !row.builtin}
			<button class="ghost small delete" onclick={remove}>Delete recipe</button>
		{/if}
	</div>
{/if}

<style>
	.meta {
		margin: 0 0 0.75rem;
	}
	.others {
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}
	.chip {
		font-size: 0.85rem;
		border: 1px solid var(--line);
		border-radius: 1rem;
		padding: 0.15rem 0.6rem;
		color: inherit;
		text-decoration: none;
	}
	.chip.current {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-fg);
	}
	.controls {
		justify-content: space-between;
		gap: 0.75rem;
	}
	.stepper {
		gap: 0.75rem;
	}
	.stepper button {
		width: 2.5rem;
		padding: 0;
		font-size: 1.2rem;
	}
	.units {
		width: auto;
		flex: 1;
		min-width: 9rem;
	}
	.hint {
		font-size: 0.85rem;
	}
	.on {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.checklist,
	.steps {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.checklist li label {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.checklist input {
		width: 1.3rem;
		height: 1.3rem;
		margin-top: 0.15rem;
		flex: none;
		accent-color: var(--accent);
	}
	.group {
		font-weight: 600;
		padding-top: 0.75rem;
		color: var(--muted);
		font-size: 0.9rem;
		text-transform: uppercase;
	}
	.amount {
		margin-right: 0.25rem;
	}
	.sub {
		display: block;
		font-size: 0.85rem;
	}
	.done,
	.done .muted {
		color: var(--done);
	}
	.checklist .done span {
		text-decoration: line-through;
	}
	.steps li {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--line);
	}
	.steps p {
		margin: 0;
	}
	.num {
		flex: none;
		align-self: flex-start;
		width: 2.25rem;
		height: 2.25rem;
		min-height: 0;
		padding: 0;
		border-radius: 50%;
	}
	.done .num {
		background: transparent;
		color: var(--done);
		border-color: var(--done);
	}
	.critical {
		color: var(--warn);
		font-size: 0.9rem;
		margin-top: 0.25rem !important;
	}
	.tags {
		margin-top: 0.25rem;
		font-size: 0.8rem;
	}
	.tag {
		border: 1px solid var(--line);
		border-radius: 1rem;
		padding: 0 0.5rem;
	}
	details {
		border-bottom: 1px solid var(--line);
		padding: 0.5rem 0;
	}
	summary {
		font-weight: 600;
		cursor: pointer;
	}
	details p {
		margin: 0.5rem 0 0;
	}
	.mine {
		display: grid;
		gap: 0.75rem;
	}
	.rating {
		gap: 0;
	}
	.dot {
		border: none;
		padding: 0 0.3rem;
		color: var(--line);
		font-size: 1.2rem;
	}
	.dot.filled {
		color: var(--accent);
	}
	.delete {
		justify-self: start;
		border-color: var(--warn);
		color: var(--warn);
	}
</style>
