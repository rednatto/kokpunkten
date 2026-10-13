<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { liveQuery } from 'dexie';
	import { onDestroy } from 'svelte';
	import { db, deleteRecipes, updateRecipe, type StoredRecipe } from '#lib/db.ts';
	import { cuisineName, showAmount } from '#lib/display.ts';
	import { versionLabel, versionLabels, versionSource } from '#lib/recipe/labels.ts';
	import type { Ingredient } from '#lib/recipe/schema.ts';
	import { ingredientAmount } from '#lib/recipe/units.ts';
	import RecipeDiagram from '#lib/components/RecipeDiagram.svelte';
	import UnitControls from '#lib/components/UnitControls.svelte';
	import KitchenHelp from '#lib/components/KitchenHelp.svelte';
	import { progress, setServings, toggleDone, toggleHave } from '#lib/cooking.svelte.ts';
	import Timer from './Timer.svelte';

	const id = $derived(page.params.id!);
	// null = not found; undefined = still loading.
	let row = $state<StoredRecipe | null | undefined>(undefined);
	let loadError = $state('');
	$effect(() => {
		const current = id; // read here so the effect re-runs when the URL changes
		return watch(() => db.recipes.get(current), (r) => (row = r ?? null));
	});

	// Cooking progress lives in app state, keyed by recipe id, so it survives leaving the page.
	const mine = $derived(progress(id));
	const haveIng = $derived(new Set(mine.have));
	const doneStep = $derived(new Set(mine.done));

	const recipe = $derived(row?.recipe);
	const servings = $derived(mine.servings ?? recipe?.servings ?? null);
	const factor = $derived(recipe && servings ? servings / recipe.servings : 1);
	const ingName = $derived(new Map(recipe?.ingredients.map((i) => [i.id, i.name]) ?? []));
	const stepNo = $derived(new Map(recipe?.steps.map((s, n) => [s.id, n + 1]) ?? []));

	const dish = $derived(recipe?.dish);
	let siblings = $state<StoredRecipe[]>([]);
	$effect(() => {
		const d = dish; // read here so the effect re-runs when the dish changes
		return watch(() => (d ? db.recipes.where('recipe.dish').equals(d).sortBy('addedAt') : []), (rows) => (siblings = rows));
	});
	const siblingLabels = $derived(versionLabels(siblings.map((s) => s.recipe)));

	/** Subscribes to a live database query; the returned cleanup lets $effect re-subscribe when inputs change. */
	function watch<T>(query: () => Promise<T> | T, set: (value: T) => void) {
		const sub = liveQuery(query).subscribe({
			next: (v) => ((loadError = ''), set(v)),
			error: (e: Error) => {
				console.error(e);
				loadError = `${e.name}: ${e.message}`;
			}
		});
		return () => sub.unsubscribe();
	}

	const amountFor = (ing: Ingredient) => showAmount(ing, ingredientAmount(ing, factor));

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

	let saveError = $state('');
	async function update(changes: Partial<{ favorite: boolean; rating: number | null; note: string }>) {
		saveError = '';
		try {
			await updateRecipe(id, changes);
		} catch (e) {
			console.error(e);
			saveError = `Couldn't save that (${(e as Error).name}: ${(e as Error).message.slice(0, 120)}).`;
		}
	}

	async function remove() {
		if (!confirm('Delete this recipe from this device?')) return;
		await deleteRecipes([id]);
		await goto(resolve('/'));
	}

	// Swaps and weights open over the recipe, so its timers and checkmarks stay put.
	let helpDialog = $state<HTMLDialogElement>();
	let helpTab = $state<'swaps' | 'weights'>('swaps');
	function openHelp(t: 'swaps' | 'weights') {
		helpTab = t;
		helpDialog?.showModal();
	}
</script>

{#if loadError}
	<p role="alert">Couldn't read this recipe ({loadError}).</p>
	<button class="small" onclick={() => location.reload()}>Reload</button>
{:else if row === undefined}
	<p class="muted">Loading…</p>
{:else if row === null || !recipe}
	<p>Recipe not found. <a href={resolve('/')}>Back to recipes</a></p>
{:else}
	<h1>{recipe.title}</h1>
	<p class="muted meta">
		{#if recipe.source.url}
			<a href={recipe.source.url} target="_blank" rel="noopener">{recipe.source.name ?? 'Source'}</a>
		{:else}
			{versionSource(recipe) ?? versionLabel(recipe)}
		{/if}
		{#if recipe.source.url && recipe.source.author && recipe.source.license}· by {recipe.source.author}, {recipe.source.license}{/if}
		{#if recipe.time.totalMin}· {recipe.time.totalMin} min{/if}
		{#if recipe.cuisine.length}· {recipe.cuisine.map(cuisineName).join(', ')}{/if}
	</p>

	{#if siblings && siblings.length > 1}
		<nav class="row others" aria-label="Versions of this dish">
			<a href="{resolve('/d/[dish]', { dish: recipe.dish })}?from={id}" class="chip compare">⇄ Compare {siblings.length} versions</a>
			{#each siblings as s, i (s.id)}
				<a href={resolve('/r/[id]', { id: s.id })} class="chip" class:current={s.id === id} aria-current={s.id === id ? 'page' : undefined} title={versionSource(s.recipe)}>
					{siblingLabels[i]}
				</a>
			{/each}
		</nav>
	{/if}

	<div class="row controls">
		<div class="row stepper" aria-label="Servings">
			<button class="ghost small" onclick={() => setServings(id, Math.max(1, (servings ?? 1) - 1))} aria-label="Fewer servings">−</button>
			<span><strong>{servings}</strong> servings</span>
			<button class="ghost small" onclick={() => setServings(id, (servings ?? 0) + 1)} aria-label="More servings">+</button>
		</div>
		<UnitControls />
		{#if 'wakeLock' in navigator}
			<button class="ghost small" class:on={awake} onclick={toggleAwake}>{awake ? 'Screen stays on' : 'Keep screen on'}</button>
		{/if}
	</div>

	<div class="row ing-head">
		<h2>Ingredients</h2>
		<button class="ghost small" onclick={() => openHelp('swaps')}>Swaps</button>
		<button class="ghost small" onclick={() => openHelp('weights')}>Weights</button>
	</div>
	<dialog bind:this={helpDialog} class="help" closedby="any" aria-label="Swaps and weights">
		<div class="help-head">
			<strong>Swaps &amp; weights</strong>
			<button class="ghost small" onclick={() => helpDialog?.close()} aria-label="Close">✕</button>
		</div>
		<KitchenHelp bind:tab={helpTab} {recipe} />
	</dialog>
	<ul class="checklist">
		{#each recipe.ingredients as ing, n (ing.id)}
			{@const amt = amountFor(ing)}
			{#if ing.group && ing.group !== recipe.ingredients[n - 1]?.group}
				<li class="group">{ing.group}</li>
			{/if}
			<li class:done={haveIng.has(ing.id)}>
				<label>
					<input type="checkbox" checked={haveIng.has(ing.id)} onchange={() => toggleHave(id, ing.id)} />
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
	{#if recipe.steps.length > 1}
		<details class="diagram">
			<summary>Diagram</summary>
			<RecipeDiagram {recipe} done={doneStep} ontoggle={(sid) => toggleDone(id, sid)} />
		</details>
	{/if}
	<ol class="steps">
		{#each recipe.steps as step (step.id)}
			<li class:done={doneStep.has(step.id)}>
				<button class="num" onclick={() => toggleDone(id, step.id)} aria-pressed={doneStep.has(step.id)}>
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
					{#if step.durationMin}<Timer recipeId={id} stepId={step.id} title={recipe.title} step={stepNo.get(step.id) ?? 0} minutes={step.durationMin} maxMinutes={step.durationMaxMin} />{/if}
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
		{#if saveError}<p role="alert">{saveError}</p>{/if}
		{#if !row.builtin}
			<button class="ghost small delete" onclick={remove}>Delete recipe</button>
		{/if}
	</div>
{/if}

<style>
	.ing-head h2 {
		margin-right: auto;
	}
	.help {
		width: min(40rem, calc(100vw - 1rem));
		max-height: calc(100dvh - 2rem);
		padding: 0.75rem 1rem 1.5rem;
		border: 1px solid var(--line);
		border-radius: 0.8rem;
		background: var(--bg);
		color: var(--fg);
	}
	.help::backdrop {
		background: rgb(0 0 0 / 0.45);
	}
	.help-head {
		position: sticky;
		top: -0.75rem;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: -0.75rem -1rem 0;
		padding: 0.75rem 1rem 0.25rem;
		background: var(--bg);
	}
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
	.chip.compare {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-fg);
		font-weight: 600;
		padding: 0.3rem 0.85rem;
	}
	.chip.current {
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 600;
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
	.diagram {
		margin-bottom: 0.5rem;
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
