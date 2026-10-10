<script lang="ts">
	import { onDestroy } from 'svelte';

	let { minutes }: { minutes: number } = $props();

	let endsAt = $state<number | null>(null);
	let now = $state(Date.now());
	let tick: ReturnType<typeof setInterval> | undefined;

	const total = $derived(Math.round(minutes * 60));
	const left = $derived(endsAt === null ? total : Math.max(0, Math.round((endsAt - now) / 1000)));
	const finished = $derived(endsAt !== null && left === 0);

	// How long the alarm keeps ringing if nobody taps OK.
	const RING_SECONDS = 60;
	const VIBRATION = [500, 200, 500, 200, 500, 800];

	// The AudioContext is created on the Start tap: mobile browsers only allow
	// sound from a context that was unlocked by a user gesture.
	let audio: AudioContext | undefined;
	let alarmOut: GainNode | undefined;
	let buzz: ReturnType<typeof setInterval> | undefined;

	function unlockAudio() {
		try {
			audio ??= new AudioContext();
			void audio.resume();
		} catch {
			audio = undefined;
		}
	}

	/** Schedules RING_SECONDS of loud two-tone beeping on the audio clock. */
	function ring() {
		if (!audio) return;
		void audio.resume();
		silence();
		// A compressor lets the beeps sit close to full scale without clipping.
		const comp = audio.createDynamicsCompressor();
		comp.threshold.value = -6;
		comp.ratio.value = 12;
		comp.connect(audio.destination);
		alarmOut = audio.createGain();
		alarmOut.gain.value = 1;
		alarmOut.connect(comp);

		const t0 = audio.currentTime + 0.05;
		// Pattern per second: three short beeps alternating in pitch, then a pause.
		for (let s = 0; s < RING_SECONDS; s++) {
			for (let b = 0; b < 3; b++) {
				beep(t0 + s + b * 0.2, b % 2 === 0 ? 1760 : 2350, 0.14);
			}
		}
	}

	function beep(at: number, freq: number, len: number) {
		if (!audio || !alarmOut) return;
		const osc = audio.createOscillator();
		const env = audio.createGain();
		osc.type = 'square';
		osc.frequency.value = freq;
		env.gain.setValueAtTime(0, at);
		env.gain.linearRampToValueAtTime(0.9, at + 0.005);
		env.gain.setValueAtTime(0.9, at + len - 0.01);
		env.gain.linearRampToValueAtTime(0, at + len);
		osc.connect(env).connect(alarmOut);
		osc.start(at);
		osc.stop(at + len);
	}

	function silence() {
		alarmOut?.disconnect();
		alarmOut = undefined;
		clearInterval(buzz);
		buzz = undefined;
		navigator.vibrate?.(0);
	}

	function alarm() {
		ring();
		// Keep vibrating for as long as the sound rings.
		navigator.vibrate?.(VIBRATION);
		let n = 0;
		const period = VIBRATION.reduce((a, b) => a + b, 0);
		buzz = setInterval(() => {
			if (++n * period >= RING_SECONDS * 1000) {
				clearInterval(buzz);
				return;
			}
			navigator.vibrate?.(VIBRATION);
		}, period);
	}

	function start() {
		unlockAudio();
		silence();
		endsAt = Date.now() + total * 1000;
		now = Date.now();
		clearInterval(tick);
		tick = setInterval(() => {
			now = Date.now();
			if (endsAt !== null && now >= endsAt) {
				clearInterval(tick);
				alarm();
			}
		}, 250);
	}

	function reset() {
		clearInterval(tick);
		silence();
		endsAt = null;
	}

	onDestroy(() => {
		clearInterval(tick);
		silence();
		void audio?.close();
	});

	const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<div class="timer" class:running={endsAt !== null && !finished} class:finished>
	{#if endsAt === null}
		<button class="ghost small" onclick={start}>⏱ {minutes} min</button>
	{:else}
		<span class="time" aria-live="assertive">{finished ? 'Done!' : fmt(left)}</span>
		<button class="ghost small" onclick={reset}>{finished ? 'OK' : 'Stop'}</button>
	{/if}
</div>

{#if finished}
	<!-- Pinned banner so the alarm is visible wherever the page is scrolled. -->
	<div class="alarm-banner" role="alert">
		<span>⏰ {minutes} min timer done</span>
		<button onclick={reset}>OK</button>
	</div>
{/if}

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
	.alarm-banner {
		position: fixed;
		left: 0.75rem;
		right: 0.75rem;
		bottom: calc(0.75rem + env(safe-area-inset-bottom));
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		background: var(--warn);
		color: #fff;
		font-size: 1.25rem;
		font-weight: 700;
		box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 0.35);
		animation: pulse 0.8s ease-in-out infinite alternate;
	}
	.alarm-banner button {
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
		.finished,
		.alarm-banner {
			animation: none;
		}
		.finished {
			background: var(--warn);
			color: #fff;
		}
	}
</style>
