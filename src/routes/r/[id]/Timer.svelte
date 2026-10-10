<script lang="ts">
	import { onDestroy } from 'svelte';

	let { minutes }: { minutes: number } = $props();

	let endsAt = $state<number | null>(null);
	let now = $state(Date.now());
	let tick: ReturnType<typeof setInterval> | undefined;

	const total = $derived(Math.round(minutes * 60));
	const left = $derived(endsAt === null ? total : Math.max(0, Math.round((endsAt - now) / 1000)));
	const finished = $derived(endsAt !== null && left === 0);

	function start() {
		endsAt = Date.now() + total * 1000;
		now = Date.now();
		clearInterval(tick);
		tick = setInterval(() => {
			now = Date.now();
			if (endsAt !== null && now >= endsAt) {
				clearInterval(tick);
				navigator.vibrate?.([300, 150, 300, 150, 300]);
			}
		}, 250);
	}

	function reset() {
		clearInterval(tick);
		endsAt = null;
	}

	onDestroy(() => clearInterval(tick));

	const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<div class="timer" class:running={endsAt !== null && !finished} class:finished>
	{#if endsAt === null}
		<button class="ghost small" onclick={start}>⏱ {minutes} min</button>
	{:else}
		<span class="time" aria-live="polite">{finished ? 'Done!' : fmt(left)}</span>
		<button class="ghost small" onclick={reset}>{finished ? 'OK' : 'Stop'}</button>
	{/if}
</div>

<style>
	.timer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.time {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		font-size: 1.2rem;
	}
	.finished .time {
		color: var(--warn);
	}
</style>
