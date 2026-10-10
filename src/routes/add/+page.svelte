<script lang="ts">
	import { goto } from '$app/navigation';
	import { addRecipes } from '#lib/db.ts';
	import { buildPrompt } from '#lib/recipe/prompt.ts';
	import { parseRecipes } from '#lib/recipe/schema.ts';

	let dish = $state('');
	let versions = $state(3);
	let language = $state('English');
	let source = $state('');
	let copied = $state(false);

	let pasted = $state('');
	let errors = $state<string[]>([]);
	let saving = $state(false);

	async function copyPrompt() {
		await navigator.clipboard.writeText(buildPrompt({ dish, versions, language, source }));
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function importRecipes() {
		const res = parseRecipes(pasted);
		if (!res.ok) {
			errors = res.errors;
			return;
		}
		errors = [];
		saving = true;
		const ids = await addRecipes(res.recipes);
		await goto(ids.length === 1 ? `/r/${ids[0]}` : '/');
	}
</script>

<h1>Add a recipe</h1>

<section class="card">
	<h2>1. Ask your AI assistant</h2>
	<p class="muted">Copy this prompt into ChatGPT, Claude or similar. It asks for the recipe in a format this app reads.</p>
	<label>
		Dish
		<input bind:value={dish} placeholder="e.g. spaghetti carbonara" />
	</label>
	<label>
		Or a specific source <span class="muted">(URL or book, optional)</span>
		<input bind:value={source} placeholder="https://… or Book title, page 42" />
	</label>
	<div class="row">
		<label class="grow">
			Versions
			<input type="number" min="1" max="8" bind:value={versions} disabled={!!source.trim()} />
		</label>
		<label class="grow">
			Language
			<select bind:value={language}>
				<option>English</option>
				<option>Swedish</option>
			</select>
		</label>
	</div>
	<button onclick={copyPrompt} disabled={!dish.trim() && !source.trim()}>
		{copied ? 'Copied ✓' : 'Copy prompt'}
	</button>
</section>

<section class="card">
	<h2>2. Paste the answer</h2>
	<textarea bind:value={pasted} rows="10" placeholder="Paste the JSON your assistant returned"></textarea>
	{#if errors.length}
		<div class="errors" role="alert">
			<strong>That didn't work:</strong>
			<ul>
				{#each errors.slice(0, 12) as e}<li>{e}</li>{/each}
			</ul>
			{#if errors.length > 12}<p>…and {errors.length - 12} more.</p>{/if}
		</div>
	{/if}
	<button onclick={importRecipes} disabled={!pasted.trim() || saving}>Import</button>
</section>

<style>
	section {
		display: grid;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	h2 {
		margin: 0;
	}
	p {
		margin: 0;
	}
	label {
		display: grid;
		gap: 0.25rem;
		font-size: 0.9rem;
	}
	.grow {
		flex: 1;
	}
	.errors {
		color: var(--warn);
		font-size: 0.9rem;
	}
	.errors ul {
		margin: 0.25rem 0 0;
		padding-left: 1.2rem;
	}
</style>
