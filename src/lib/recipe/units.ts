import type { Ingredient, Unit } from './schema';

export const MASS_G: Partial<Record<Unit, number>> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
export const VOLUME_ML: Partial<Record<Unit, number>> = {
	ml: 1,
	cl: 10,
	dl: 100,
	l: 1000,
	krm: 1,
	tsp: 5,
	tbsp: 15,
	cup: 240,
	'fl-oz': 29.5735
};
/** Units that are already metric-friendly and read better left alone. */
const SPOONS = new Set<Unit>(['krm', 'tsp', 'tbsp']);
const IMPERIAL = new Set<Unit>(['oz', 'lb', 'cup', 'fl-oz']);

export interface Amount {
	qty: number | null;
	qtyMax: number | null;
	unit: Unit | null;
}

export function scaleAmount(a: Amount, factor: number): Amount {
	return {
		unit: a.unit,
		qty: a.qty == null ? null : a.qty * factor,
		qtyMax: a.qtyMax == null ? null : a.qtyMax * factor
	};
}

/** Convert imperial units to g / ml and pick a readable metric unit. Spoons and counts stay. */
export function toMetric(a: Amount): Amount {
	const u = a.unit;
	if (!u || !IMPERIAL.has(u)) return a;
	const base = MASS_G[u] ?? VOLUME_ML[u]!;
	const isMass = u in MASS_G;
	const ref = (a.qty ?? a.qtyMax ?? 0) * base;
	const [target, div]: [Unit, number] = isMass
		? ref >= 1000
			? ['kg', 1000]
			: ['g', 1]
		: ref >= 1000
			? ['l', 1000]
			: ref >= 100
				? ['dl', 100]
				: ['ml', 1];
	const conv = (q: number | null) => (q == null ? null : (q * base) / div);
	return { unit: target, qty: conv(a.qty), qtyMax: conv(a.qtyMax) };
}

/** After scaling, 1500 g reads better as 1.5 kg and 0.5 dl as 50 ml. */
export function normalizeMetric(a: Amount): Amount {
	const u = a.unit;
	if (!u || IMPERIAL.has(u) || SPOONS.has(u)) return a;
	const ref = a.qty ?? a.qtyMax;
	if (ref == null) return a;
	if (u in MASS_G) {
		const g = ref * MASS_G[u]!;
		return rescale(a, MASS_G[u]!, g >= 1000 ? ['kg', 1000] : ['g', 1]);
	}
	if (u in VOLUME_ML) {
		const ml = ref * VOLUME_ML[u]!;
		return rescale(a, VOLUME_ML[u]!, ml >= 1000 ? ['l', 1000] : ml >= 100 ? ['dl', 100] : ['ml', 1]);
	}
	return a;
}

function rescale(a: Amount, base: number, [unit, div]: [Unit, number]): Amount {
	const conv = (q: number | null) => (q == null ? null : (q * base) / div);
	return { unit, qty: conv(a.qty), qtyMax: conv(a.qtyMax) };
}

const FRACTIONS: [number, string][] = [
	[1 / 8, '⅛'],
	[1 / 4, '¼'],
	[1 / 3, '⅓'],
	[1 / 2, '½'],
	[2 / 3, '⅔'],
	[3 / 4, '¾']
];

export type NumberStyle = 'fraction' | 'decimal';
export type UnitSystem = 'original' | 'metric' | 'us' | 'rough';

const COUNTS = new Set<Unit>(['piece', 'clove', 'can', 'bunch', 'pinch']);

/** Counts and spoons read best as fractions (unless decimals are asked for); weights and volumes as rounded decimals. */
export function formatQty(q: number, unit: Unit | null, numbers: NumberStyle = 'fraction'): string {
	const small = !unit || SPOONS.has(unit) || unit === 'cup' || COUNTS.has(unit);
	if (small && numbers === 'fraction') {
		const whole = Math.floor(q);
		const rest = q - whole;
		if (rest < 0.12) return String(whole || q.toFixed(2).replace(/0+$/, ''));
		if (rest > 0.88) return String(whole + 1);
		const [, sym] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
		return whole ? `${whole} ${sym}` : sym;
	}
	if (q >= 100) return String(Math.round(q / 5) * 5);
	if (q >= 10) return String(Math.round(q));
	if (q >= 1) return String(Math.round(q * 10) / 10);
	return String(Math.round(q * 100) / 100);
}

const UNIT_LABEL: Partial<Record<Unit, string>> = {
	piece: '',
	'to-taste': 'to taste',
	'fl-oz': 'fl oz'
};

export function formatAmount(a: Amount, numbers: NumberStyle = 'fraction'): string {
	if (a.unit === 'to-taste') return 'to taste';
	if (a.qty == null) return '';
	const unit = a.unit ? (UNIT_LABEL[a.unit] ?? a.unit) : '';
	const qty = formatQty(a.qty, a.unit, numbers) + (a.qtyMax != null ? `–${formatQty(a.qtyMax, a.unit, numbers)}` : '');
	return unit ? `${qty} ${unit}` : qty;
}

/** Convert metric weights and volumes to US customary units. Spoons and counts stay. */
export function toUS(a: Amount): Amount {
	const u = a.unit;
	if (!u || SPOONS.has(u) || IMPERIAL.has(u)) return a;
	const ref = a.qty ?? a.qtyMax;
	if (ref == null) return a;
	if (u in MASS_G) {
		const g = ref * MASS_G[u]!;
		return rescale(a, MASS_G[u]!, g >= 454 ? ['lb', MASS_G.lb!] : ['oz', MASS_G.oz!]);
	}
	if (u in VOLUME_ML) {
		const ml = ref * VOLUME_ML[u]!;
		return rescale(a, VOLUME_ML[u]!, ml >= 60 ? ['cup', 240] : ml >= 15 ? ['tbsp', 15] : ['tsp', 5]);
	}
	return a;
}

export function convert(a: Amount, system: Exclude<UnitSystem, 'rough'>): Amount {
	if (system === 'metric') return normalizeMetric(toMetric(a));
	if (system === 'us') return toUS(a);
	return normalizeMetric(a);
}

export function ingredientAmount(ing: Ingredient, factor: number): Amount {
	return scaleAmount({ qty: ing.qty ?? null, qtyMax: ing.qtyMax ?? null, unit: ing.unit ?? null }, factor);
}

export function displayAmount(ing: Ingredient, factor: number, system: Exclude<UnitSystem, 'rough'> = 'metric', numbers: NumberStyle = 'fraction'): string {
	return formatAmount(convert(ingredientAmount(ing, factor), system), numbers);
}
