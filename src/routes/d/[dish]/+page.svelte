<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { liveQuery } from 'dexie';
	import UnitControls from '#lib/components/UnitControls.svelte';
	import { addRecipes, db, type StoredRecipe } from '#lib/db.ts';
	import { DISH_NAMES } from '#lib/dish-names.ts';
	import { showAmount } from '#lib/display.ts';
	import { baseValue, closestTo, diffRecipes, fromBase, rowMean, rowRange, rowValues, seasonedInSteps, type DiffRow, type DiffSlot } from '#lib/recipe/diff.ts';
	import { familyName } from '#lib/recipe/families.ts';
	import { versionLabels, versionSource } from '#lib/recipe/labels.ts';
	import { mixRecipe, type AmountSource } from '#lib/recipe/mix.ts';
	import { tableTree, type TreeGroup } from '#lib/recipe/table-tree.ts';
	import type { Amount } from '#lib/recipe/units.ts';
	import { settings } from '#lib/settings.svelte.ts';

	const dish = $derived(page.params.dish!);

	let rows = $state<StoredRecipe[] | undefined>(undefined);
	let loadError = $state('');
	$effect(() => {
		const d = dish; // read here so the effect re-runs when the URL changes
		const sub = liveQuery(() => db.recipes.where('recipe.dish').equals(d).sortBy('addedAt')).subscribe({
			next: (r) => ((rows = r), (loadError = '')),
			error: (e: Error) => {
				console.error(e);
				loadError = `${e.name}: ${e.message}`;
			}
		});
		return () => sub.unsubscribe();
	});

	let servings = $state<number | null>(null);
	const versions = $derived(rows?.map((r) => r.recipe) ?? []);
	const n = $derived(versions.length);
	const diff = $derived(n ? diffRecipes(versions, servings ?? versions[0].servings) : null);
	const labels = $derived(versionLabels(versions));
	const label = (v: number) => labels[v] ?? '';
	/** Where a version comes from, for a second line under its name. */
	const sourceOf = (v: number) => (versions[v] ? versionSource(versions[v]) : null);
	/** "about 4×" for a version whose amounts are all off from the others by about that much. */
	const offScale = (v: number) => {
		const f = diff?.offScale[v];
		if (f == null) return null;
		return f > 1 ? `about ${Math.round(f)}× the others` : `about 1/${Math.round(1 / f)} of the others`;
	};
	const roleName = (role: string) => role.charAt(0).toUpperCase() + role.slice(1).replaceAll('-', ' ');

	/** Shows an amount for a row, using the row's first real ingredient for rough measures. */
	function amount(row: DiffRow, a: Amount | null): string {
		if (!a) return '';
		const ing = row.ingredients.find((i) => i)!;
		return showAmount(ing, a).main;
	}
	/** An amount in one unit for a whole row; anything under an eighth of a teaspoon reads as a pinch. */
	function rowAmount(row: DiffRow, a: Amount): string {
		const pinch = (q: number | null) => a.unit === 'tsp' && q != null && q < 0.125;
		if (!pinch(a.qty)) return amount(row, a);
		if (a.qtyMax == null || pinch(a.qtyMax)) return 'a pinch';
		return `a pinch – ${amount(row, { ...a, qty: a.qtyMax, qtyMax: null })}`;
	}
	/**
	 * The spread across versions in one unit (0.25–2 tsp), with any amount that can't be
	 * converted after it (1 lemon or 2 tbsp juice), else each distinct amount.
	 */
	function range(row: DiffRow): string {
		const r = rowRange(row);
		const left = r ? row.amounts.filter((a, v) => a?.qty != null && rowValues(row)!.values[v] == null && !row.outliers.includes(v)) : row.amounts;
		const others = [...new Set(left.map((a) => amount(row, a)).filter(Boolean))];
		return [r ? rowAmount(row, r) : '', ...others].filter(Boolean).join(' or ');
	}
	/** The version's own name for a row's ingredient, when it differs from the row name (kosher salt in a salt row). */
	const variantName = (row: DiffRow, v: number) => {
		const name = row.ingredients[v]?.name;
		return name && name.toLowerCase() !== row.name.toLowerCase() ? name : null;
	};
	/** Amounts far from the rest, with the version that uses each: they are left out of the range and the average. */
	const outliers = (row: DiffRow) => (row.outliers.length < row.count ? row.outliers.map((v) => ({ v, text: amount(row, row.amounts[v]) })) : []);
	const variants = (row: DiffRow) => [...new Set(row.ingredients.map((_, v) => variantName(row, v)).filter(Boolean))];

	// Where "back" goes: the recipe the cook came from, else the first version.
	const backId = $derived(page.url.searchParams.get('from') ?? rows?.[0]?.id);
	const backLabel = $derived(rows && backId ? (label(rows.findIndex((r) => r.id === backId)) || 'recipe') : 'recipe');

	// --- Table view: a tree of groups; supporting ingredients start folded.
	const tree = $derived(diff ? tableTree(diff) : []);
	let flipped = $state(new Set<string>());
	const isOpen = (g: TreeGroup) => g.basic === flipped.has(g.id);
	function flip(id: string) {
		const next = new Set(flipped);
		if (!next.delete(id)) next.add(id);
		flipped = next;
	}
	/** What a folded group shows per version: the names of the members it uses. */
	const usedIn = (g: TreeGroup, v: number) => g.leaves.flatMap((l) => l.row.ingredients[v]?.name ?? []).join(', ');
	/** How many versions use something: dots for a few versions, a count for many, so it never spills into the next column. */
	const uses = (count: number) => (n <= 6 ? `${'●'.repeat(count)}${'○'.repeat(n - count)}` : `${count} of ${n}`);

	/** The average amount, or each distinct amount when they can't be averaged. */
	function average(row: DiffRow): string {
		const mean = rowMean(row);
		return mean ? rowAmount(row, mean) : range(row);
	}

	// Rows whose spread of amounts is open, by key.
	let spreadOpen = $state(new Set<string>());
	function toggleSpread(key: string) {
		const next = new Set(spreadOpen);
		if (!next.delete(key)) next.add(key);
		spreadOpen = next;
	}
	/** Where each version's amount sits between the smallest and largest, and how many use each amount. */
	function spread(row: DiffRow) {
		const r = rowValues(row);
		const points = r ? r.values.flatMap((value, v) => (value == null ? [] : [{ v, value }])) : [];
		const comparable = points.length > 1;
		const values = points.map((p) => p.value);
		const [min, max] = [Math.min(...values), Math.max(...values)];
		const pct = (x: number) => (max === min ? 50 : ((x - min) / (max - min)) * 100);
		// The average line sits where the average column says: outliers left out.
		const typical = rowValues({ ...row, amounts: row.amounts.map((a, v) => (row.outliers.includes(v) && row.outliers.length < row.count ? null : a)) })?.values.filter((x) => x != null) ?? [];
		const typicalMean = typical.length ? typical.reduce((s, x) => s + x!, 0) / typical.length : null;
		// Both ends in the unit the whole range reads in.
		const ends = comparable ? fromBase(r!.dim, min, max) : null;
		const byText = Map.groupBy(
			row.amounts.flatMap((a, v) => (a ? [{ v, text: amount(row, a) || 'to taste', value: r?.values[v] ?? Infinity, far: row.outliers.includes(v) }] : [])),
			(b) => b.text
		);
		return {
			comparable,
			points: comparable ? points.map((p) => ({ v: p.v, pct: pct(p.value), far: row.outliers.includes(p.v) })) : [],
			meanPct: comparable && typicalMean != null ? pct(typicalMean) : null,
			low: comparable ? rowAmount(row, { ...ends!, qtyMax: null }) : '',
			high: comparable ? rowAmount(row, { ...ends!, qty: ends!.qtyMax ?? ends!.qty, qtyMax: null }) : '',
			buckets: [...byText]
				.map(([text, list]) => ({ text, count: list.length, value: list[0].value, far: list.every((b) => b.far), who: list.map((b) => label(b.v)).join(', ') }))
				.sort((a, b) => a.value - b.value)
		};
	}

	// --- The mix: which rows to cook with, and where each amount comes from (a version, or the
	// average). Until the cook changes anything it is the version closest to the most common
	// choices, with average amounts, so it starts out as a real recipe. Merge and Table share it.
	let chosenEdit = $state<Map<string, AmountSource> | null>(null);
	const defaultChosen = $derived.by(() => {
		if (!diff) return new Map<string, AmountSource>();
		const likely = new Set([
			...diff.common.map((r) => r.key),
			...diff.slots.map((s) => s.options.toSorted((a, b) => b.versions.length - a.versions.length)[0].row.key),
			...diff.extras.filter((r) => r.count > n / 2).map((r) => r.key)
		]);
		const v = closestTo(diff, likely);
		return new Map(diff.rows.filter((r) => r.ingredients[v]).map((r) => [r.key, 'average' as AmountSource]));
	});
	const chosen = $derived(chosenEdit ?? defaultChosen);
	const closest = $derived(diff ? closestTo(diff, new Set(chosen.keys())) : 0);

	function editChosen(change: (m: Map<string, AmountSource>) => void) {
		const next = new Map(chosen);
		change(next);
		chosenEdit = next;
	}
	/** Puts a row in the mix with an amount from `from`; choosing the same again takes it out. */
	function choose(key: string, from: AmountSource) {
		editChosen((m) => (m.get(key) === from ? m.delete(key) : m.set(key, from)));
	}
	function toggleRow(key: string) {
		editChosen((m) => (m.has(key) ? m.delete(key) : m.set(key, 'average')));
	}
	/** Picks one option of a slot; picking it again leaves the slot empty, since not every version has one. */
	function pickOption(slot: DiffSlot, key: string) {
		editChosen((m) => {
			const was = m.has(key);
			for (const o of slot.options) m.delete(o.row.key);
			if (!was) m.set(key, 'average');
		});
	}
	const rowByKey = $derived(new Map(diff?.rows.map((r) => [r.key, r]) ?? []));
	const amountsMode = $derived(
		[...chosen.values()].every((f) => f === 'average')
			? 'average'
			: [...chosen].every(([k, f]) => f === closest || (f === 'average' && !rowByKey.get(k)?.ingredients[closest]))
				? 'base'
				: 'mixed'
	);
	function setAllAmounts(mode: 'average' | 'base') {
		editChosen((m) => {
			for (const k of m.keys()) m.set(k, mode === 'base' && rowByKey.get(k)?.ingredients[closest] ? closest : 'average');
		});
	}

	let saving = $state(false);
	let mixError = $state('');
	const mixed = $derived.by(() => {
		if (!diff || !chosen.size) return { mix: null, error: '' };
		try {
			const mix = mixRecipe(diff, {
				rows: chosen,
				base: closest,
				labels: versions.map((_, v) => label(v)),
				title: `${DISH_NAMES[dish] ?? versions[0].title} – my mix`
			});
			return { mix, error: '' };
		} catch (e) {
			console.error(e);
			return { mix: null, error: `Couldn't put this mix together (${(e as Error).message.slice(0, 120)}). Try another combination.` };
		}
	});
	const mix = $derived(mixed.mix);
	async function cookMix() {
		if (!mix || saving) return;
		saving = true;
		mixError = '';
		try {
			// Saving waits behind any other write to the database; don't leave the button grey forever.
			const timeout = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('saving took too long; the recipe database may be busy or held by an older copy of the app')), 8000)
			);
			const [id] = await Promise.race([addRecipes([mix.recipe]), timeout]);
			const href = resolve('/r/[id]', { id });
			// A full page load if the in-app navigation fails (an app update can leave this page's code stale).
			await goto(href).catch(() => location.assign(href));
		} catch (e) {
			console.error(e);
			mixError = `Couldn't save the mix (${(e as Error).message.slice(0, 120)}).`;
		} finally {
			saving = false;
		}
	}

	// --- Changes view: one version as the base, the others described against it.
	let base = $state(0);
	interface Change {
		kind: 'add' | 'remove' | 'swap' | 'more' | 'less';
		text: string;
	}
	function changesAgainst(v: number): Change[] {
		if (!diff) return [];
		const out: Change[] = [];
		// Salt and pepper "to taste" in a step count as there, though the ingredient list leaves them out.
		const added = diff.rows.filter((r) => r.ingredients[v] && !r.ingredients[base] && !seasonedInSteps(versions[base], r));
		const removed = diff.rows.filter((r) => !r.ingredients[v] && r.ingredients[base] && !seasonedInSteps(versions[v], r));
		for (const add of [...added]) {
			const swap = removed.find((r) => r.role === add.role);
			if (swap) {
				out.push({ kind: 'swap', text: `${add.ingredients[v]!.name} instead of ${swap.ingredients[base]!.name}` });
				added.splice(added.indexOf(add), 1);
				removed.splice(removed.indexOf(swap), 1);
			}
		}
		for (const r of added) out.push({ kind: 'add', text: `${amount(r, r.amounts[v])} ${r.ingredients[v]!.name}`.trim() });
		for (const r of removed) out.push({ kind: 'remove', text: r.ingredients[base]!.name });
		for (const r of diff.rows) {
			const a = baseValue(r.amounts[v]);
			const b = baseValue(r.amounts[base]);
			if (!a || !b || a.dim !== b.dim || b.value === 0) continue;
			const ratio = a.value / b.value;
			if (ratio > 1.25 || ratio < 0.8)
				out.push({
					kind: ratio > 1 ? 'more' : 'less',
					text: `${r.ingredients[v]!.name}: ${amount(r, r.amounts[v])} (vs ${amount(r, r.amounts[base])})`
				});
		}
		const t = versions[v].time.totalMin;
		const tb = versions[base].time.totalMin;
		if (t && tb && Math.abs(t - tb) >= 10) out.push({ kind: t > tb ? 'more' : 'less', text: `Total time ${t} min (vs ${tb})` });
		return out;
	}
	const SIGN: Record<Change['kind'], string> = { add: '+', remove: '−', swap: '⇄', more: '↑', less: '↓' };
</script>

{#snippet far(row: DiffRow)}
	{#each outliers(row) as o (o.v)}
		{' '}<span class="far-note" title="Far from the other versions, so left out of the range and the average">· {o.text} in {label(o.v)}</span>
	{/each}
{/snippet}

{#if loadError}
	<p class="error" role="alert">Couldn't read the recipes ({loadError}).</p>
	<button class="small" onclick={() => location.reload()}>Reload</button>
{:else if rows === undefined}
	<p class="muted">Loading…</p>
{:else if !diff || n === 0}
	<p>No versions of this dish. <a href={resolve('/')}>Back to recipes</a></p>
{:else}
	{#if backId}
		<a class="back" href={resolve('/r/[id]', { id: backId })}>← Back to {backLabel}</a>
	{/if}
	<h1>{DISH_NAMES[dish] ?? versions[0].title}</h1>
	<p class="muted meta">Comparing {n} versions: {versions.map((_, v) => label(v)).join(' · ')}</p>

	<div class="row controls">
		<div class="row stepper" aria-label="Servings">
			<button class="ghost small" onclick={() => (servings = Math.max(1, diff.servings - 1))} aria-label="Fewer servings">−</button>
			<span><strong>{diff.servings}</strong> servings</span>
			<button class="ghost small" onclick={() => (servings = diff.servings + 1)} aria-label="More servings">+</button>
		</div>
		<UnitControls />
	</div>

	<div class="tabs" role="tablist" aria-label="Comparison design">
		{#each [['merge', 'Merge'], ['table', 'Table'], ['changes', 'Changes']] as const as [value, name]}
			<button role="tab" aria-selected={settings.compareView === value} class:active={settings.compareView === value} onclick={() => (settings.compareView = value)}>{name}</button>
		{/each}
	</div>

	{#if settings.compareView === 'merge'}
		<section>
			<h2>All {n} use</h2>
			<ul class="plain">
				{#each diff.common as row (row.key)}
					<li>
						<label class="row extra">
							<input type="checkbox" checked={chosen.has(row.key)} onchange={() => toggleRow(row.key)} />
							<span>
								<strong class="amount">{range(row)}</strong> {row.name}
								{#if variants(row).length}<span class="muted small">({variants(row).join(', ')})</span>{/if}
								{@render far(row)}
							</span>
						</label>
					</li>
				{/each}
			</ul>

			{#if diff.slots.length}
				<h2>Pick one, or none</h2>
				<p class="muted small">Not every version has one of each. Tap a picked option again to leave it out.</p>
				{#each diff.slots as slot (slot.role)}
					<div class="slot">
						<span class="muted small">{roleName(slot.role)}</span>
						<div class="row options">
							{#each slot.options as opt (opt.row.key)}
								{@const on = chosen.has(opt.row.key)}
								<button class="option" class:on aria-pressed={on} onclick={() => pickOption(slot, opt.row.key)}>
									<strong>{opt.row.name}</strong>
									<span class="small">{range(opt.row)}{@render far(opt.row)}</span>
									<span class="small who">{opt.versions.map(label).join(', ')}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			{/if}

			{#if diff.extras.length}
				<h2>Some add</h2>
				<ul class="plain">
					{#each diff.extras as row (row.key)}
						<li>
							<label class="row extra">
								<input type="checkbox" checked={chosen.has(row.key)} onchange={() => toggleRow(row.key)} />
								<span>
									<strong class="amount">{range(row)}</strong> {row.name}
									{@render far(row)}
									<span class="muted small">· {row.count} of {n}: {row.ingredients.flatMap((i, v) => (i ? [label(v)] : [])).join(', ')}</span>
								</span>
							</label>
						</li>
					{/each}
				</ul>
			{/if}

			<h2>Your mix</h2>
			<p class="muted small">
				Follows <strong>{label(closest)}</strong>, the version closest to your picks, with your choices swapped in.
				Ingredients it doesn't have go into the step that handles the same things, or bring their own step from another version.
			</p>
			<div class="row amounts" role="radiogroup" aria-label="Amounts">
				<span class="small muted">Amounts:</span>
				<button class="ghost small" class:on={amountsMode === 'average'} aria-pressed={amountsMode === 'average'} onclick={() => setAllAmounts('average')}>Average of all</button>
				<button class="ghost small" class:on={amountsMode === 'base'} aria-pressed={amountsMode === 'base'} onclick={() => setAllAmounts('base')}>As in {label(closest)}</button>
				{#if amountsMode === 'mixed'}<span class="small muted">mixed, picked in the table</span>{/if}
			</div>
			{#if mix}
				<ol class="method">
					{#each mix.steps as step (step.id)}
						<li>
							{step.text}
							{#if step.from}<span class="tag borrowed">from {step.from}</span>{/if}
							{#if step.changed}<span class="tag changed">{step.changed}</span>{/if}
						</li>
					{/each}
				</ol>
			{/if}
			{#if mixed.error || mixError}<p class="error" role="alert">{mixed.error || mixError}</p>{/if}
			<div class="row cook">
				<button onclick={cookMix} disabled={saving || !mix}>{saving ? 'Saving…' : 'Cook this mix →'}</button>
				<a href={resolve('/r/[id]', { id: rows[closest].id })}>or {label(closest)} as written</a>
			</div>
			<p class="muted small">Cooking the mix saves it as your own version of the dish, so you can rate it, note changes, or delete it.</p>
		</section>
	{:else if settings.compareView === 'table'}
		<p class="muted small">Tap an amount to cook with it, or the average. Tap a name to see how the amounts spread.</p>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th class="first">Ingredient</th>
						<th class="avg">Average</th>
						{#each versions as _, v}
							<th>
								<a href={resolve('/r/[id]', { id: rows[v].id })}>{label(v)}</a>
								{#if sourceOf(v)}<span class="source">{sourceOf(v)}</span>{/if}
								{#if offScale(v)}<span class="source warn" title="Its amounts are left out of the averages where they stand out. Its servings may be wrong.">Amounts {offScale(v)}</span>{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each tree as g (g.id)}
						{@const open = !g.title || isOpen(g)}
						{#if g.basic && g.id === tree.find((t) => t.basic)?.id}
							<tr class="section"><th class="first" scope="rowgroup" colspan={n + 2}>Basics</th></tr>
						{/if}
						{#if g.title}
							<tr class="group">
								<th class="first" scope="rowgroup">
									<button class="fold" aria-expanded={open} onclick={() => flip(g.id)}>{open ? '▾' : '▸'} {g.title}</button>
									<span class="dots" aria-label="{g.count} of {n}">{uses(g.count)}</span>
								</th>
								<td class="avg"></td>
								{#each versions as _, v}
									<td class:none={!usedIn(g, v)}>{open ? '' : usedIn(g, v) || '—'}</td>
								{/each}
							</tr>
						{/if}
						{#if open}
							{#each g.leaves as { row, subs } (row.key)}
								{@const from = chosen.get(row.key)}
								<tr class:shared={row.count === n} class:child={!!g.title}>
									<th class="first" scope="row">
										<button class="name" aria-expanded={spreadOpen.has(row.key)} onclick={() => toggleSpread(row.key)}>
											{subs.length ? familyName(row.key) : row.name}
										</button>
										<span class="dots" aria-label="{row.count} of {n}">{uses(row.count)}</span>
									</th>
									<td class="avg">
										<button class="cell" class:picked={from === 'average'} aria-pressed={from === 'average'} onclick={() => choose(row.key, 'average')}>{average(row)}</button>
									</td>
									{#each row.amounts as a, v}
										<td class:none={!a}>
											{#if subs.length}{''}{:else if a}
												{@const isFar = row.outliers.includes(v)}
												<button class="cell" class:picked={from === v} class:far={isFar} aria-pressed={from === v} title={isFar ? 'Far from the other versions; left out of the average' : undefined} onclick={() => choose(row.key, v)}>{amount(row, a) || '✓'}</button>
											{:else}—{/if}
										</td>
									{/each}
								</tr>
								{#if spreadOpen.has(row.key)}
									{@const sp = spread(row)}
									<tr class="spread">
										<td colspan={n + 2}>
											{#if sp.comparable}
												<div class="strip" aria-hidden="true">
													{#each sp.points as p (p.v)}<span class="pt" class:far={p.far} style:left="{p.pct}%" title={label(p.v)}></span>{/each}
													{#if sp.meanPct !== null}<span class="mean" style:left="{sp.meanPct}%"></span>{/if}
												</div>
												<div class="ends small muted"><span>{sp.low}</span><span>average {average(row)}</span><span>{sp.high}</span></div>
											{/if}
											<ul class="buckets">
												{#each sp.buckets as b (b.text)}
													<li title={b.who} class:far={b.far}><strong>{b.text}</strong> × {b.count} <span class="muted">{b.who}</span>{#if b.far}<span class="far-note"> · far from the others, not averaged</span>{/if}</li>
												{/each}
											</ul>
										</td>
									</tr>
								{/if}
								{#each subs as sub (sub.name)}
									<tr class="sub" class:child={!!g.title}>
										<th class="first" scope="row">{sub.name}</th>
										<td class="avg"></td>
										{#each row.amounts as a, v}
											<td class:none={!sub.versions.includes(v)}>
												{#if sub.versions.includes(v) && a}
													<button class="cell" class:picked={from === v} aria-pressed={from === v} onclick={() => choose(row.key, v)}>{amount(row, a) || '✓'}</button>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							{/each}
						{/if}
					{/each}
					<tr class="totals">
						<th class="first" scope="row">Total time</th>
						<td class="avg"></td>
						{#each versions as r}<td>{r.time.totalMin ? `${r.time.totalMin} min` : '—'}</td>{/each}
					</tr>
					<tr class="totals">
						<th class="first" scope="row">Steps</th>
						<td class="avg"></td>
						{#each versions as r}<td>{r.steps.length}</td>{/each}
					</tr>
				</tbody>
			</table>
		</div>
		<p class="muted small">{n <= 6 ? '● marks' : 'The count under a name says'} how many versions use an ingredient. Shared rows are bold. Amounts are for {diff.servings} servings.</p>
		<div class="mixbar">
			<span class="small">
				<strong>{chosen.size}</strong> picked · follows {label(closest)}
				<button class="link" onclick={() => (settings.compareView = 'merge')}>see the method</button>
			</span>
			{#if mixed.error || mixError}<span class="small error" role="alert">{mixed.error || mixError}</span>{/if}
			<button class="small" onclick={cookMix} disabled={saving || !mix}>{saving ? 'Saving…' : 'Cook this mix →'}</button>
		</div>
	{:else}
		<p class="muted small">Compare against:</p>
		<div class="row options">
			{#each versions as _, v}
				<button class="option" class:on={base === v} aria-pressed={base === v} onclick={() => (base = v)}>
					<strong>{label(v)}</strong>
					{#if sourceOf(v)}<span class="small who">{sourceOf(v)}</span>{/if}
				</button>
			{/each}
		</div>
		{#each versions as _, v}
			{#if v !== base}
				{@const changes = changesAgainst(v)}
				<section class="card changes">
					<h2><a href={resolve('/r/[id]', { id: rows[v].id })}>{label(v)}</a></h2>
					{#if sourceOf(v)}<p class="muted small source-line">{sourceOf(v)}</p>{/if}
					{#if offScale(v)}<p class="small warn">Its amounts are {offScale(v)}, so its servings may be wrong.</p>{/if}
					{#if changes.length}
						<ul class="plain">
							{#each changes as c}
								<li class="change {c.kind}"><span class="sign" aria-hidden="true">{SIGN[c.kind]}</span> {c.text}</li>
							{/each}
						</ul>
					{:else}
						<p class="muted">Same ingredients and amounts as {label(base)}.</p>
					{/if}
				</section>
			{/if}
		{/each}
	{/if}
{/if}

<style>
	.back {
		display: inline-block;
		margin-bottom: 0.25rem;
		font-size: 0.9rem;
	}
	.amounts {
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}
	.amounts .on {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.tag {
		display: inline-block;
		margin-left: 0.3rem;
		padding: 0 0.45rem;
		border-radius: 1rem;
		font-size: 0.75rem;
		border: 1px solid var(--line);
	}
	.tag.borrowed {
		border-color: var(--warn);
		color: var(--warn);
	}
	.tag.changed {
		border-color: var(--accent);
		color: var(--accent);
	}
	.cook {
		gap: 0.75rem;
		align-items: center;
		margin-top: 0.75rem;
	}
	.meta {
		margin: 0 0 0.75rem;
	}
	.controls {
		justify-content: space-between;
		gap: 0.75rem;
	}
	.stepper {
		gap: 0.75rem;
	}
	.stepper button {
		width: 2.5rem;
		padding: 0;
		font-size: 1.2rem;
	}
	.tabs {
		display: flex;
		margin: 1rem 0 0.5rem;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		overflow: hidden;
	}
	.tabs button {
		flex: 1;
		border: none;
		border-radius: 0;
		background: transparent;
		color: var(--fg);
		font-weight: 500;
	}
	.tabs button.active {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.plain {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.plain li {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
	}
	.amount {
		margin-right: 0.25rem;
	}
	.small {
		font-size: 0.85rem;
	}
	.slot {
		margin-bottom: 0.75rem;
	}
	.options {
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.option {
		flex-direction: column;
		align-items: flex-start;
		gap: 0;
		height: auto;
		padding: 0.4rem 0.7rem;
		background: transparent;
		color: var(--fg);
		border-color: var(--line);
		font-weight: 400;
		text-align: left;
	}
	.option.on {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.option.on strong {
		color: var(--accent);
	}
	.who {
		color: var(--muted);
	}
	.extra {
		flex-wrap: nowrap;
		align-items: flex-start;
	}
	.extra input {
		width: 1.2rem;
		height: 1.2rem;
		flex: none;
		margin-top: 0.2rem;
		accent-color: var(--accent);
	}
	.method {
		padding-left: 1.4rem;
	}
	.method li {
		margin-bottom: 0.4rem;
	}
	.table-wrap {
		overflow-x: auto;
		margin: 0 -1rem;
		padding: 0 1rem;
	}
	table {
		border-collapse: collapse;
		font-size: 0.9rem;
		min-width: 100%;
	}
	th,
	td {
		padding: 0.4rem 0.4rem;
		border-bottom: 1px solid var(--line);
		text-align: left;
		vertical-align: top;
		white-space: nowrap;
	}
	thead th {
		font-size: 0.8rem;
		white-space: normal;
		min-width: 4.5rem;
	}
	thead a {
		color: inherit;
	}
	thead th:has(.source) {
		min-width: 7.5rem;
	}
	.first {
		position: sticky;
		left: -1rem;
		background: var(--bg);
		font-weight: 400;
		white-space: normal;
		min-width: 6.5rem;
		max-width: 8rem;
	}
	td.avg,
	th.avg {
		background: color-mix(in srgb, var(--accent) 5%, var(--bg));
	}
	.cell,
	.name,
	.link {
		all: unset;
		cursor: pointer;
	}
	.cell {
		display: inline-block;
		padding: 0.1rem 0.35rem;
		margin: -0.1rem -0.35rem;
		border-radius: 0.4rem;
		border: 1px solid transparent;
	}
	.cell:hover {
		border-color: var(--line);
	}
	.cell.picked {
		background: var(--accent);
		color: var(--accent-fg);
	}
	.name {
		text-decoration: underline dotted var(--muted);
		text-underline-offset: 3px;
	}
	.link {
		color: var(--accent);
		text-decoration: underline;
	}
	tr.spread td {
		white-space: normal;
		background: var(--surface);
		padding: 0.6rem 0.8rem;
	}
	.strip {
		position: relative;
		height: 1rem;
		margin: 0.25rem 0.4rem;
		max-width: 18rem;
		border-bottom: 2px solid var(--line);
	}
	.pt,
	.mean {
		position: absolute;
		bottom: -0.35rem;
		width: 0.6rem;
		height: 0.6rem;
		margin-left: -0.3rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--accent) 55%, transparent);
	}
	.mean {
		width: 2px;
		height: 1.1rem;
		margin-left: -1px;
		border-radius: 0;
		background: var(--warn);
	}
	.ends {
		display: flex;
		justify-content: space-between;
		max-width: 19rem;
		margin-top: 0.4rem;
	}
	.buckets {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0 0;
		display: grid;
		gap: 0.2rem;
		font-size: 0.8rem;
	}
	.error {
		color: #b3261e;
	}
	.far-note,
	.warn {
		color: var(--warn);
	}
	.far-note {
		font-size: 0.85rem;
		font-weight: 400;
	}
	.cell.far:not(.picked) {
		color: var(--warn);
		text-decoration: underline wavy;
		text-underline-offset: 3px;
	}
	.pt.far {
		background: var(--warn);
	}
	.source {
		display: block;
		font-weight: 400;
		font-size: 0.7rem;
		color: var(--muted);
	}
	.source.warn {
		color: var(--warn);
	}
	.source-line {
		margin: 0 0 0.25rem;
	}
	.mixbar {
		position: sticky;
		bottom: calc(env(safe-area-inset-bottom) + 0.5rem);
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 0.75rem;
		box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
	}
	.fold {
		all: unset;
		cursor: pointer;
		font-weight: 600;
	}
	tr.group td {
		white-space: normal;
		max-width: 7rem;
	}
	tr.group th,
	tr.group td {
		background: color-mix(in srgb, var(--accent) 7%, var(--bg));
		font-size: 0.8rem;
		color: var(--muted);
	}
	tr.group .first {
		color: var(--fg);
	}
	tr.section .first {
		position: static;
		padding-top: 1rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	tr.child .first {
		padding-left: 1rem;
	}
	tr.sub .first {
		padding-left: 1.6rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	tr.sub.child .first {
		padding-left: 2.2rem;
	}
	tr.shared .first {
		font-weight: 700;
	}
	.dots {
		display: block;
		font-size: 0.6rem;
		letter-spacing: 1px;
		color: var(--accent);
	}
	td.none {
		color: var(--done);
	}
	.totals th,
	.totals td {
		color: var(--muted);
	}
	.changes {
		margin-top: 0.75rem;
	}
	.changes h2 {
		margin: 0 0 0.25rem;
	}
	.change {
		display: flex;
		gap: 0.5rem;
	}
	.sign {
		width: 1.2rem;
		flex: none;
		font-weight: 700;
		text-align: center;
	}
	.add .sign,
	.more .sign {
		color: var(--accent);
	}
	.remove .sign,
	.less .sign {
		color: var(--warn);
	}
</style>
