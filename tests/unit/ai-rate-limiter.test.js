const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRateLimiter } = require('../../src/middlewares/rate-limiter.middleware');

function mockRes() {
	return {
		statusCode: 200,
		headers: {},
		body: null,
		set(name, value) { this.headers[name] = value; return this; },
		status(code) { this.statusCode = code; return this; },
		json(payload) { this.body = payload; return this; },
	};
}

test('rate limiter allows requests under the limit and blocks over it', () => {
	const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
	const req = { user: { id: 42 }, ip: '127.0.0.1' };
	for (let i = 0; i < 3; i += 1) {
		const res = mockRes();
		let nexted = false;
		limiter(req, res, () => { nexted = true; });
		assert.equal(nexted, true);
	}
	const res = mockRes();
	let nexted = false;
	limiter(req, res, () => { nexted = true; });
	assert.equal(nexted, false);
	assert.equal(res.statusCode, 429);
	assert.equal(res.body.error.code, 'RATE_LIMITED');
});

test('rate limiter keys are isolated per user', () => {
	const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
	const res1 = mockRes();
	limiter({ user: { id: 1 } }, res1, () => {});
	const res2 = mockRes();
	let nexted = false;
	limiter({ user: { id: 2 } }, res2, () => { nexted = true; });
	assert.equal(nexted, true);
});
