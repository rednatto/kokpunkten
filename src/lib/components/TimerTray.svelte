<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { openTools } from '#lib/tools.svelte.ts';
	import { formatSeconds, isDone, secondsLeft, stopTimer, timers } from '#lib/timers.svelte.ts';

	const running = $derived(timers.filter((t) => !isDone(t)));
	const finished = $derived(timers.filter(isDone));
	const here = (recipeId: string | null) => page.params.id === recipeId;
</script>

{#if running.length}
	<!-- Running timers stay in the header on every page, linking back to their recipe, or to the timers tool. -->
	<nav class="tray" aria-label="Running timers">
		{#each running as t (t.key)}
			{#if t.recipeId}
				<a
					href={resolve('/r/[id]', { id: t.recipeId })}
					class="chip"
					aria-label="{t.title}, step {t.step}: {formatSeconds(secondsLeft(t))} left"
					title="{t.title}, step {t.step}"
				>
					⏱ <span class="step">{t.step}</span> · <span class="time">{formatSeconds(secondsLeft(t))}</span>
				</a>
			{:else}
				<button class="chip" onclick={() => openTools('timers')} aria-label="{t.title}: {formatSeconds(secondsLeft(t))} left" title={t.title}>
					⏱ <span class="time">{formatSeconds(secondsLeft(t))}</span>
				</button>
			{/if}
		{/each}
	</nav>
{/if}

{#if finished.length}
	<!-- Pinned banner so the alarm is visible on any page, wherever it is scrolled. -->
	<div class="alarm-banner" role="alert">
		{#each finished as t (t.key)}
			<div class="alarm">
				<span>
					⏰ {t.minutes} min timer done
					{#if t.recipeId}
						<small>
							{#if here(t.recipeId)}step {t.step}{:else}<a href={resolve('/r/[id]', { id: t.recipeId })}>{t.title}, step {t.step}</a>{/if}
						</small>
					{/if}
				</span>
				<button onclick={() => stopTimer(t.key)}>OK</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.tray {
		display: flex;
		gap: 0.35rem;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		justify-content: flex-end;
		padding: 0 0.5rem;
	}
	.chip {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 2.25rem;
		padding: 0 0.6rem;
		border-radius: 999px;
		border: 1px solid var(--accent);
		color: var(--accent);
		text-decoration: none;
		font-weight: 700;
		font-size: 0.9rem;
		background: transparent;
	}
	.time {
		font-variant-numeric: tabular-nums;
	}
	.step {
		font-weight: 400;
	}
	.alarm-banner {
		position: fixed;
		left: 0.75rem;
		right: 0.75rem;
		bottom: calc(0.75rem + env(safe-area-inset-bottom));
		z-index: 100;
		display: grid;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		background: var(--warn);
		color: #fff;
		font-size: 1.25rem;
		font-weight: 700;
		box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 0.35);
		animation: pulse 0.8s ease-in-out infinite alternate;
	}
	.alarm {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.alarm small {
		display: block;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.alarm a {
		color: inherit;
	}
	.alarm-banner button {
		flex: none;
		font-size: 1.1rem;
		font-weight: 700;
		padding: 0.6rem 1.4rem;
		border-radius: 0.5rem;
		border: 2px solid #fff;
		background: #fff;
		color: var(--warn);
	}
	@keyframes pulse {
		to {
			filter: brightness(1.35);
			box-shadow: 0 0.5rem 2.5rem rgb(0 0 0 / 0.5);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.alarm-banner {
			animation: none;
		}
	}
</style>
