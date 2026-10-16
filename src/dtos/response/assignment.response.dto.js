// src/dtos/response/assignment.response.dto.js
module.exports = Object.freeze({
	AssignmentResponse: {
		id: 'integer',
		mentor_id: 'integer',
		mentee_id: 'integer',
		facility_id: 'integer',
		cycle_id: 'integer',
		thematic_area_id: 'integer',
		status: 'string',
		priority_score: 'number',
		matching_reason: 'string',
		assigned_by: 'integer',
		assigned_at: 'string',
		unassigned_at: 'string',
	},
	AssignmentListResponse: {
		items: 'array',
		total: 'integer',
		page: 'integer',
		limit: 'integer',
		totalPages: 'integer',
	},
});
