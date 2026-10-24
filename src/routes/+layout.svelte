<script lang="ts">
	import { resolve } from '$app/paths';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { syncLibrary, syncing } from '#lib/library.ts';
	import { dbProblem, openDb, resetDb } from '#lib/db.ts';
	import TimerTray from '#lib/components/TimerTray.svelte';
	import Tools from '#lib/components/Tools.svelte';
	import { openTools } from '#lib/tools.svelte.ts';
	import { wake } from '#lib/wake.svelte.ts';
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
				syncing.set(false);
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
	<TimerTray />
	<div class="row">
		<!-- One menu on every page for swaps, weights, units, the screen and timers; it opens over the page, so checkmarks and timers stay put. -->
		<button class="ghost small" onclick={() => openTools()} aria-label="Kitchen tools: swaps, weights, units, timers{wake.awake ? ', screen stays on' : ''}">
			⚖<span class="wide">&nbsp;Tools</span>{#if wake.awake}<span class="sun" aria-hidden="true">☀</span>{/if}
		</button>
		<a href={resolve('/add')} class="button small">+ Add</a>
	</div>
</header>

<Tools />

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
	{#if $syncing}
		<p class="muted syncing" role="status">Updating the built-in recipes…</p>
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
	.bar > .row {
		flex: none;
	}
	.sun {
		margin-left: 0.2rem;
		font-size: 0.8rem;
	}
	/* On a phone running timer chips need the room, so the tools button shrinks to its icon. */
	@media (max-width: 30rem) {
		.bar:has(:global(.tray)) .wide {
			display: none;
		}
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
	.syncing {
		font-size: 0.85rem;
		margin: 0 0 0.5rem;
	}
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem 1rem calc(env(safe-area-inset-bottom) + 3rem);
	}
</style>
