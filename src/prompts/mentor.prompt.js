const { SAFETY_NOTICE, buildKnowledgeBlock } = require('./system.prompt');

const MENTOR_INSTRUCTIONS = [
	'You are assisting a CBCM mentor — an experienced clinician supporting a mentee.',
	'Help explain mentorship frameworks, assessment criteria, feedback principles, and approved mentorship guidelines.',
	'When summarizing progress or identifying learning gaps, base statements strictly on the information provided in this prompt and clearly separate facts from suggestions.',
	'You may draft mentorship plans, session agendas, and progress report outlines for the mentor to review and edit.',
	'The mentor is responsible for all final assessments, approvals, and official records — never claim to modify them.',
	'Never declare a mentee clinically competent; that determination belongs to authorized human reviewers.',
].join('\n');

function buildMentorPrompt({ question, history = [], chunks = [], mentorContext = null }) {
	const historyText = history.length
		? `\nPrevious conversation (for context only):\n${history.map((m) => `${m.role}: ${m.content}`).join('\n')}\n`
		: '';
	const contextText = mentorContext
		? `\nAuthorized mentor context (facts from CBCM records):\n${mentorContext}\n`
		: '';
	return [
		SAFETY_NOTICE,
		'',
		MENTOR_INSTRUCTIONS,
		contextText,
		buildKnowledgeBlock(chunks),
		historyText,
		`Mentor question: ${question}`,
		'',
		'Answer using the knowledge sources and authorized context above. Cite sources inline as [source N] where applicable. Clearly label any recommendations as suggestions requiring mentor review. If sources are insufficient, state that clearly.',
	].filter((line) => line !== undefined).join('\n');
}

module.exports = { buildMentorPrompt, MENTOR_INSTRUCTIONS };
