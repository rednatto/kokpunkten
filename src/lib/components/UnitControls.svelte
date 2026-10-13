<script lang="ts">
	import { settings } from '#lib/settings.svelte.ts';

	const UNITS = [
		['original', 'As written'],
		['metric', 'Metric'],
		['us', 'US cups'],
		['rough', 'Rough (att höfta)']
	] as const;
	const id = `units-${Math.random().toString(36).slice(2, 8)}`;
	const current = $derived(UNITS.find(([value]) => value === settings.units)?.[1] ?? 'Units');

	// The popover lives in the top layer, so place it under its button by hand.
	let button = $state<HTMLButtonElement>();
	let panel = $state<HTMLElement>();
	function place(e: ToggleEvent) {
		if (e.newState !== 'open' || !button || !panel) return;
		const b = button.getBoundingClientRect();
		const width = panel.offsetWidth;
		panel.style.top = `${b.bottom + 6}px`;
		panel.style.left = `${Math.max(8, Math.min(b.left, innerWidth - width - 8))}px`;
	}
	// A fixed panel would drift away from its button, so scrolling closes it.
	const close = () => panel?.matches(':popover-open') && panel.hidePopover();
</script>

<svelte:window onscroll={close} onresize={close} />

<button bind:this={button} class="ghost small" popovertarget={id} aria-label="Units and numbers: {current}, {settings.numbers === 'fraction' ? 'fractions' : 'decimals'}">
	⚙ {current} · {settings.numbers === 'fraction' ? '½' : '0.5'}
</button>
<div bind:this={panel} {id} popover="auto" class="panel" ontoggle={place}>
	<span class="small muted" id="{id}-u">Units</span>
	<div class="segmented vertical" role="radiogroup" aria-labelledby="{id}-u">
		{#each UNITS as [value, name] (value)}
			<label><input type="radio" name="{id}-units" {value} bind:group={settings.units} />{name}</label>
		{/each}
	</div>
	<span class="small muted" id="{id}-n">Numbers</span>
	<div class="segmented" role="radiogroup" aria-labelledby="{id}-n">
		<label><input type="radio" name="{id}-numbers" value="fraction" bind:group={settings.numbers} />½</label>
		<label><input type="radio" name="{id}-numbers" value="decimal" bind:group={settings.numbers} />0.5</label>
	</div>
</div>

<style>
	.panel {
		position: fixed;
		inset: auto;
		margin: 0;
		width: 13rem;
		padding: 0.75rem;
		border: 1px solid var(--line);
		border-radius: 0.75rem;
		background: var(--surface);
		color: var(--fg);
		box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.18);
	}
	.panel:popover-open {
		display: grid;
		gap: 0.3rem;
	}
	.segmented + span {
		margin-top: 0.7rem;
	}
</style>
