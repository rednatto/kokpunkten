import { ingredientMatches, parseTerm } from '../recipe/ingredient-search.ts';
import type { Recipe } from '../recipe/schema.ts';

export interface Swap {
	/** What to use instead, with the amount for the amount in `Swappable.per`. */
	use: string;
	/** What changes in the dish, or how to do it. */
	note?: string;
}

export interface Swappable {
	name: string;
	/** Other names a cook might type, Swedish included. */
	aka?: string[];
	/** The amount the swaps are given for, e.g. "1 dl". */
	per?: string;
	/** Courses the swaps work for, when not every dish: egg replacers suit a cake, not a carbonara. */
	courses?: string[];
	swaps: Swap[];
}

/**
 * Common kitchen replacements, best first. Amounts are for the `per` amount of the
 * original. Sticks to swaps that keep the dish working, not exact copies of the taste.
 */
export const SWAPS: Swappable[] = [
	{
		name: 'Buttermilk',
		aka: ['kärnmjölk', 'filmjölk'],
		per: '1 dl',
		swaps: [
			{ use: '1 dl milk + 1 tbsp lemon juice or white vinegar', note: 'Stir and let stand 5–10 minutes until it thickens slightly.' },
			{ use: '½ dl plain yogurt + ½ dl milk' },
			{ use: '1 dl filmjölk', note: 'Close enough in baking and batters.' }
		]
	},
	{
		name: 'Egg (in baking)',
		aka: ['egg', 'ägg'],
		per: '1 egg',
		courses: ['baking', 'dessert'],
		swaps: [
			{ use: '1 tbsp ground flaxseed + 3 tbsp water', note: 'Rest 5 minutes until gel-like. Binds, does not lift.' },
			{ use: '½ mashed banana or ½ dl apple sauce', note: 'Moisture and binding, adds sweetness. Denser crumb.' },
			{ use: '3 tbsp aquafaba (chickpea water)', note: 'Whips like egg white; best for meringue and mousse.' }
		]
	},
	{
		name: 'Butter',
		aka: ['smör'],
		per: '100 g',
		swaps: [
			{ use: '80 ml neutral oil', note: 'Butter is about 80 % fat. Cakes get moister; no creaming, so less rise.' },
			{ use: '100 g margarine or plant butter', note: 'Works 1:1, also for laminating and creaming.' },
			{ use: '100 g ghee', note: 'Higher smoke point, nuttier, no water.' }
		]
	},
	{
		name: 'Heavy cream',
		aka: ['cream', 'vispgrädde', 'grädde', 'double cream'],
		per: '1 dl',
		swaps: [
			{ use: '75 ml milk + 25 g melted butter', note: 'For sauces and baking. Will not whip.' },
			{ use: '1 dl full-fat coconut milk', note: 'Whips if chilled overnight; tastes of coconut.' },
			{ use: '1 dl matlagningsgrädde (cooking cream)', note: 'Less fat, less rich, still holds up to boiling.' }
		]
	},
	{
		name: 'Sour cream',
		aka: ['gräddfil', 'smetana'],
		per: '1 dl',
		swaps: [
			{ use: '1 dl Greek or Turkish yogurt', note: 'Tangier and leaner. Stir in off the heat or it splits.' },
			{ use: '1 dl crème fraîche', note: 'Richer, and safe to boil.' }
		]
	},
	{
		name: 'Crème fraîche',
		aka: ['creme fraiche'],
		per: '1 dl',
		swaps: [
			{ use: '1 dl sour cream (gräddfil)', note: 'Less fat, so it can split if boiled.' },
			{ use: '1 dl mascarpone + a squeeze of lemon', note: 'Richer.' }
		]
	},
	{
		name: 'Milk',
		aka: ['mjölk'],
		per: '1 dl',
		swaps: [
			{ use: '1 dl oat, soy or almond drink', note: 'Unsweetened. Soy behaves most like milk in sauces.' },
			{ use: '½ dl cream + ½ dl water' },
			{ use: '½ dl evaporated milk + ½ dl water' }
		]
	},
	{
		name: 'Plain yogurt',
		aka: ['yoghurt', 'yogurt', 'yoghurt naturell', 'turkisk yoghurt'],
		per: '1 dl',
		swaps: [
			{ use: '1 dl sour cream or filmjölk' },
			{ use: '1 dl buttermilk', note: 'Thinner; for marinades and batters.' }
		]
	},
	{
		name: 'Ricotta',
		per: '100 g',
		swaps: [
			{ use: '100 g cottage cheese, blended smooth', note: 'Drain first; slightly saltier.' },
			{ use: '100 g kvarg (quark)' }
		]
	},
	{
		name: 'Mascarpone',
		per: '100 g',
		swaps: [
			{ use: '75 g cream cheese + 25 g heavy cream, beaten together' },
			{ use: '100 g full-fat crème fraîche', note: 'Tangier and softer.' }
		]
	},
	{
		name: 'Cream cheese',
		aka: ['färskost', 'philadelphia'],
		per: '100 g',
		swaps: [
			{ use: '100 g mascarpone', note: 'Richer, less tangy.' },
			{ use: '100 g strained Greek yogurt or kvarg', note: 'Leaner; cheesecakes set softer.' }
		]
	},
	{
		name: 'Parmesan',
		aka: ['parmigiano', 'parmesan cheese', 'parmesanost'],
		per: '30 g',
		swaps: [
			{ use: '30 g grana padano', note: 'Milder and cheaper.' },
			{ use: '30 g pecorino romano', note: 'Saltier and sharper; salt the dish less.' },
			{ use: '30 g aged västerbotten or prästost' }
		]
	},
	{
		name: 'Pecorino romano',
		aka: ['pecorino'],
		per: '30 g',
		swaps: [{ use: '30 g parmesan + a pinch of salt', note: 'Milder, less sheepy.' }]
	},
	{
		name: 'Guanciale',
		per: '100 g',
		swaps: [
			{ use: '100 g pancetta', note: 'Leaner; the usual swap in carbonara and amatriciana.' },
			{ use: '100 g thick-cut unsmoked bacon (sidfläsk)' }
		]
	},
	{
		name: 'Baking powder',
		aka: ['bakpulver'],
		per: '1 tsp',
		swaps: [
			{ use: '¼ tsp baking soda + ½ tsp cream of tartar' },
			{ use: '¼ tsp baking soda + ½ dl buttermilk or yogurt', note: 'Take ½ dl of other liquid out of the recipe.' }
		]
	},
	{
		name: 'Baking soda',
		aka: ['bicarbonate of soda', 'bikarbonat', 'natron'],
		per: '1 tsp',
		swaps: [{ use: '3 tsp baking powder', note: 'Less browning, and leaves a slightly salty taste. Only where the recipe also has acid.' }]
	},
	{
		name: 'Self-raising flour',
		aka: ['self rising flour'],
		per: '1 dl',
		swaps: [{ use: '1 dl all-purpose flour + ½ tsp baking powder + a pinch of salt' }]
	},
	{
		name: 'Cake flour',
		per: '1 dl',
		swaps: [{ use: '1 dl all-purpose flour, take out 1 tbsp and add 1 tbsp cornstarch', note: 'Sift twice. Less gluten, softer crumb.' }]
	},
	{
		name: 'Bread flour',
		aka: ['vetemjöl special', 'strong flour'],
		per: '1 dl',
		swaps: [{ use: '1 dl all-purpose flour', note: 'Less gluten: slightly softer, flatter loaf. Reduce water a little.' }]
	},
	{
		name: 'Cornstarch',
		aka: ['cornflour', 'majsstärkelse', 'maizena'],
		per: '1 tbsp',
		swaps: [
			{ use: '1 tbsp potato starch (potatismjöl)', note: 'Thickens the same; add off the boil or it goes stringy.' },
			{ use: '2 tbsp all-purpose flour', note: 'Cook a few minutes longer; sauce turns cloudy, not glossy.' }
		]
	},
	{
		name: 'Fresh yeast',
		aka: ['jäst', 'färsk jäst'],
		per: '25 g',
		swaps: [{ use: '7 g dry yeast (1 packet, about 2 ¼ tsp)', note: 'Instant yeast goes straight in with the flour; active dry is woken in warm liquid first.' }]
	},
	{
		name: 'Dry yeast',
		aka: ['torrjäst', 'instant yeast'],
		per: '7 g',
		swaps: [{ use: '25 g fresh yeast', note: 'Crumble into lukewarm liquid (about 37 °C).' }]
	},
	{
		name: 'Gelatine',
		aka: ['gelatin', 'gelatinblad', 'gelatin sheets'],
		per: '1 sheet (about 2 g)',
		swaps: [
			{ use: '⅔ tsp powdered gelatine' },
			{ use: '¼ tsp agar powder', note: 'Must boil to set, sets firmer and also at room temperature.' }
		]
	},
	{
		name: 'Brown sugar',
		aka: ['farinsocker', 'muscovado'],
		per: '1 dl',
		swaps: [{ use: '1 dl sugar + 1 tbsp molasses or dark syrup (mörk sirap)', note: 'Or just white sugar: crisper, paler, less chewy.' }]
	},
	{
		name: 'Caster sugar',
		aka: ['superfine sugar'],
		per: '1 dl',
		swaps: [{ use: '1 dl sugar, a few seconds in a blender' }]
	},
	{
		name: 'Icing sugar',
		aka: ['powdered sugar', 'florsocker', 'confectioners sugar'],
		per: '1 dl',
		swaps: [{ use: '½ dl sugar + ½ tsp cornstarch, blended to a fine powder' }]
	},
	{
		name: 'Sugar',
		aka: ['socker', 'white sugar'],
		per: '1 dl (85 g)',
		swaps: [
			{ use: '¾ dl honey or maple syrup', note: 'Cut other liquid by ¼ dl and bake 10 °C cooler; browns faster.' },
			{ use: '1 dl brown sugar', note: 'Moister and chewier, with caramel notes.' }
		]
	},
	{
		name: 'Honey',
		aka: ['honung'],
		per: '1 tbsp',
		swaps: [{ use: '1 tbsp maple syrup, golden syrup or agave' }]
	},
	{
		name: 'Maple syrup',
		aka: ['lönnsirap'],
		per: '1 tbsp',
		swaps: [{ use: '1 tbsp honey', note: 'Sweeter and thicker.' }, { use: '1 tbsp light syrup (ljus sirap)' }]
	},
	{
		name: 'Vanilla extract',
		aka: ['vanilla', 'vanilj'],
		per: '1 tsp',
		swaps: [
			{ use: '1 tsp vanilla sugar (vaniljsocker)', note: 'Mostly sugar; use 2 tsp for the same flavour.' },
			{ use: 'seeds from ½ vanilla pod' }
		]
	},
	{
		name: 'Lemon juice',
		aka: ['citronsaft', 'lemon', 'citron'],
		per: '1 tbsp',
		swaps: [
			{ use: '1 tbsp lime juice' },
			{ use: '½ tbsp white wine or cider vinegar', note: 'For acidity only: no fruitiness.' }
		]
	},
	{
		name: 'White wine',
		aka: ['vitt vin', 'wine'],
		per: '1 dl',
		swaps: [
			{ use: '1 dl stock + 1 tsp white wine vinegar or lemon juice', note: 'Keeps the acidity that lifts the sauce.' },
			{ use: '1 dl dry vermouth', note: 'Keeps well opened; slightly herbal.' }
		]
	},
	{
		name: 'Red wine',
		aka: ['rött vin'],
		per: '1 dl',
		swaps: [{ use: '1 dl stock + 1 tsp red wine or balsamic vinegar', note: 'A spoon of tomato paste adds back some depth.' }]
	},
	{
		name: 'Mirin',
		per: '1 tbsp',
		swaps: [{ use: '1 tbsp dry sherry or sake + ½ tsp sugar' }, { use: '1 tbsp rice vinegar + 1 tsp sugar', note: 'Sharper.' }]
	},
	{
		name: 'Rice vinegar',
		aka: ['risvinäger'],
		per: '1 tbsp',
		swaps: [{ use: '1 tbsp apple cider vinegar + a pinch of sugar' }, { use: '2 tsp white wine vinegar + 1 tsp water' }]
	},
	{
		name: 'Soy sauce',
		aka: ['soja', 'sojasås', 'shoyu'],
		per: '1 tbsp',
		swaps: [
			{ use: '1 tbsp tamari', note: 'Gluten free and a little richer.' },
			{ use: '2 tsp Worcestershire sauce + 1 tsp water', note: 'Different but still savoury.' }
		]
	},
	{
		name: 'Fish sauce',
		aka: ['fisksås'],
		per: '1 tbsp',
		swaps: [{ use: '1 tbsp soy sauce + 1 mashed anchovy fillet' }, { use: '1 tbsp soy sauce + a squeeze of lime', note: 'Vegetarian; less funk.' }]
	},
	{
		name: 'Stock',
		aka: ['broth', 'buljong', 'fond', 'chicken stock', 'beef stock', 'vegetable stock'],
		per: '1 l',
		swaps: [
			{ use: '1 l water + 1 stock cube or 1 tbsp concentrate (fond)', note: 'Saltier: season at the end.' },
			{ use: '1 l water + 1 tbsp soy sauce + 1 tbsp butter', note: 'In a pinch, for a savoury base.' }
		]
	},
	{
		name: 'Tomato paste',
		aka: ['tomatpuré'],
		per: '1 tbsp',
		swaps: [{ use: '3 tbsp passata or crushed tomatoes, reduced', note: 'Cook down until thick before adding the liquid.' }, { use: '1 tbsp ketchup', note: 'Sweeter.' }]
	},
	{
		name: 'Canned tomatoes',
		aka: ['krossade tomater', 'crushed tomatoes', 'chopped tomatoes'],
		per: '1 can (400 g)',
		swaps: [
			{ use: '4 dl passata', note: 'Smoother sauce.' },
			{ use: '500 g ripe fresh tomatoes, chopped', note: 'Simmer longer; add a pinch of sugar if they are pale.' }
		]
	},
	{
		name: 'Coconut milk',
		aka: ['kokosmjölk'],
		per: '1 can (400 ml)',
		swaps: [
			{ use: '4 dl cream', note: 'Rich but no coconut taste; add a little at the end.' },
			{ use: '3 dl Greek yogurt + 1 dl water', note: 'Stir in off the heat so it does not split.' }
		]
	},
	{
		name: 'Fresh herbs',
		aka: ['herbs', 'örter', 'basil', 'oregano', 'thyme', 'timjan', 'rosemary', 'rosmarin', 'parsley', 'persilja'],
		per: '1 tbsp chopped',
		swaps: [{ use: '1 tsp dried', note: 'Add early so it softens in the liquid. Basil and parsley lose most of their taste dried.' }]
	},
	{
		name: 'Garlic',
		aka: ['vitlök', 'garlic clove'],
		per: '1 clove',
		swaps: [{ use: '⅛ tsp garlic powder' }, { use: '½ tsp garlic paste or minced garlic from a jar' }]
	},
	{
		name: 'Onion',
		aka: ['lök', 'gul lök', 'yellow onion'],
		per: '1 medium onion',
		swaps: [
			{ use: '1 tbsp onion powder', note: 'Taste but no texture or sweetness from browning.' },
			{ use: '3–4 shallots' },
			{ use: '1 leek, white part' }
		]
	},
	{
		name: 'Shallot',
		aka: ['schalottenlök'],
		per: '1 shallot',
		swaps: [{ use: '¼ yellow onion + a small piece of garlic', note: 'Use a red onion for raw dressings.' }]
	},
	{
		name: 'Fresh ginger',
		aka: ['ginger', 'ingefära'],
		per: '1 tbsp grated',
		swaps: [{ use: '¼ tsp ground ginger', note: 'Warmer, no zing; add with the spices.' }]
	},
	{
		name: 'Fresh chili',
		aka: ['chili', 'chilli', 'red chili', 'jalapeño'],
		per: '1 chili',
		swaps: [{ use: '¼–½ tsp chili flakes' }, { use: '½ tsp sambal oelek' }]
	},
	{
		name: 'Breadcrumbs',
		aka: ['ströbröd', 'panko'],
		per: '1 dl',
		swaps: [
			{ use: '1 dl crushed crackers or cornflakes', note: 'Good for coating.' },
			{ use: '1 dl rolled oats, pulsed', note: 'For meatballs and binding.' }
		]
	},
	{
		name: 'Pasta water',
		per: '1 dl',
		swaps: [{ use: '1 dl water + 1 tsp cornstarch + a pinch of salt', note: 'The starch is what binds the sauce.' }]
	}
];

/** Word prefixes, so "butt" finds butter while typing. */
const startsAny = (hay: string[], w: string) => hay.some((h) => h.startsWith(w));

/** Entries whose name or other names contain every word typed, in any order; names before aliases. */
export function findSwaps(query: string, list: Swappable[] = SWAPS): Swappable[] {
	const q = parseTerm(query);
	if (!q.length) return list;
	const score = (s: Swappable) => {
		const name = parseTerm(s.name);
		if (q.every((w) => startsAny(name, w))) return 0;
		if ((s.aka ?? []).some((a) => q.every((w) => startsAny(parseTerm(a), w)))) return 1;
		return -1;
	};
	return list
		.map((s) => [s, score(s)] as const)
		.filter(([, n]) => n >= 0)
		.sort((a, b) => a[1] - b[1])
		.map(([s]) => s);
}

/**
 * The other way round: entries where what was typed is one of the swaps, so a cook with
 * yogurt in the fridge finds that it stands in for buttermilk. Only the matching swaps are
 * kept, and entries `findSwaps` already lists are left out.
 */
export function swapsUsing(query: string, list: Swappable[] = SWAPS): Swappable[] {
	const q = parseTerm(query);
	if (!q.length) return [];
	const direct = new Set(findSwaps(query, list));
	return list
		.filter((s) => !direct.has(s))
		.map((s) => ({ ...s, swaps: s.swaps.filter((w) => q.every((t) => startsAny(parseTerm(w.use), t))) }))
		.filter((s) => s.swaps.length > 0);
}

/** Entries for what a recipe uses, in the recipe's order: a cook out of guanciale finds it first on carbonara. */
export function swapsFor(recipe: Pick<Recipe, 'ingredients' | 'course'>, list: Swappable[] = SWAPS): Swappable[] {
	const names = (s: Swappable) => [s.name, ...(s.aka ?? [])].map(parseTerm);
	const first = (s: Swappable) =>
		s.courses && !s.courses.some((c) => recipe.course.includes(c))
			? -1
			: recipe.ingredients.findIndex((ing) => names(s).some((n) => ingredientMatches(ing, n)));
	return list
		.map((s) => [s, first(s)] as const)
		.filter(([, n]) => n >= 0)
		.sort((a, b) => a[1] - b[1])
		.map(([s]) => s);
}
