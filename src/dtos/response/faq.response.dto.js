// src/dtos/response/faq.response.dto.js
module.exports = {
	fromModel: (faq) => {
		if (!faq) return null;
		const value = faq.toJSON ? faq.toJSON() : faq;
		return {
			id: value.id,
			category: value.category,
			question: value.question,
			answer: value.answer,
			target_audience: value.target_audience,
			facility_id: value.facility_id,
			created_by: value.created_by,
			updated_by: value.updated_by,
			created_at: value.created_at,
			updated_at: value.updated_at,
		};
	},
};
