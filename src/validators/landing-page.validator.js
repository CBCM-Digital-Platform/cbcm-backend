const { body, checkExact } = require('express-validator');

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function hasOnlyKeys(value, keys) {
	return isRecord(value) && Object.keys(value).every((key) => keys.includes(key));
}

function isText(value, maxLength, allowEmpty = true) {
	return typeof value === 'string'
		&& value.length <= maxLength
		&& (allowEmpty || value.trim().length > 0)
		&& !/<[^>]*>/.test(value);
}

function isImageUrl(value) {
	if (!isText(value, 2048)) return false;
	if (!value) return true;
	if (value.startsWith('/') && !value.startsWith('//')) return true;
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
	} catch {
		return false;
	}
}

function isStringList(value, maxItems = 12) {
	return Array.isArray(value)
		&& value.length <= maxItems
		&& value.every((item) => isText(item, 300, false));
}

function isTextEntries(value, maxItems = 12) {
	return Array.isArray(value)
		&& value.length <= maxItems
		&& value.every((item) => (
			hasOnlyKeys(item, ['title', 'description'])
			&& isText(item.title, 200, false)
			&& isText(item.description, 1000)
		));
}

function hasUniqueIds(items) {
	const ids = items.map((item) => item.id);
	return new Set(ids).size === ids.length;
}

function isLandingPageContent(content) {
	if (!hasOnlyKeys(content, ['hero', 'how_it_works', 'roles', 'impact'])) return false;

	const hero = content.hero;
	if (!hasOnlyKeys(hero, [
		'eyebrow', 'title', 'highlight', 'description', 'image_url', 'image_alt',
		'connected_badge', 'verification_title', 'verification_label',
		'verification_description', 'proof_points',
	])) return false;
	if (![
		['eyebrow', 200], ['title', 200], ['highlight', 200], ['description', 1000],
		['image_alt', 300], ['connected_badge', 100], ['verification_title', 100],
		['verification_label', 40], ['verification_description', 200],
	].every(([key, limit]) => isText(hero[key], limit))) return false;
	if (!isImageUrl(hero.image_url) || !isStringList(hero.proof_points, 6)) return false;

	const how = content.how_it_works;
	if (!hasOnlyKeys(how, ['eyebrow', 'title', 'highlight', 'description', 'cards'])) return false;
	if (!isText(how.eyebrow, 200) || !isText(how.title, 200) || !isText(how.highlight, 200)
		|| !isText(how.description, 1000) || !Array.isArray(how.cards) || how.cards.length > 12) return false;
	if (!hasUniqueIds(how.cards) || !how.cards.every((card) => (
		hasOnlyKeys(card, ['id', 'step', 'status', 'category', 'title', 'description', 'image_url', 'image_alt', 'features'])
		&& isText(card.id, 80, false)
		&& isText(card.step, 40)
		&& isText(card.status, 120)
		&& isText(card.category, 100)
		&& isText(card.title, 200, false)
		&& isText(card.description, 1000)
		&& isImageUrl(card.image_url)
		&& isText(card.image_alt, 300)
		&& isStringList(card.features, 6)
	))) return false;

	const roles = content.roles;
	if (!hasOnlyKeys(roles, ['eyebrow', 'title', 'highlight', 'description', 'cards'])) return false;
	if (!isText(roles.eyebrow, 200) || !isText(roles.title, 200) || !isText(roles.highlight, 200)
		|| !isText(roles.description, 1000) || !Array.isArray(roles.cards) || roles.cards.length > 12) return false;
	if (!hasUniqueIds(roles.cards) || !roles.cards.every((card) => (
		hasOnlyKeys(card, [
			'id', 'label', 'eyebrow', 'title', 'description', 'image_url', 'image_alt',
			'caption', 'subcaption', 'highlights', 'feature_cards',
		])
		&& isText(card.id, 80, false)
		&& isText(card.label, 80, false)
		&& isText(card.eyebrow, 120)
		&& isText(card.title, 200)
		&& isText(card.description, 1000)
		&& isImageUrl(card.image_url)
		&& isText(card.image_alt, 300)
		&& isText(card.caption, 200)
		&& isText(card.subcaption, 200)
		&& isTextEntries(card.highlights, 8)
		&& isTextEntries(card.feature_cards, 8)
	))) return false;

	const impact = content.impact;
	if (!hasOnlyKeys(impact, ['eyebrow', 'title', 'description', 'stats', 'cta'])) return false;
	if (!isText(impact.eyebrow, 200) || !isText(impact.title, 200) || !isText(impact.description, 1000)
		|| !Array.isArray(impact.stats) || impact.stats.length > 12) return false;
	if (!hasUniqueIds(impact.stats) || !impact.stats.every((stat) => (
		hasOnlyKeys(stat, ['id', 'value', 'suffix', 'label', 'description'])
		&& isText(stat.id, 80, false)
		&& Number.isFinite(stat.value)
		&& stat.value >= 0
		&& stat.value <= 1000000000
		&& isText(stat.suffix, 20)
		&& isText(stat.label, 100, false)
		&& isText(stat.description, 200)
	))) return false;

	const cta = impact.cta;
	return hasOnlyKeys(cta, ['eyebrow', 'title', 'description', 'button_label'])
		&& isText(cta.eyebrow, 120)
		&& isText(cta.title, 300)
		&& isText(cta.description, 1000)
		&& isText(cta.button_label, 100);
}

const contentRule = body('content')
	.isObject({ strict: true })
	.withMessage('Landing page content must be an object.')
	.bail()
	.custom(isLandingPageContent)
	.withMessage('Landing page content contains invalid fields or values.');

module.exports = {
	isLandingPageContent,
	updateLandingPageValidation: [
		contentRule,
		checkExact([contentRule], { locations: ['body'] }),
	],
};
