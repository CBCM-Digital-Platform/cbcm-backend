const EDITABLE_FIELDS = ['title', 'summary', 'content', 'cover_image_url', 'category', 'status', 'published_at'];

function toCreateNewsDto(input) {
	return Object.fromEntries(EDITABLE_FIELDS
		.filter((field) => input[field] !== undefined)
		.map((field) => [field, input[field]]));
}

module.exports = { toCreateNewsDto };
