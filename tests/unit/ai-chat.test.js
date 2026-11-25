process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test, before } = require('node:test');
const { sequelize, User, AIDocument, AIDocumentChunk } = require('../../src/models');
const repository = require('../../src/repositories/ai-assistant.repository');
const chatService = require('../../src/services/ai-chat.service');
const assistantService = require('../../src/services/ai-assistant.service');

let mentee;
let otherUser;
let knowledgeDocument;
let knowledgeChunk;

function mockLlm(text = 'Grounded answer from CBCM knowledge.') {
	return {
		generateContent: async () => ({
			text,
			model: 'mock-gemini',
			usage: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
			finishReason: 'STOP',
		}),
	};
}

function mockRetriever(chunks = [{
	chunk_id: knowledgeChunk.id,
	document_id: knowledgeDocument.id,
	document_version_id: null,
	document_title: 'IPC Mentorship Manual',
	document_version: '2024.1',
	chunk_index: 0,
	content: 'Hand hygiene is the first line of defense.',
	page_number: 4,
	section_heading: 'Standard Precautions',
	score: 0.9,
	distance: 0.1,
}]) {
	return { retrieve: async () => chunks };
}

before(async () => {
	// Ensure the SQLite test schema exists and seed the users required by FK constraints.
	await sequelize.sync({ force: false });
	mentee = await User.create({
		full_name: 'Test Mentee',
		email: 'ai-chat-mentee@test.local',
		role: 'mentee',
		status: 'active',
	});
	otherUser = await User.create({
		full_name: 'Other Mentee',
		email: 'ai-chat-other@test.local',
		role: 'mentee',
		status: 'active',
	});
	knowledgeDocument = await AIDocument.create({
		title: 'IPC Mentorship Manual',
		status: 'approved',
		uploaded_by: mentee.id,
	});
	knowledgeChunk = await AIDocumentChunk.create({
		document_id: knowledgeDocument.id,
		chunk_index: 0,
		content: 'Hand hygiene is the first line of defense.',
	});
});

test('sendMessage persists user and assistant messages with citations', async () => {
	const conversation = await repository.createConversation({ userId: mentee.id, title: 'IPC' });
	const result = await chatService.sendMessage({
		user: mentee,
		conversationId: conversation.id,
		content: 'Explain infection prevention principles.',
		llm: mockLlm(),
		retriever: mockRetriever(),
	});

	assert.equal(result.assistantMessage.content, 'Grounded answer from CBCM knowledge.');
	assert.equal(result.assistantMessage.model, 'mock-gemini');
	assert.equal(result.assistantMessage.citations.length, 1);
	assert.equal(result.assistantMessage.citations[0].documentId ?? result.assistantMessage.citations[0].document_id, knowledgeDocument.id);
	assert.equal(result.usage.retrievedChunks, 1);

	const messages = await assistantService.listMessages({ user: mentee, conversationId: conversation.id });
	assert.equal(messages.length, 2);
	assert.equal(messages[0].role, 'user');
	assert.equal(messages[1].role, 'assistant');
	assert.equal(messages[1].citations.length, 1);
	assert.equal(messages[1].citations[0].documentId, knowledgeDocument.id);
	assert.equal(messages[1].citations[0].pageNumber, 4);
});

test('sendMessage enforces conversation ownership', async () => {
	const conversation = await repository.createConversation({ userId: mentee.id });
	await assert.rejects(
		chatService.sendMessage({
			user: otherUser,
			conversationId: conversation.id,
			content: 'hello',
			llm: mockLlm(),
			retriever: mockRetriever(),
		}),
		{ statusCode: 404 }
	);
});

test('sendMessage blocks emergency questions without calling the LLM', async () => {
	const conversation = await repository.createConversation({ userId: mentee.id });
	let llmCalled = false;
	const result = await chatService.sendMessage({
		user: mentee,
		conversationId: conversation.id,
		content: 'My patient is unconscious and not breathing, what do I do?',
		llm: { generateContent: async () => { llmCalled = true; return { text: 'x' }; } },
		retriever: mockRetriever([]),
	});
	assert.equal(llmCalled, false);
	assert.equal(result.assistantMessage.safetyNotice, true);
	assert.match(result.assistantMessage.content, /emergency/i);
});

test('sendMessage rejects unsupported roles', async () => {
	const conversation = await repository.createConversation({ userId: mentee.id });
	await assert.rejects(
		chatService.sendMessage({
			user: { id: 1, role: 'patient' },
			conversationId: conversation.id,
			content: 'hi',
			llm: mockLlm(),
			retriever: mockRetriever(),
		}),
		{ statusCode: 403 }
	);
});

test('sendMessage reports insufficient knowledge when retrieval is empty', async () => {
	const conversation = await repository.createConversation({ userId: mentee.id });
	const result = await chatService.sendMessage({
		user: mentee,
		conversationId: conversation.id,
		content: 'What is the protocol for rare tropical disease X?',
		llm: mockLlm('The approved CBCM knowledge base does not contain enough information to answer this confidently.'),
		retriever: mockRetriever([]),
	});
	assert.equal(result.usage.retrievedChunks, 0);
	assert.deepEqual(result.assistantMessage.citations, []);
	assert.match(result.assistantMessage.content, /knowledge base/i);
});

test('conversation lifecycle: create, list, archive', async () => {
	const created = await assistantService.createConversation({ user: mentee, title: 'Mentorship' });
	assert.equal(created.title, 'Mentorship');

	const list = await assistantService.listConversations({ user: mentee });
	assert.ok(list.items.some((c) => c.id === created.id));

	const archived = await assistantService.archiveConversation({ user: mentee, id: created.id });
	assert.equal(archived.status, 'archived');

	// Archived conversations reject new messages.
	await assert.rejects(
		chatService.sendMessage({
			user: mentee,
			conversationId: created.id,
			content: 'still there?',
			llm: mockLlm(),
			retriever: mockRetriever(),
		}),
		{ statusCode: 409 }
	);
});

test('feedback is recorded once per user and updatable', async () => {
	const conversation = await repository.createConversation({ userId: mentee.id });
	const result = await chatService.sendMessage({
		user: mentee,
		conversationId: conversation.id,
		content: 'feedback test',
		llm: mockLlm(),
		retriever: mockRetriever(),
	});
	const messageId = result.assistantMessage.id;

	const first = await assistantService.submitFeedback({ user: mentee, messageId, rating: 'up' });
	assert.equal(first.updated, false);
	const second = await assistantService.submitFeedback({ user: mentee, messageId, rating: 'down', comment: 'changed my mind' });
	assert.equal(second.updated, true);

	// Another user cannot give feedback on this message.
	await assert.rejects(
		assistantService.submitFeedback({ user: otherUser, messageId, rating: 'up' }),
		{ statusCode: 403 }
	);
});
