process.env.JWT_ACCESS_SECRET = 'messaging-test-secret';
process.env.JWT_SECRET = 'messaging-test-secret'; // Fallback for tests
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const env = require('../../src/config/env');
const models = require('../../src/models');
const repository = require('../../src/repositories/messaging.repository');
const service = require('../../src/services/messaging.service');
const notificationService = require('../../src/services/notifications.service');
const NotificationType = require('../../src/enums/notification-type.enum');
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
  const apiPath = path.startsWith('/api/') ? path : `/api/v1${path}`;
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  try {
    return await fetch(`http://127.0.0.1:${address.port}${apiPath}`, options);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

const authenticateAs = (id) => {
  replace(models.User, 'findByPk', async () => ({
    id,
    status: 'active',
    must_change_password: false,
    password_changed_at: null,
    role: 'mentor',
  }));
  return jwt.sign({ sub: String(id), token_use: 'access', password_version: 0 }, env.JWT_ACCESS_SECRET);
};

test('messaging endpoints reject unauthenticated requests', async () => {
  const response = await request('/api/v1/messages/conversations');
  assert.equal(response.status, 401);
  assert.equal((await response.json()).success, false);
  assert.equal((await request('/messages/contacts')).status, 401);
});

test('conversation and message inputs reject duplicates and empty content', () => {
  assert.deepEqual(validator.parseContactsQuery({ q: ' Alex ' }), { q: 'Alex' });
  assert.deepEqual(validator.parseContactsQuery({}), { q: null });
  assert.throws(() => validator.parseContactsQuery({ q: ['Alex', 'Sam'] }), { statusCode: 400 });
  assert.throws(() => validator.parseCreateConversation({ participantIds: [2, '2'] }), { statusCode: 400 });
  assert.throws(() => validator.parseCreateConversation({ participantIds: ['invalid'] }), { statusCode: 400 });
  assert.throws(() => validator.parseSendMessage({ content: '   ' }), { statusCode: 400 });
  assert.deepEqual(validator.parseSendMessage({ content: ' Hello ' }), {
    content: 'Hello',
    attachmentFileId: null,
  });
  assert.deepEqual(validator.parseEditMessage({ content: ' Corrected ' }), { content: 'Corrected' });
  assert.throws(() => validator.parseEditMessage({ content: '  ' }), { statusCode: 400 });
});

test('authenticated requests use route validation before database access', async () => {
  const token = authenticateAs(1);
  const response = await request('/messages/conversations/not-an-id', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 400);
});

test('malformed JSON request bodies return a client error', async () => {
  const response = await request('/api/v1/messages/conversations/1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"content":"Hello2!",}',
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.equal(body.error.message, 'Request body contains invalid JSON.');
});

test('edit and delete message routes pass authenticated route IDs to the service', async () => {
  const token = authenticateAs(7);
  let edited;
  let deleted;
  replace(service, 'editMessage', async (input) => {
    edited = input;
    return { id: input.messageId, conversation_id: input.conversationId, sender_id: input.userId, content: input.content };
  });
  replace(service, 'deleteMessage', async (input) => { deleted = input; });

  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const editResponse = await request('/api/v1/messages/conversations/23/messages/91', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ content: 'Corrected' }),
  });
  assert.equal(editResponse.status, 200);
  assert.equal((await editResponse.json()).data.content, 'Corrected');
  assert.deepEqual(edited, { conversationId: 23, messageId: 91, userId: 7, content: 'Corrected' });

  const deleteResponse = await request('/api/v1/messages/conversations/23/messages/91', {
    method: 'DELETE',
    headers,
  });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual((await deleteResponse.json()).data, { deleted: true });
  assert.deepEqual(deleted, { conversationId: 23, messageId: 91, userId: 7 });
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

test('contact listing is restricted to mentors and mentees and scoped to the authenticated user', async () => {
  let requested;
  replace(repository, 'listContactsForUser', async (input) => {
    requested = input;
    return [];
  });
  assert.deepEqual(await service.listContacts(16, 'MENTOR', ' Alex '), []);
  assert.deepEqual(requested, { userId: 16, role: 'mentor', q: ' Alex ' });
  await assert.rejects(service.listContacts(16, 'admin'), { statusCode: 403 });
});

test('mentor and mentee contact queries use active assignments and expose only contact fields', async () => {
  const { Op } = require('sequelize');
  let query;
  const mentee = { id: 23, full_name: 'Mentee Name', role: 'mentee', avatar_url: null };
  replace(models.Assignment, 'findAll', async (options) => {
    query = options;
    return [{ mentee }, { mentee }];
  });

  assert.deepEqual(await repository.listContactsForUser({ userId: 7, role: 'mentor' }), [mentee]);
  assert.deepEqual(query.where, { mentor_id: 7, unassigned_at: null });
  assert.deepEqual(query.include[0].attributes, ['id', 'full_name', 'role', 'avatar_url']);
  assert.equal(query.include[0].as, 'mentee');
  assert.deepEqual(query.include[0].where, { role: 'mentee', status: 'active' });

  const mentor = { id: 17, full_name: 'Mentor Name', role: 'mentor', avatar_url: null };
  replace(models.Assignment, 'findAll', async (options) => {
    query = options;
    return [{ mentor }];
  });
  assert.deepEqual(await repository.listContactsForUser({ userId: 23, role: 'mentee' }), [mentor]);
  assert.deepEqual(query.where, { mentee_id: 23, unassigned_at: null });
  assert.equal(query.include[0].as, 'mentor');
  assert.deepEqual(query.include[0].where, { role: 'mentor', status: 'active' });
  assert.ok(Op.iLike);
});

test('contact search matches names and emails without returning email and empty assignments return empty', async () => {
  const { Op } = require('sequelize');
  let query;
  replace(models.Assignment, 'findAll', async (options) => {
    query = options;
    return [];
  });
  assert.deepEqual(await repository.listContactsForUser({ userId: 7, role: 'mentor', q: 'alex@example.org' }), []);
  const searchFields = query.include[0].where[Op.or];
  assert.deepEqual(searchFields, [
    { full_name: { [Op.iLike]: '%alex@example.org%' } },
    { email: { [Op.iLike]: '%alex@example.org%' } },
  ]);
  assert.deepEqual(query.include[0].attributes, ['id', 'full_name', 'role', 'avatar_url']);
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

test('authenticated contacts endpoint returns assigned contacts in the standard envelope', async () => {
  let call;
  const contacts = [{ id: 23, full_name: 'Mentee Name', role: 'mentee', avatar_url: null }];
  replace(service, 'listContacts', async (...args) => {
    call = args;
    return contacts;
  });
  const response = await new Promise((resolve, reject) => {
    controller.listContacts({ user: { id: 7, role: 'mentor' }, messagingInput: { q: 'Mentee' } }, {
      json(value) { resolve(value); },
    }, reject);
  });
  assert.deepEqual(call, [7, 'mentor', 'Mentee']);
  assert.deepEqual(response, { success: true, data: contacts });
});

test('contacts route authenticates, scopes by the current user, and accepts name/email search', async () => {
  const token = authenticateAs(7);
  let requested;
  const contacts = [{ id: 23, full_name: 'Mentee Name', role: 'mentee', avatar_url: null }];
  replace(service, 'listContacts', async (...args) => {
    requested = args;
    return contacts;
  });
  const response = await request('/messages/contacts?q=Mentee', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, contacts);
  assert.deepEqual(requested, [7, 'mentor', 'Mentee']);
});

test('conversation creation includes the authenticated user and validates users', async () => {
  let created;
  replace(repository, 'getUsersByIds', async (ids) => ids.map((id) => ({
    id,
    role: id === 1 ? 'mentor' : 'mentee',
    status: 'active',
  })));
  replace(repository, 'hasActiveMentorAssignment', async () => ({ id: 5 }));
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

test('unassigned users cannot start a direct conversation', async () => {
  replace(repository, 'getUsersByIds', async (ids) => ids.map((id) => ({
    id,
    role: id === 1 ? 'mentor' : 'mentee',
    status: 'active',
  })));
  replace(repository, 'hasActiveMentorAssignment', async () => null);
  let created = false;
  replace(repository, 'createConversation', async () => { created = true; });
  await assert.rejects(
    service.createConversation({ userId: 1, participantIds: [2], type: 'direct' }),
    { statusCode: 403 },
  );
  assert.equal(created, false);
});

test('existing exact direct conversations are retrieved without creating duplicates', async () => {
  const existing = {
    id: 34,
    participants: [{ id: 1 }, { id: 2 }],
    setDataValue(key, value) { this[key] = value; },
  };
  let creates = 0;
  replace(models.sequelize, 'transaction', async (callback) => callback({}));
  let lockQuery;
  replace(models.sequelize, 'query', async (...args) => { lockQuery = args; return []; });
  replace(models.Conversation, 'findAll', async () => [existing]);
  replace(models.Conversation, 'findByPk', async () => existing);
  replace(models.Message, 'findAll', async () => []);
  replace(models.Conversation, 'create', async () => { creates += 1; });

  const conversation = await repository.createConversation({
    userId: 1,
    participantIds: [2, 1],
    type: 'direct',
  });
  assert.equal(conversation.id, 34);
  assert.equal(creates, 0);
  assert.match(lockQuery[0], /pg_advisory_xact_lock/);
  assert.equal(lockQuery[1].replacements.lockKey, ((1n << 32n) | 2n).toString());
});

test('direct conversation access requires the active mentor assignment', async () => {
  replace(repository, 'getConversation', async () => ({
    type: 'direct',
    participants: [
      { id: 1, role: 'mentor', status: 'active' },
      { id: 2, role: 'mentee', status: 'active' },
    ],
  }));
  replace(repository, 'hasActiveMentorAssignment', async () => null);
  await assert.rejects(service.getConversation(34, 1), { statusCode: 403 });
});

test('conversation listing hides direct conversations without an active assignment', async () => {
  const direct = (id, menteeId) => ({
    id,
    type: 'direct',
    participants: [
      { id: 1, role: 'mentor', status: 'active' },
      { id: menteeId, role: 'mentee', status: 'active' },
    ],
  });
  replace(repository, 'listConversationsForUser', async () => [
    { conversation: direct(10, 2), unreadCount: 0 },
    { conversation: direct(11, 3), unreadCount: 0 },
    { conversation: { id: 12, type: 'group', participants: [] }, unreadCount: 0 },
  ]);
  replace(repository, 'hasActiveMentorAssignment', async ({ menteeId }) => (menteeId === 2 ? { id: 1 } : null));
  const visible = await service.listConversations(1);
  assert.deepEqual(visible.map(({ conversation }) => conversation.id), [10, 12]);
});

test('group conversation creation preserves existing participant behavior', async () => {
  let created;
  replace(repository, 'getUsersByIds', async (ids) => ids.map((id) => ({ id, role: 'admin', status: 'active' })));
  replace(repository, 'createConversation', async (input) => { created = input; return input; });
  await service.createConversation({ userId: 1, participantIds: [2, 3], type: 'group' });
  assert.deepEqual(created.participantIds.sort(), [1, 2, 3]);
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

test('message edit uses the authenticated user and route message ID', async () => {
  let edited;
  replace(service, 'editMessage', async (input) => {
    edited = input;
    return { id: input.messageId, conversation_id: input.conversationId, sender_id: input.userId, content: input.content };
  });
  const response = await new Promise((resolve, reject) => {
    controller.editMessage({
      params: { id: 23, messageId: 91 },
      user: { id: 7 },
      messagingInput: { content: 'Corrected' },
    }, {
      json(value) { resolve(value); },
    }, reject);
  });
  assert.deepEqual(edited, { conversationId: 23, messageId: 91, userId: 7, content: 'Corrected' });
  assert.equal(response.data.content, 'Corrected');
});

test('only the message sender can edit or permanently delete a message', async () => {
  replace(repository, 'getConversation', async () => ({ participants: [{ id: 7 }] }));
  replace(repository, 'getMessage', async () => ({ sender_id: 8 }));
  await assert.rejects(service.editMessage({
    conversationId: 23,
    messageId: 91,
    userId: 7,
    content: 'Changed',
  }), { statusCode: 403 });
  await assert.rejects(service.deleteMessage({
    conversationId: 23,
    messageId: 91,
    userId: 7,
  }), { statusCode: 403 });
});

test('editing a missing message returns not found', async () => {
  replace(repository, 'getConversation', async () => ({ participants: [{ id: 7 }] }));
  replace(repository, 'getMessage', async () => null);
  await assert.rejects(service.editMessage({
    conversationId: 23,
    messageId: 91,
    userId: 7,
    content: 'Changed',
  }), { statusCode: 404 });
});

test('message updates are scoped to conversation and sender', async () => {
  let update;
  const message = { id: 91, content: 'Corrected' };
  replace(models.Message, 'update', async (...args) => { update = args; return [1]; });
  replace(models.Message, 'findOne', async () => message);

  assert.equal(await repository.updateMessage({
    conversationId: 23,
    messageId: 91,
    userId: 7,
    content: 'Corrected',
  }), message);
  assert.deepEqual(update[1].where, { id: 91, conversation_id: 23, sender_id: 7 });
});

test('permanent message deletion removes read records and refreshes conversation metadata', async () => {
  let readDeletion;
  let messageDeletion;
  let conversationUpdate;
  let messageLookup = 0;
  replace(models.sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
  replace(models.Message, 'findOne', async () => {
    messageLookup += 1;
    return messageLookup === 1 ? { id: 91 } : { id: 90, sent_at: new Date('2026-10-05T10:00:00Z') };
  });
  replace(models.MessageRead, 'destroy', async (options) => { readDeletion = options; return 1; });
  replace(models.Message, 'destroy', async (options) => { messageDeletion = options; return 1; });
  replace(models.Conversation, 'update', async (...args) => { conversationUpdate = args; });

  assert.equal(await repository.deleteMessage({ conversationId: 23, messageId: 91, userId: 7 }), true);
  assert.deepEqual(readDeletion.where, { message_id: 91 });
  assert.deepEqual(messageDeletion.where, { id: 91, conversation_id: 23, sender_id: 7 });
  assert.equal(conversationUpdate[0].last_message_id, 90);
  assert.ok(conversationUpdate[0].last_message_at instanceof Date);
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

test('sending a message notifies only the other conversation participants after the message is saved', async () => {
  const actions = [];
  let notificationInput;
  replace(repository, 'getConversation', async () => ({
    type: 'group',
    participants: [{ id: 7 }, { id: 8 }, { id: 9 }],
  }));
  replace(repository, 'createMessage', async () => {
    actions.push('message');
    return { id: 44, conversation_id: 23, sender_id: 7 };
  });
  replace(notificationService, 'createNotifications', async (input) => {
    actions.push('notifications');
    notificationInput = input;
    return [];
  });

  const message = await service.sendMessage({
    conversationId: 23,
    userId: 7,
    content: 'Hello',
  });

  assert.deepEqual(actions, ['message', 'notifications']);
  assert.equal(message.id, 44);
  assert.deepEqual(notificationInput, {
    userIds: [8, 9],
    type: NotificationType.MESSAGE_RECEIVED,
    title: 'New message',
    body: 'You received a new message.',
    referenceType: 'conversation',
    referenceId: 23,
  });
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