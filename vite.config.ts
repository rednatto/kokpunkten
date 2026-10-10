import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// A static single-page app: GitHub Pages serves 404.html for every unknown path,
			// and the client router takes it from there.
			adapter: adapter({ fallback: '404.html' }),
			// GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH.
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		})
	]
});
