import { slugify } from './import/vocabulary.ts';

/** Display names for the dishes in the built-in library, by dish slug. */
export const DISH_NAMES: Record<string, string> = {
	'spaghetti-carbonara': 'Spaghetti carbonara',
	'spaghetti-bolognese': 'Spaghetti bolognese (ragù)',
	lasagna: 'Lasagna',
	'margherita-pizza': 'Pizza margherita',
	risotto: 'Mushroom risotto',
	'pesto-pasta': 'Pasta with pesto',
	'cacio-e-pepe': 'Cacio e pepe',
	'aglio-e-olio': 'Spaghetti aglio e olio',
	minestrone: 'Minestrone',
	tiramisu: 'Tiramisu',
	'swedish-meatballs': 'Swedish meatballs (köttbullar)',
	'pytt-i-panna': 'Pytt i panna',
	kanelbullar: 'Cinnamon buns (kanelbullar)',
	'pea-soup': 'Yellow pea soup (ärtsoppa)',
	raggmunk: 'Potato pancakes (raggmunk)',
	gravlax: 'Gravlax',
	'janssons-frestelse': "Jansson's temptation",
	kladdkaka: 'Sticky chocolate cake (kladdkaka)',
	'swedish-pancakes': 'Swedish pancakes (pannkakor)',
	'fish-soup': 'Nordic fish soup',
	'chicken-curry': 'Chicken curry',
	'butter-chicken': 'Butter chicken',
	'chana-masala': 'Chana masala',
	dal: 'Dal',
	'pad-thai': 'Pad thai',
	'thai-green-curry': 'Thai green curry',
	'fried-rice': 'Fried rice',
	ramen: 'Ramen',
	'chicken-teriyaki': 'Chicken teriyaki',
	'kung-pao-chicken': 'Kung pao chicken',
	'mapo-tofu': 'Mapo tofu',
	bibimbap: 'Bibimbap',
	pho: 'Pho',
	dumplings: 'Pork dumplings',
	'sushi-rice': 'Sushi rice and maki',
	'beef-stir-fry': 'Beef and broccoli stir-fry',
	'miso-soup': 'Miso soup',
	'katsu-curry': 'Katsu curry',
	shakshuka: 'Shakshuka',
	hummus: 'Hummus',
	falafel: 'Falafel',
	moussaka: 'Moussaka',
	'greek-salad': 'Greek salad',
	tzatziki: 'Tzatziki',
	'chili-con-carne': 'Chili con carne',
	tacos: 'Beef tacos',
	guacamole: 'Guacamole',
	enchiladas: 'Chicken enchiladas',
	burrito: 'Burrito',
	'beef-burger': 'Beef burger',
	'mac-and-cheese': 'Macaroni and cheese',
	pancakes: 'American pancakes',
	'roast-chicken': 'Roast chicken',
	'mashed-potatoes': 'Mashed potatoes',
	'fried-chicken': 'Fried chicken',
	'caesar-salad': 'Caesar salad',
	'clam-chowder': 'Clam chowder',
	'banana-bread': 'Banana bread',
	'chocolate-chip-cookies': 'Chocolate chip cookies',
	brownies: 'Brownies',
	'apple-pie': 'Apple pie',
	cheesecake: 'Cheesecake',
	'french-onion-soup': 'French onion soup',
	'beef-bourguignon': 'Beef bourguignon',
	'coq-au-vin': 'Coq au vin',
	ratatouille: 'Ratatouille',
	'quiche-lorraine': 'Quiche lorraine',
	crepes: 'Crêpes',
	'croque-monsieur': 'Croque monsieur',
	'creme-brulee': 'Crème brûlée',
	paella: 'Paella',
	gazpacho: 'Gazpacho',
	'tortilla-espanola': 'Spanish tortilla',
	goulash: 'Goulash',
	schnitzel: 'Wiener schnitzel',
	'beef-stroganoff': 'Beef stroganoff',
	borscht: 'Borscht',
	'shepherds-pie': "Shepherd's pie",
	'fish-and-chips': 'Fish and chips',
	scones: 'Scones',
	'tomato-soup': 'Tomato soup',
	'pumpkin-soup': 'Pumpkin soup',
	'lentil-soup': 'Lentil soup',
	'chicken-noodle-soup': 'Chicken noodle soup',
	omelette: 'Omelette',
	'scrambled-eggs': 'Scrambled eggs',
	'potato-gratin': 'Potato gratin',
	'roast-potatoes': 'Roast potatoes',
	coleslaw: 'Coleslaw',
	vinaigrette: 'Vinaigrette',
	mayonnaise: 'Mayonnaise',
	bechamel: 'Béchamel sauce',
	'pizza-dough': 'Pizza dough',
	'sourdough-bread': 'Sourdough bread',
	focaccia: 'Focaccia',
	'pulled-pork': 'Pulled pork',
	'baked-salmon': 'Oven-baked salmon',
	'chicken-stock': 'Chicken stock',
	granola: 'Granola',
	'lemon-cake': 'Lemon drizzle cake'
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A plain name for a dish the library doesn't name, from its slug and its versions' titles, so a
 * dish added as "Easy weeknight chicken tikka masala (restaurant style)" is listed as "Chicken
 * tikka masala". The words of a title that spell the slug keep their accents ("Crème brûlée");
 * otherwise what the cook typed when asking for it, if it is the same dish, or else the slug itself.
 */
export function genericDishName(slug: string, titles: string[], typed = ''): string {
	for (const title of titles) {
		const words = title.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
		for (let start = 0; start < words.length; start++) {
			for (let end = start + 1; end <= words.length; end++) {
				const phrase = words.slice(start, end).join(' ');
				if (slugify(phrase) === slug) return capitalize(sentenceCase(phrase));
			}
		}
	}
	if (slugify(typed) === slug) return capitalize(typed.trim());
	return capitalize(slug.replaceAll('-', ' '));
}

/** "Chicken Tikka Masala" as "Chicken tikka masala", like the library's names; a title not in title case stays as written. */
function sentenceCase(phrase: string): string {
	const words = phrase.split(' ');
	const titleCase = words.length > 1 && words.every((w) => /^\p{Lu}/u.test(w) || /^(and|or|with|of|e|di|al|alla|con|de|la|le)$/.test(w));
	return titleCase ? words.map((w, i) => (i && /^\p{Lu}\p{Ll}*$/u.test(w) ? w.toLowerCase() : w)).join(' ') : phrase;
}

/** The name a dish is shown by: the cook's own name for it, the library's, or one made from its versions. */
export function dishName(slug: string, titles: string[], named?: Map<string, string>): string {
	return named?.get(slug) ?? DISH_NAMES[slug] ?? genericDishName(slug, titles);
}
