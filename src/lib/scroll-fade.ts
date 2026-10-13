/**
 * Marks a sideways-scrolling element with the class `more` while content is hidden past its right edge,
 * so CSS can fade that edge and show there is more to scroll to.
 */
export function scrollFade(node: HTMLElement) {
	const update = () => node.classList.toggle('more', node.scrollLeft + node.clientWidth < node.scrollWidth - 2);
	const sizes = new ResizeObserver(update);
	sizes.observe(node);
	if (node.firstElementChild) sizes.observe(node.firstElementChild);
	node.addEventListener('scroll', update, { passive: true });
	update();
	return {
		destroy() {
			sizes.disconnect();
			node.removeEventListener('scroll', update);
		}
	};
}
