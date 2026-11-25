const repository = require('../repositories/ai-assistant.repository');

const EMERGENCY_PATTERN = /\b(chest pain|heart attack|stroke|unconscious|unresponsive|not breathing|difficulty breathing|severe bleeding|anaphylaxis|seizure|overdose|poisoning|suicid|self-harm|emergency|code blue)\b/i;
const PATIENT_SPECIFIC_PATTERN = /\b(my patient|the patient|patient's|diagnos|prescri|drug dosage|medication dose|treatment plan for|lab result|x-?ray|ct scan|mri|histopathology|biopsy)\b/i;
const PROMPT_INJECTION_PATTERN = /\b(ignore (all |any )?(previous|prior) instructions|system prompt|you are now|disregard|jailbreak|DAN mode|reveal your instructions)\b/i;
const CLINICAL_DECISION_PATTERN = /\b(should i (give|prescribe|administer|start|stop)|what (drug|medication|dose|dosage)|diagnose me|is it safe to)\b/i;

const EMERGENCY_RESPONSE = [
	'I cannot provide emergency medical guidance. If this is a real emergency, contact your facility\'s emergency response procedure or call local emergency services immediately.',
	'For urgent clinical concerns, escalate to the duty clinician or your facility supervisor right away.',
].join(' ');

const PATIENT_DATA_NOTICE = 'Please avoid sharing identifiable patient information. I can only help with general mentorship and learning topics.';

function classifyMessage(content) {
	const text = String(content || '');
	if (EMERGENCY_PATTERN.test(text)) return { category: 'emergency', severity: 'high' };
	if (PROMPT_INJECTION_PATTERN.test(text)) return { category: 'prompt_injection', severity: 'medium' };
	if (PATIENT_SPECIFIC_PATTERN.test(text) || CLINICAL_DECISION_PATTERN.test(text)) {
		return { category: 'patient_specific', severity: 'medium' };
	}
	return null;
}

async function evaluateMessage({ content, userId, conversationId }) {
	const finding = classifyMessage(content);
	if (!finding) return { allowed: true, finding: null };

	await repository.createSafetyEvent({
		userId,
		conversationId,
		category: finding.category,
		detail: `Triggered on message content (category: ${finding.category}).`,
	}).catch(() => {});

	if (finding.category === 'emergency') {
		return { allowed: false, finding, response: EMERGENCY_RESPONSE };
	}
	return { allowed: true, finding, notice: PATIENT_DATA_NOTICE };
}

module.exports = {
	classifyMessage,
	evaluateMessage,
	EMERGENCY_RESPONSE,
	PATIENT_DATA_NOTICE,
};
