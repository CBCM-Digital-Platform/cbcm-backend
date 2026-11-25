const { isUserContextSharingEnabled } = require('../config/gemini.config');
const Role = require('../enums/role.enum');

// Builds the user-specific context that may be included in Gemini prompts.
// The privacy gate (AI_SEND_USER_CONTEXT) is enforced here in code: while it
// is disabled, only the user's role label is provided — never profile data,
// assessment records, assignments, or other personal information.
async function buildAssistantContext(user) {
	const role = String(user?.role || '').toLowerCase();
	const base = {
		role: Object.values(Role).includes(role) ? role : 'mentee',
	};

	if (!isUserContextSharingEnabled()) {
		return { ...base, personalized: false };
	}

	// Privacy gate enabled: organizational approval has been granted. Personal
	// context may be added here in future phases. Keep payloads minimal.
	return {
		...base,
		personalized: true,
		facilityId: user?.facility_id ?? null,
	};
}

module.exports = {
	buildAssistantContext,
};
