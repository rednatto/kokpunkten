<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import KitchenHelp from '#lib/components/KitchenHelp.svelte';
	import { settings } from '#lib/settings.svelte.ts';
	import { formatSeconds, isDone, secondsLeft, startKitchenTimer, stopTimer, timers } from '#lib/timers.svelte.ts';
	import { closeTools, registerToolsDialog, tools, type ToolsTab } from '#lib/tools.svelte.ts';
	import { canKeepAwake, toggleAwake, wake } from '#lib/wake.svelte.ts';

	const TABS: [ToolsTab, string][] = [
		['swaps', 'Swaps'],
		['weights', 'Weights'],
		['units', 'Units'],
		['timers', 'Timers']
	];
	const UNITS = [
		['original', 'As written'],
		['metric', 'Metric'],
		['us', 'US cups'],
		['rough', 'Rough']
	] as const;
	const PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];

	let dialog = $state<HTMLDialogElement>();
	$effect(() => {
		registerToolsDialog(dialog);
		return () => registerToolsDialog(undefined);
	});

	let minutes = $state<number | null>(null);
	function start(m: number | null) {
		if (!m || m <= 0) return;
		startKitchenTimer(m);
		minutes = null;
	}
</script>

<dialog bind:this={dialog} class="tools" closedby="any" aria-label="Kitchen tools">
	<div class="head">
		<div class="row top">
			{#if canKeepAwake()}
				<button class="ghost small" class:on={wake.awake} aria-pressed={wake.awake} onclick={toggleAwake}>☀ {wake.awake ? 'Screen stays on' : 'Keep screen on'}</button>
			{/if}
			<button class="ghost small close" onclick={closeTools} aria-label="Close">✕</button>
		</div>
		<div class="tabs" role="tablist" aria-label="Kitchen tools">
			{#each TABS as [value, name] (value)}
				<button role="tab" aria-selected={tools.tab === value} class:active={tools.tab === value} onclick={() => (tools.tab = value)}>
					{name}{#if value === 'timers' && timers.length}&nbsp;<span class="count">{timers.length}</span>{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- Swaps and weights share one search box, so it stays mounted while another tab is open. -->
	<div hidden={tools.tab !== 'swaps' && tools.tab !== 'weights'}>
		<KitchenHelp tab={tools.tab === 'weights' ? 'weights' : 'swaps'} recipes={tools.recipes} scope={tools.scope || undefined} />
	</div>

	{#if tools.tab === 'units'}
		<h3 id="tools-units">Units</h3>
		<div class="segmented vertical" role="radiogroup" aria-labelledby="tools-units">
			{#each UNITS as [value, name] (value)}
				<label><input type="radio" name="tools-units" {value} bind:group={settings.units} />{name}</label>
			{/each}
		</div>
		<h3 id="tools-numbers">Numbers</h3>
		<div class="segmented" role="radiogroup" aria-labelledby="tools-numbers">
			<label><input type="radio" name="tools-numbers" value="fraction" bind:group={settings.numbers} />½ fractions</label>
			<label><input type="radio" name="tools-numbers" value="decimal" bind:group={settings.numbers} />0.5 decimals</label>
		</div>
		<p class="muted small">Applies to every recipe and comparison on this device.</p>
	{:else if tools.tab === 'timers'}
		{#if timers.length}
			<ul class="timers">
				{#each timers as t (t.key)}
					{@const done = isDone(t)}
					<li class:done>
						<span class="what">
							{#if t.recipeId}
								{#if page.params.id === t.recipeId}{t.title}{:else}<a href={resolve('/r/[id]', { id: t.recipeId })} onclick={closeTools}>{t.title}</a>{/if}
								<span class="muted small">step {t.step}</span>
							{:else}
								{t.title}
							{/if}
						</span>
						<span class="time">{done ? 'Done!' : formatSeconds(secondsLeft(t))}</span>
						<button class="ghost small" onclick={() => stopTimer(t.key)}>{done ? 'OK' : 'Stop'}</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">No timers running. Start one from a recipe step, or here.</p>
		{/if}
		<h3>New timer</h3>
		<div class="presets">
			{#each PRESETS as m (m)}
				<button class="ghost small" onclick={() => start(m)}>{m} min</button>
			{/each}
		</div>
		<form class="row custom" onsubmit={(e) => (e.preventDefault(), start(minutes))}>
			<input type="number" inputmode="decimal" min="0.5" step="any" bind:value={minutes} placeholder="Minutes" aria-label="Minutes" />
			<button class="small" disabled={!minutes || minutes <= 0}>Start</button>
		</form>
	{/if}
</dialog>

<style>
	/* Pinned near the top, so switching tabs doesn't make the dialog jump. */
	.tools {
		margin: calc(env(safe-area-inset-top) + 0.75rem) auto auto;
		width: min(40rem, calc(100vw - 1rem));
		max-height: calc(100dvh - env(safe-area-inset-top) - 1.5rem);
		padding: 0 1rem 1.5rem;
		border: 1px solid var(--line);
		border-radius: 0.8rem;
		background: var(--bg);
		color: var(--fg);
	}
	.tools::backdrop {
		background: rgb(0 0 0 / 0.45);
	}
	.head {
		position: sticky;
		top: 0;
		z-index: 1;
		margin: 0 -1rem;
		padding: 0.75rem 1rem 0.25rem;
		background: var(--bg);
	}
	.top {
		justify-content: space-between;
	}
	.close {
		margin-left: auto;
	}
	.tabs {
		display: flex;
		margin: 0.5rem 0;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		overflow: hidden;
	}
	.tabs button {
		flex: 1;
		padding: 0 0.25rem;
		justify-content: center;
		font-weight: 500;
		border: none;
		border-radius: 0;
		background: transparent;
		color: var(--fg);
	}
	.tabs button.active {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.count {
		font-size: 0.75rem;
		font-weight: 700;
		min-width: 1.2rem;
		padding: 0 0.3rem;
		border-radius: 1rem;
		background: var(--accent);
		color: var(--accent-fg);
	}
	.active .count {
		background: var(--accent-fg);
		color: var(--accent);
	}
	h3 {
		font-size: 1rem;
		margin: 1rem 0 0.4rem;
	}
	.segmented {
		width: 100%;
	}
	.timers {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
	}
	.timers li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.what {
		flex: 1;
		min-width: 0;
	}
	.what .small {
		display: block;
	}
	.time {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		font-size: 1.2rem;
	}
	.done .time {
		color: var(--warn);
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
		gap: 0.4rem;
	}
	.custom {
		margin-top: 0.6rem;
		flex-wrap: nowrap;
	}
	.custom input {
		flex: 1;
	}
</style>
