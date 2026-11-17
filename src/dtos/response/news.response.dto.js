const PUBLIC_CARD_FIELDS = Object.freeze([
	'id',
	'title',
	'slug',
	'summary',
	'cover_image_url',
	'category',
	'published_at',
]);
const PUBLIC_DETAIL_FIELDS = Object.freeze([...PUBLIC_CARD_FIELDS, 'content']);
const ADMIN_FIELDS = Object.freeze([
	'id',
	'title',
	'slug',
	'summary',
	'content',
	'cover_image_url',
	'category',
	'status',
	'published_at',
	'author_id',
	'created_at',
	'updated_at',
]);

module.exports = { PUBLIC_CARD_FIELDS, PUBLIC_DETAIL_FIELDS, ADMIN_FIELDS };
