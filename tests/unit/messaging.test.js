process.env.JWT_SECRET = 'messaging-test-secret';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const models = require('../../src/models');
const repository = require('../../src/repositories/messaging.repository');
const service = require('../../src/services/messaging.service');
const controller = require('../../src/controllers/messaging.controller');
const validator = require('../../src/validators/messaging.validator');

const originals = [];
const replace = (object, key, value) => {
  originals.push([object, key, object[key]]);
  object[key] = value;
};

afterEach(() => {
  while (originals.length) {
    const [object, key, original] = originals.pop();
    object[key] = original;
  }
});

const request = async (path, options = {}) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, options);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

test('messaging endpoints reject unauthenticated requests', async () => {
  const response = await request('/messages/conversations');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
});

test('conversation and message inputs reject duplicates and empty content', () => {
  assert.throws(() => validator.parseCreateConversation({ participantIds: [2, '2'] }), { statusCode: 400 });
  assert.throws(() => validator.parseCreateConversation({ participantIds: ['invalid'] }), { statusCode: 400 });
  assert.throws(() => validator.parseSendMessage({ content: '   ' }), { statusCode: 400 });
  assert.deepEqual(validator.parseSendMessage({ content: ' Hello ' }), {
    content: 'Hello',
    attachmentFileId: null,
  });
});

test('authenticated requests use route validation before database access', async () => {
  const token = jwt.sign({ sub: '1' }, process.env.JWT_SECRET);
  const response = await request('/messages/conversations/not-an-id', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 400);
});

test('conversation reads are forbidden to non-participants', async () => {
  replace(repository, 'getConversation', async () => ({ participants: [{ id: 9 }] }));
  await assert.rejects(service.getConversation(12, 4), { statusCode: 403 });
});

test('missing conversations return not found', async () => {
  replace(repository, 'getConversation', async () => null);
  await assert.rejects(service.getConversation(404, 4), { statusCode: 404 });
});

test('conversation listing is scoped to the authenticated user', async () => {
  let requestedUserId;
  replace(repository, 'listConversationsForUser', async (userId) => {
    requestedUserId = userId;
    return [];
  });
  assert.deepEqual(await service.listConversations(16), []);
  assert.equal(requestedUserId, 16);
});

test('conversation list query selects only conversations joined by that user', async () => {
  let membershipQuery;
  let conversationQuery;
  replace(models.ConversationParticipant, 'findAll', async (options) => {
    membershipQuery = options;
    return [{ conversation_id: 42 }];
  });
  replace(models.Conversation, 'findAll', async (options) => {
    conversationQuery = options;
    return [];
  });
  replace(models.sequelize, 'query', async () => []);

  assert.deepEqual(await repository.listConversationsForUser(17), []);
  assert.deepEqual(membershipQuery.where, { user_id: 17 });
  assert.deepEqual(conversationQuery.where.id[require('sequelize').Op.in], [42]);
});

test('authenticated conversation list returns the standard success envelope', async () => {
  replace(service, 'listConversations', async () => []);
  const response = await new Promise((resolve, reject) => {
    controller.listConversations({ user: { id: 17 } }, {
      json(value) { resolve(value); },
    }, reject);
  });
  assert.deepEqual(response, { success: true, data: [] });
});

test('conversation creation includes the authenticated user and validates users', async () => {
  let created;
  replace(repository, 'getUsersByIds', async (ids) => ids.map((id) => ({ id })));
  replace(repository, 'createConversation', async (input) => {
    created = input;
    return input;
  });
  await service.createConversation({ userId: 1, participantIds: [2], type: 'direct' });
  assert.deepEqual(created.participantIds.sort(), [1, 2]);
  assert.equal(created.userId, 1);

  replace(repository, 'getUsersByIds', async () => [{ id: 2 }]);
  await assert.rejects(
    service.createConversation({ userId: 1, participantIds: [2], type: 'direct' }),
    { statusCode: 400 },
  );
});

test('message sender comes from auth and conversation id comes from the route', async () => {
  let sent;
  replace(service, 'sendMessage', async (input) => {
    sent = input;
    return { id: 99, conversation_id: input.conversationId, sender_id: input.userId, content: input.content };
  });
  const response = await new Promise((resolve, reject) => {
    controller.sendMessage({
      params: { id: 23 },
      user: { id: 7 },
      messagingInput: { content: 'Hello', attachmentFileId: null },
      body: { senderId: 900, conversationId: 901 },
    }, {
      status() { return this; },
      json(value) { resolve(value); },
    }, reject);
  });
  assert.equal(sent.userId, 7);
  assert.equal(sent.conversationId, 23);
  assert.equal(response.data.senderId, 7);
  assert.equal(response.data.conversationId, 23);
});

test('sending a message updates conversation last-message metadata', async () => {
  let update;
  replace(models.sequelize, 'transaction', async (callback) => callback({}));
  replace(models.Message, 'create', async (values) => ({ id: 55, ...values }));
  replace(models.Conversation, 'update', async (...values) => { update = values; });
  replace(models.Message, 'findByPk', async (id) => ({ id }));

  await repository.createMessage({ conversationId: 18, senderId: 3, content: 'Hello', attachmentFileId: null });
  assert.equal(update[0].last_message_id, 55);
  assert.ok(update[0].last_message_at instanceof Date);
  assert.ok(update[0].updated_at instanceof Date);
  assert.deepEqual(update[1].where, { id: 18 });
});

test('conversation messages are queried chronologically', async () => {
  let query;
  const conversation = { setDataValue(key, value) { this[key] = value; } };
  replace(models.Conversation, 'findByPk', async () => conversation);
  replace(models.Message, 'findAll', async (options) => {
    query = options;
    return [];
  });
  await repository.getConversationWithMessages(8);
  assert.deepEqual(query.order, [['sent_at', 'ASC'], ['id', 'ASC']]);
});

test('repeated read marking does not create duplicate records', async () => {
  const records = new Set();
  replace(models.Message, 'findAll', async () => [{
    id: 33,
    reads: records.has(33) ? [{ id: 1 }] : [],
  }]);
  replace(models.MessageRead, 'bulkCreate', async (rows) => {
    const inserted = rows.filter((row) => !records.has(row.message_id));
    inserted.forEach((row) => records.add(row.message_id));
    return inserted;
  });

  assert.equal(await repository.markConversationRead({ conversationId: 11, userId: 2 }), 1);
  assert.equal(await repository.markConversationRead({ conversationId: 11, userId: 2 }), 0);
  assert.equal(records.size, 1);
});

test('non-participants cannot send messages', async () => {
  replace(repository, 'getConversation', async () => ({ participants: [{ id: 9 }] }));
  await assert.rejects(service.sendMessage({
    conversationId: 23,
    userId: 7,
    content: 'Hello',
  }), { statusCode: 403 });
});

test('read marking is scoped to the requested conversation', async () => {
  let marked;
  replace(repository, 'getConversation', async () => ({ participants: [{ id: 7 }] }));
  replace(repository, 'markConversationRead', async (input) => {
    marked = input;
    return 1;
  });
  assert.deepEqual(await service.markRead({ conversationId: 31, userId: 7 }), { markedRead: 1 });
  assert.deepEqual(marked, { conversationId: 31, userId: 7 });
});

test('users cannot attach files owned by another user', async () => {
  replace(repository, 'getConversation', async () => ({ participants: [{ id: 7 }] }));
  replace(repository, 'getUploadedFile', async () => ({ id: 6, owner_id: 8 }));
  await assert.rejects(service.sendMessage({
    conversationId: 23,
    userId: 7,
    content: 'Hello',
    attachmentFileId: 6,
  }), { statusCode: 403 });
});