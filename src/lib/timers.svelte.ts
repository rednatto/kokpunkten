/**
 * Step timers live here, outside any page, so a running timer keeps counting and
 * still rings when the cook opens another recipe to check something.
 */

export interface StepTimer {
	/** `${recipeId}:${stepId}` — one timer per step. */
	key: string;
	recipeId: string;
	/** Recipe title and step number, so the indicator can say which timer this is. */
	title: string;
	step: number;
	minutes: number;
	endsAt: number;
}

const KEY = 'kokpunkten.timers';

// How long the alarm keeps ringing if nobody taps OK.
const RING_SECONDS = 60;
const VIBRATION = [500, 200, 500, 200, 500, 800];

/** Started timers, running or finished-and-ringing, in start order. */
export const timers = $state<StepTimer[]>(load());
/** Current time, ticking while any timer exists. */
export const clock = $state({ now: Date.now() });

export const timerKey = (recipeId: string, stepId: string) => `${recipeId}:${stepId}`;
export const secondsLeft = (t: StepTimer) => Math.max(0, Math.round((t.endsAt - clock.now) / 1000));
export const isDone = (t: StepTimer) => clock.now >= t.endsAt;
export const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function startTimer(t: Omit<StepTimer, 'key' | 'endsAt'> & { stepId: string }) {
	unlockAudio();
	const key = timerKey(t.recipeId, t.stepId);
	const next: StepTimer = {
		key,
		recipeId: t.recipeId,
		title: t.title,
		step: t.step,
		minutes: t.minutes,
		endsAt: Date.now() + Math.round(t.minutes * 60) * 1000
	};
	rang.delete(key);
	const i = timers.findIndex((x) => x.key === key);
	if (i >= 0) timers[i] = next;
	else timers.push(next);
	changed();
}

export function stopTimer(key: string) {
	const i = timers.findIndex((x) => x.key === key);
	if (i >= 0) timers.splice(i, 1);
	rang.delete(key);
	changed();
}

function load(): StepTimer[] {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(saved) ? saved : [];
	} catch {
		return [];
	}
}

function save() {
	try {
		localStorage.setItem(KEY, JSON.stringify(timers));
	} catch {
		// Private mode or storage full: timers still run, they just won't survive a reload.
	}
}

// Keys of timers whose alarm has already started, so each finished timer rings once.
const rang = new Set<string>();
let tick: ReturnType<typeof setInterval> | undefined;

function changed() {
	save();
	clock.now = Date.now();
	if (timers.length && !tick) tick = setInterval(update, 250);
	if (!timers.length) {
		clearInterval(tick);
		tick = undefined;
	}
	update();
}

function update() {
	clock.now = Date.now();
	let ringing = false;
	for (const t of timers) {
		if (!isDone(t)) continue;
		ringing = true;
		if (!rang.has(t.key)) {
			rang.add(t.key);
			alarm();
		}
	}
	if (!ringing) silence();
}

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
	if (!alarmOut && !buzz) return;
	alarmOut?.disconnect();
	alarmOut = undefined;
	clearInterval(buzz);
	buzz = undefined;
	navigator.vibrate?.(0);
}

function alarm() {
	silence();
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

// Timers saved before a reload pick up where they left off.
if (typeof window !== 'undefined' && timers.length) changed();
