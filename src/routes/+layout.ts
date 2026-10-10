// Recipes live in IndexedDB on the device, so pages render in the browser only.
export const ssr = false;
// Only the shell is generated; the 404.html fallback boots the client router on any path.
export const prerender = false;
