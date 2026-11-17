const responseDto = require('../dtos/response/news.response.dto');

function toPlainNews(news) {
	return news && typeof news.toJSON === 'function' ? news.toJSON() : news;
}

function selectFields(news, fields) {
	const value = toPlainNews(news);
	if (!value) return null;
	return Object.fromEntries(fields
		.filter((field) => value[field] !== undefined)
		.map((field) => [field, value[field]]));
}

function toPublicCard(news) {
	return selectFields(news, responseDto.PUBLIC_CARD_FIELDS);
}

function toPublicDetail(news) {
	return selectFields(news, responseDto.PUBLIC_DETAIL_FIELDS);
}

function toAdminNews(news) {
	return selectFields(news, responseDto.ADMIN_FIELDS);
}

module.exports = { toPublicCard, toPublicDetail, toAdminNews };
