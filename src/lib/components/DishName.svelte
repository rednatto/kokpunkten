<script lang="ts">
	import { tick } from 'svelte';
	import { renameDish } from '#lib/db.ts';

	/** The dish's name as a heading, with a pen to rename it. */
	let { slug, name }: { slug: string; name: string } = $props();

	let editing = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement>();

	async function edit() {
		draft = name;
		editing = true;
		await tick();
		input?.select();
	}
	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (draft.trim() !== name) await renameDish(slug, draft);
		editing = false;
	}
</script>

{#if editing}
	<form class="row edit" onsubmit={save}>
		<input bind:this={input} bind:value={draft} aria-label="Dish name" onkeydown={(e) => e.key === 'Escape' && (editing = false)} />
		<button class="small">Save</button>
		<button type="button" class="ghost small" onclick={() => (editing = false)}>Cancel</button>
	</form>
{:else}
	<h1>{name} <button class="pen" onclick={edit} aria-label="Rename dish" title="Rename dish">✎</button></h1>
{/if}

<style>
	.pen {
		min-height: 0;
		padding: 0.1rem 0.35rem;
		border: none;
		background: none;
		color: var(--muted);
		font-size: 1rem;
		font-weight: 400;
		vertical-align: middle;
	}
	.pen:hover {
		color: var(--accent);
	}
	.edit {
		margin: 0.5rem 0 0.5rem;
		gap: 0.4rem;
		flex-wrap: nowrap;
	}
	.edit input {
		font-size: 1.3rem;
		font-weight: 600;
	}
</style>
