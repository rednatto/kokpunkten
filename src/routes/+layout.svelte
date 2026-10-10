<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import './app.css';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header class="bar">
	<a href="/" class="brand">Kokpunkten</a>
	<a href="/add" class="button small">+ Add</a>
</header>

<main>
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
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem 1rem calc(env(safe-area-inset-bottom) + 3rem);
	}
</style>
