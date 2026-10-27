module.exports = {
	toLogbookResponse: (entry) => {
		if (!entry) return null;
		const value = entry.toJSON ? entry.toJSON() : entry;
		const response = {
			id: value.id,
			mentee_id: value.mentee_id,
			encounter_id: value.encounter_id,
			thematic_area_id: value.thematic_area_id,
			procedure_type: value.procedure_type,
			hours: value.hours,
			clinical_notes: value.clinical_notes,
			status: value.status,
			revision_reason: value.revision_reason,
			outcome: value.outcome,
			goal_progress: value.goal_progress,
			mentor_approval: value.mentor_approval,
			approved_by: value.approved_by,
			approved_at: value.approved_at,
			created_by: value.created_by,
			logged_at: value.logged_at,
			updated_at: value.updated_at,
		};

		// Include related data if available
		if (value.mentee) {
			response.mentee = {
				id: value.mentee.id,
				full_name: value.mentee.full_name,
				email: value.mentee.email,
				facility_id: value.mentee.facility_id,
			};
		}
		if (value.encounter) {
			response.encounter = {
				id: value.encounter.id,
				clinical_setting: value.encounter.clinical_setting,
				facility_id: value.encounter.facility_id,
			};
		}
		if (value.thematicArea) {
			response.thematic_area = {
				id: value.thematicArea.id,
				name: value.thematicArea.name,
			};
		}
		if (value.createdBy) {
			response.created_by_user = {
				id: value.createdBy.id,
				full_name: value.createdBy.full_name,
			};
		}
		if (value.approvedBy) {
			response.approved_by_user = {
				id: value.approvedBy.id,
				full_name: value.approvedBy.full_name,
			};
		}

		return response;
	},
};
