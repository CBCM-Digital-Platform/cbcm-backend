// Simple in-memory fixed-window rate limiter.
//
// IMPORTANT: this store is per-process. It is suitable for single-instance
// deployments and development. Before running multiple backend instances in
// production, replace the backing store with shared storage (e.g. Redis) so
// limits are enforced across all instances.

function createRateLimiter({ windowMs = 60000, max = 30, keyFn } = {}) {
	const hits = new Map();

	function resolveKey(req) {
		if (typeof keyFn === 'function') return String(keyFn(req));
		return String(req.user?.id || req.ip || 'anonymous');
	}

	// Periodically evict expired windows to bound memory usage.
	const sweep = setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of hits) {
			if (now - entry.windowStart > windowMs * 2) hits.delete(key);
		}
	}, windowMs);
	if (typeof sweep.unref === 'function') sweep.unref();

	return function rateLimit(req, res, next) {
		const key = resolveKey(req);
		const now = Date.now();
		let entry = hits.get(key);
		if (!entry || now - entry.windowStart >= windowMs) {
			entry = { windowStart: now, count: 0 };
			hits.set(key, entry);
		}
		entry.count += 1;
		if (entry.count > max) {
			const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
			res.set('Retry-After', String(retryAfter));
			return res.status(429).json({
				success: false,
				error: {
					code: 'RATE_LIMITED',
					message: 'Too many AI requests. Please try again later.',
					details: [],
				},
			});
		}
		return next();
	};
}

module.exports = { createRateLimiter };
