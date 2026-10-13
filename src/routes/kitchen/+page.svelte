<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import KitchenHelp from '#lib/components/KitchenHelp.svelte';

	/** The open tab lives in the URL (?tab=weights), so each can be bookmarked. */
	let tab = $state<'swaps' | 'weights'>(page.url.searchParams.get('tab') === 'weights' ? 'weights' : 'swaps');
	$effect(() => {
		const url = new URL(page.url.href);
		if (url.searchParams.get('tab') === tab || (tab === 'swaps' && !url.searchParams.has('tab'))) return;
		url.searchParams.set('tab', tab);
		replaceState(url, {});
	});
</script>

<h1>Swaps &amp; weights</h1>
<p class="muted small">What to use when you're out of something, and what things weigh.</p>
<KitchenHelp bind:tab />

<style>
	.small {
		font-size: 0.85rem;
	}
</style>
