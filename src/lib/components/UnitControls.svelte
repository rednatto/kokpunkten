<script lang="ts">
	import { settings } from '#lib/settings.svelte.ts';
</script>

<select bind:value={settings.units} aria-label="Units" class="units">
	<option value="original">As written</option>
	<option value="metric">Metric</option>
	<option value="us">US cups</option>
	<option value="rough">Rough (att höfta)</option>
</select>
<button
	class="ghost small"
	onclick={() => (settings.numbers = settings.numbers === 'fraction' ? 'decimal' : 'fraction')}
	aria-label="Fractions or decimals"
>
	{settings.numbers === 'fraction' ? '½ → 0.5' : '0.5 → ½'}
</button>

<style>
	.units {
		width: auto;
		flex: 1;
		min-width: 9rem;
	}
</style>
