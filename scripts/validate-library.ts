// Validates the built-in recipe library: node --experimental-strip-types scripts/validate-library.ts [files...]
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { recipeSchema } from '../src/lib/recipe/schema.ts';

const dir = join(import.meta.dirname, '../src/lib/library');
const files = process.argv.length > 2 ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));

let failed = 0;
for (const file of files) {
	const dish = basename(file, '.json');
	const problems: string[] = [];
	let data: unknown;
	try {
		data = JSON.parse(readFileSync(file, 'utf8'));
	} catch (e) {
		problems.push(`invalid JSON: ${(e as Error).message}`);
	}
	if (data !== undefined) {
		if (!Array.isArray(data) || data.length < 2 || data.length > 4) problems.push('must be an array of 2–4 versions');
		const titles = new Set<string>();
		(Array.isArray(data) ? data : []).forEach((item, n) => {
			const res = recipeSchema.safeParse(item);
			if (!res.success) {
				for (const i of res.error.issues) problems.push(`version ${n + 1} ${i.path.join('.')}: ${i.message}`);
				return;
			}
			const r = res.data;
			if (r.dish !== dish) problems.push(`version ${n + 1}: dish "${r.dish}" must match file name "${dish}"`);
			if (titles.has(r.title)) problems.push(`version ${n + 1}: duplicate title "${r.title}"`);
			titles.add(r.title);
			if (r.source.type !== 'ai-generated') problems.push(`version ${n + 1}: source.type must be "ai-generated"`);
			const used = new Set(r.steps.flatMap((s) => s.uses));
			for (const ing of r.ingredients) if (!used.has(ing.id)) problems.push(`version ${n + 1}: ingredient ${ing.id} (${ing.name}) is not used by any step`);
			if (r.ingredients.some((i) => !i.role)) problems.push(`version ${n + 1}: every ingredient needs a role`);
		});
	}
	if (problems.length) {
		failed++;
		console.log(`✗ ${basename(file)}\n  ${problems.join('\n  ')}`);
	}
}
console.log(`${files.length - failed}/${files.length} files valid`);
process.exit(failed ? 1 : 0);
