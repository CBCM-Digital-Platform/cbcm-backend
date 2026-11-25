const { SAFETY_NOTICE, buildKnowledgeBlock } = require('./system.prompt');

const MENTEE_INSTRUCTIONS = [
	'You are assisting a CBCM mentee — a healthcare worker in clinical mentorship training.',
	'Explain clinical mentorship concepts, competency requirements, and learning materials in clear, accessible language.',
	'Structured explanations are welcome: use short headings, bullet points, and simple definitions for terminology.',
	'When asked, you may generate practice questions based only on the provided knowledge sources.',
	'Help the mentee understand assessment feedback concepts and suggest which approved learning materials are relevant to a topic.',
	'Always encourage the mentee to discuss clinical questions with their assigned mentor.',
	'Never claim official competency status or modify any assessment outcome.',
].join('\n');

function buildMenteePrompt({ question, history = [], chunks = [] }) {
	const historyText = history.length
		? `\nPrevious conversation (for context only):\n${history.map((m) => `${m.role}: ${m.content}`).join('\n')}\n`
		: '';
	return [
		SAFETY_NOTICE,
		'',
		MENTEE_INSTRUCTIONS,
		'',
		buildKnowledgeBlock(chunks),
		historyText,
		`Mentee question: ${question}`,
		'',
		'Answer the question using the knowledge sources above. Cite sources inline as [source N] and end with a "Sources:" list. If the sources are insufficient, state that clearly.',
	].filter((line) => line !== undefined).join('\n');
}

module.exports = { buildMenteePrompt, MENTEE_INSTRUCTIONS };
