<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { liveQuery } from 'dexie';
	import UnitControls from '#lib/components/UnitControls.svelte';
	import { db, type StoredRecipe } from '#lib/db.ts';
	import { DISH_NAMES } from '#lib/dish-names.ts';
	import { showAmount } from '#lib/display.ts';
	import { amountRange, baseValue, closestVersion, diffRecipes, type DiffRow } from '#lib/recipe/diff.ts';
	import type { Amount } from '#lib/recipe/units.ts';
	import { settings } from '#lib/settings.svelte.ts';

	const dish = $derived(page.params.dish!);

	let rows = $state<StoredRecipe[] | undefined>(undefined);
	$effect(() => {
		const d = dish; // read here so the effect re-runs when the URL changes
		const sub = liveQuery(() => db.recipes.where('recipe.dish').equals(d).sortBy('addedAt')).subscribe({
			next: (r) => (rows = r),
			error: (e) => console.error(e)
		});
		return () => sub.unsubscribe();
	});

	let servings = $state<number | null>(null);
	const versions = $derived(rows?.map((r) => r.recipe) ?? []);
	const n = $derived(versions.length);
	const diff = $derived(n ? diffRecipes(versions, servings ?? versions[0].servings) : null);
	const label = (v: number) => rows?.[v]?.recipe.source.name?.replace(/^Kokpunkten – /, '') ?? versions[v]?.title ?? '';
	const roleName = (role: string) => role.charAt(0).toUpperCase() + role.slice(1).replaceAll('-', ' ');

	/** Shows an amount for a row, using the row's first real ingredient for rough measures. */
	function amount(row: DiffRow, a: Amount | null): string {
		if (!a) return '';
		const ing = row.ingredients.find((i) => i)!;
		return showAmount(ing, a).main;
	}
	const range = (row: DiffRow) => amount(row, amountRange(row.amounts) ?? row.amounts.find((a) => a) ?? null);

	// --- Merge view state: which option per slot, which extras are in.
	let picks = $state(new Map<string, string>());
	let extrasOn = $state<Set<string> | null>(null);
	const chosenExtras = $derived(extrasOn ?? new Set(diff?.extras.filter((r) => r.count > n / 2).map((r) => r.key)));
	const pickFor = (role: string) =>
		picks.get(role) ?? diff?.slots.find((s) => s.role === role)?.options.toSorted((a, b) => b.versions.length - a.versions.length)[0].row.key;
	const effectivePicks = $derived(new Map(diff?.slots.map((s) => [s.role, pickFor(s.role)!]) ?? []));
	const closest = $derived(diff ? closestVersion(diff, effectivePicks, chosenExtras) : 0);

	function pick(role: string, key: string) {
		picks = new Map(picks).set(role, key);
	}
	function toggleExtra(key: string) {
		const next = new Set(chosenExtras);
		if (!next.delete(key)) next.add(key);
		extrasOn = next;
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
		const added = diff.rows.filter((r) => r.ingredients[v] && !r.ingredients[base]);
		const removed = diff.rows.filter((r) => !r.ingredients[v] && r.ingredients[base]);
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

{#if rows === undefined}
	<p class="muted">Loading…</p>
{:else if !diff || n === 0}
	<p>No versions of this dish. <a href={resolve('/')}>Back to recipes</a></p>
{:else}
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
					<li><strong class="amount">{range(row)}</strong> {row.name}</li>
				{/each}
			</ul>

			{#if diff.slots.length}
				<h2>Pick one</h2>
				{#each diff.slots as slot (slot.role)}
					<div class="slot">
						<span class="muted small">{roleName(slot.role)}</span>
						<div class="row options">
							{#each slot.options as opt (opt.row.key)}
								{@const on = effectivePicks.get(slot.role) === opt.row.key}
								<button class="option" class:on aria-pressed={on} onclick={() => pick(slot.role, opt.row.key)}>
									<strong>{opt.row.name}</strong>
									<span class="small">{range(opt.row)}</span>
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
								<input type="checkbox" checked={chosenExtras.has(row.key)} onchange={() => toggleExtra(row.key)} />
								<span>
									<strong class="amount">{range(row)}</strong> {row.name}
									<span class="muted small">· {row.count} of {n}: {row.ingredients.flatMap((i, v) => (i ? [label(v)] : [])).join(', ')}</span>
								</span>
							</label>
						</li>
					{/each}
				</ul>
			{/if}

			<h2>Method</h2>
			<p class="muted small">
				From <strong>{label(closest)}</strong>, the version closest to your picks.
				<a href={resolve('/r/[id]', { id: rows[closest].id })}>Cook this version →</a>
			</p>
			<ol class="method">
				{#each versions[closest].steps as step (step.id)}
					<li>{step.text}</li>
				{/each}
			</ol>
		</section>
	{:else if settings.compareView === 'table'}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th class="first">Ingredient</th>
						{#each versions as _, v}
							<th><a href={resolve('/r/[id]', { id: rows[v].id })}>{label(v)}</a></th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each diff.rows as row (row.key)}
						<tr class:shared={row.count === n}>
							<th class="first" scope="row">
								{row.name}
								<span class="dots" aria-label="{row.count} of {n}">{'●'.repeat(row.count)}{'○'.repeat(n - row.count)}</span>
							</th>
							{#each row.amounts as a, v}
								<td class:none={!a}>{a ? amount(row, a) || '✓' : '—'}</td>
							{/each}
						</tr>
					{/each}
					<tr class="totals">
						<th class="first" scope="row">Total time</th>
						{#each versions as r}<td>{r.time.totalMin ? `${r.time.totalMin} min` : '—'}</td>{/each}
					</tr>
					<tr class="totals">
						<th class="first" scope="row">Steps</th>
						{#each versions as r}<td>{r.steps.length}</td>{/each}
					</tr>
				</tbody>
			</table>
		</div>
		<p class="muted small">● marks how many versions use an ingredient. Shared rows are bold. Amounts are for {diff.servings} servings.</p>
	{:else}
		<p class="muted small">Compare against:</p>
		<div class="row options">
			{#each versions as _, v}
				<button class="option" class:on={base === v} aria-pressed={base === v} onclick={() => (base = v)}><strong>{label(v)}</strong></button>
			{/each}
		</div>
		{#each versions as _, v}
			{#if v !== base}
				{@const changes = changesAgainst(v)}
				<section class="card changes">
					<h2><a href={resolve('/r/[id]', { id: rows[v].id })}>{label(v)}</a></h2>
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
	.first {
		position: sticky;
		left: -1rem;
		background: var(--bg);
		font-weight: 400;
		white-space: normal;
		min-width: 6.5rem;
		max-width: 8rem;
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
