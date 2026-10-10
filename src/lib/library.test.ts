import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('every built-in library recipe passes the library rules', () => {
	const out = execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/validate-library.ts'], {
		encoding: 'utf8'
	});
	expect(out).toMatch(/files valid/);
});
