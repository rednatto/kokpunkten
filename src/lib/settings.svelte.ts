import type { NumberStyle, UnitSystem } from './recipe/units.ts';

export interface Settings {
	units: UnitSystem;
	numbers: NumberStyle;
	/** Which comparison design to show for several versions of a dish. */
	compareView: 'merge' | 'table' | 'changes';
	/** Which diagram design to show for a recipe's steps. */
	diagramView: 'flow' | 'timeline' | 'tree';
	/** Show each step's whole text in the diagram instead of a short label. */
	diagramFull: boolean;
	/** Show how much of each ingredient goes in at each step, in the step list and the diagram. */
	stepAmounts: boolean;
}

const KEY = 'kokpunkten.settings';
const defaults: Settings = { units: 'metric', numbers: 'fraction', compareView: 'merge', diagramView: 'flow', diagramFull: false, stepAmounts: true };

function load(): Settings {
	try {
		return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
	} catch {
		return { ...defaults };
	}
}

/** Display preferences, remembered on this device. */
export const settings = $state<Settings>(load());

$effect.root(() => {
	$effect(() => {
		const json = JSON.stringify(settings);
		try {
			localStorage.setItem(KEY, json);
		} catch {
			// Private mode or storage full: the setting just won't stick.
		}
	});
});
