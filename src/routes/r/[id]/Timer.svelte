<script lang="ts">
	import { formatMinutes } from '#lib/display.ts';
	import { formatSeconds, isDone, secondsLeft, startTimer, stopTimer, timerKey, timers } from '#lib/timers.svelte.ts';

	let {
		recipeId,
		stepId,
		title,
		step,
		minutes,
		maxMinutes
	}: { recipeId: string; stepId: string; title: string; step: number; minutes: number; maxMinutes?: number | null } = $props();

	// The timer itself lives app-wide, so it keeps running when this page is left.
	const timer = $derived(timers.find((t) => t.key === timerKey(recipeId, stepId)));
	const finished = $derived(timer !== undefined && isDone(timer));
</script>

<div class="timer" class:running={timer && !finished} class:finished>
	{#if !timer}
		<button class="ghost small" onclick={() => startTimer({ recipeId, stepId, title, step, minutes })}>⏱ {formatMinutes(minutes, maxMinutes)}</button>
	{:else}
		<span class="time" aria-live="assertive">{finished ? 'Done!' : formatSeconds(secondsLeft(timer))}</span>
		<button class="ghost small" onclick={() => stopTimer(timer.key)}>{finished ? 'OK' : 'Stop'}</button>
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
	.finished {
		padding: 0.2rem 0.6rem;
		border-radius: 0.5rem;
		animation: flash 0.8s steps(1) infinite;
	}
	.finished .time {
		font-size: 1.6rem;
	}
	@keyframes flash {
		0% {
			background: var(--warn);
			color: #fff;
		}
		50% {
			background: transparent;
			color: var(--warn);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.finished {
			animation: none;
			background: var(--warn);
			color: #fff;
		}
	}
</style>
