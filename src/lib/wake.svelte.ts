/**
 * Keeps the screen on while cooking, where the browser supports it. The choice is app-wide,
 * so the screen stays on while the cook checks another recipe. Browsers drop the lock when
 * the tab is hidden; it is taken again when the cook comes back.
 */

export const wake = $state({ wanted: false, awake: false });

export const canKeepAwake = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

let lock: WakeLockSentinel | null = null;

export async function toggleAwake() {
	wake.wanted = !wake.wanted;
	if (wake.wanted) await acquire();
	else await lock?.release();
}

async function acquire() {
	if (lock || !canKeepAwake()) return;
	try {
		lock = await navigator.wakeLock.request('screen');
		wake.awake = true;
		lock.addEventListener('release', () => {
			lock = null;
			wake.awake = false;
		});
	} catch {
		wake.awake = false;
		wake.wanted = false;
	}
}

if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && wake.wanted) void acquire();
	});
}
