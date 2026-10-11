<script lang="ts">
	import { resolve } from '$app/paths';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { syncLibrary } from '#lib/library.ts';
	import { dbProblem, openDb, resetDb } from '#lib/db.ts';
	import type { LayoutProps } from './$types';
	import './app.css';

	let { children }: LayoutProps = $props();

	async function reset() {
		if (!confirm('Delete all recipes, favorites, ratings and notes on this device and start over?')) return;
		await resetDb();
		location.reload();
	}

	onMount(() => {
		openDb()
			.then(syncLibrary)
			.catch((e: Error) => {
				console.error('Could not load the recipe library', e);
				dbProblem.set({ kind: 'error', message: `Could not load the built-in recipes: ${e.name}: ${e.message}` });
			});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="bar">
	<a href={resolve('/')} class="brand">Kokpunkten</a>
	<div class="row">
		<a href={resolve('/kitchen')} class="button ghost small">Swaps &amp; weights</a>
		<a href={resolve('/add')} class="button small">+ Add</a>
	</div>
</header>

<main>
	{#if $dbProblem}
		<div class="problem" role="alert">
			<p>{$dbProblem.message}</p>
			<div class="row">
				<button class="small" onclick={() => location.reload()}>Reload</button>
				{#if $dbProblem.kind !== 'blocked'}
					<button class="small ghost" onclick={reset}>Reset local data</button>
				{/if}
			</div>
		</div>
	{/if}
	{@render children()}
</main>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: calc(env(safe-area-inset-top) + 0.5rem) 1rem 0.5rem;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}
	.brand {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--fg);
		text-decoration: none;
	}
	.problem {
		border: 1px solid var(--line);
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
	}
	.problem p {
		margin: 0 0 0.5rem;
	}
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem 1rem calc(env(safe-area-inset-bottom) + 3rem);
	}
</style>
