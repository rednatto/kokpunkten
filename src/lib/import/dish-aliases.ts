/**
 * Other names for the library's dishes, so an imported "Spanish Tortilla" joins "tortilla-espanola".
 * Written as titles; matching slugifies them. Checked by hand against the import report: only names
 * that mean the same dish, not every title that happens to end in a dish name ("banana pancakes").
 */
export const DISH_ALIASES: Record<string, string[]> = {
	'aglio-e-olio': ['Spaghetti aglio e olio', 'Spaghetti aglio olio e peperoncino'],
	'beef-stir-fry': ['Beef and broccoli', 'Beef and broccoli stir fry'],
	'beef-stroganoff': ['Korv stroganoff', 'Stroganoff'],
	bechamel: ['Béchamel sauce', 'Classic béchamel sauce', 'White sauce'],
	borscht: ['Borsch', 'Ukrainian borscht', 'Modern borscht', 'Lithuanian cold borscht'],
	'butter-chicken': ['Murgh makhani', 'Butter chicken masala curry'],
	'chicken-curry': ['Simple chicken curry'],
	'chicken-stock': ['Chicken broth', 'Chicken stock or bone broth'],
	'chili-con-carne': ['Chilli con carne', 'Chili'],
	crepes: ['Crêpes', 'French crêpes', 'Breton crêpes', 'Breton crêpes / Breton galettes', 'Galettes bretonnes'],
	dal: ['Dahl', 'Daal', 'Red lentil dahl', 'Dal tadka'],
	'fish-soup': ['Finnish salmon soup', 'Lohikeitto'],
	goulash: ['Beef goulash', 'Gulyás'],
	guacamole: ['Fresh guacamole'],
	'kung-pao-chicken': ['Kung pao', 'Gong bao chicken', 'Spicy kung pao style chicken'],
	'lentil-soup': ['Red lentil soup', 'Turkish red lentil soup', 'Lebanese lentil soup', 'Sopa de lentejas', 'Mercimek çorbası'],
	'mashed-potatoes': ['Mashed potato', 'Creamy mashed potatoes', 'Potato purée', 'Pommes purée'],
	mayonnaise: ['Mayo', 'Mayonnaise or aioli'],
	omelette: ['Omelet'],
	paella: ['Valencian paella', 'Paella valenciana'],
	'pea-soup': ['Ärtsoppa', 'Erwtensoep', 'Erwtensoep (Dutch pea soup)'],
	pho: ['Pho soup', 'Phở'],
	'pizza-dough': ['No-knead pizza dough', 'Wholemeal wheat flour pizza dough'],
	'quiche-lorraine': ['Quiche lorraine (Lothringer Käsetorte)'],
	risotto: ['Mushroom risotto', 'Risotto ai funghi'],
	shakshuka: ['Shakshouka', 'Chakchouka'],
	'shepherds-pie': ["Shepherd's pie", 'Cottage pie'],
	'sourdough-bread': ['Sourdough', 'Sourdough loaf', 'Sourdough table loaf', 'Sourdough bread with seeds and grains'],
	'spaghetti-bolognese': ['Bolognese', 'Bolognese sauce', 'Ragù alla bolognese'],
	'swedish-meatballs': ['Köttbullar'],
	'swedish-pancakes': ['Pannkakor'],
	'tortilla-espanola': ['Spanish tortilla', 'Spanish omelette', 'Tortilla de patatas', 'Tortilla española'],
	tzatziki: ['Cacık']
};
