// src/dtos/response/user-guide.response.dto.js
module.exports = {
	fromModel: (guide) => {
		if (!guide) return null;
		const value = guide.toJSON ? guide.toJSON() : guide;
		return {
			id: value.id,
			title: value.title,
			content: value.content,
			attachment_file_id: value.attachment_file_id,
			target_audience: value.target_audience,
			facility_id: value.facility_id,
			created_by: value.created_by,
			updated_by: value.updated_by,
			created_at: value.created_at,
			updated_at: value.updated_at,
		};
	},
};
