<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { openTools } from '#lib/tools.svelte.ts';

	// Swaps and weights live in the header's tools now; old links (?tab=weights) open them over the recipe list.
	onMount(async () => {
		const tab = page.url.searchParams.get('tab') === 'weights' ? 'weights' : 'swaps';
		await goto(resolve('/'), { replaceState: true });
		openTools(tab);
	});
</script>
