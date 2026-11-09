const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

describe('Swagger / OpenAPI Configuration Validation', () => {
	const specPath = path.resolve(__dirname, '../../src/docs/openapi.yaml');

	it('should parse src/docs/openapi.yaml without syntax or indentation errors', () => {
		const raw = fs.readFileSync(specPath, 'utf8');
		const doc = yaml.load(raw);

		assert.ok(doc, 'Parsed OpenAPI document should not be empty');
		assert.equal(doc.openapi, '3.0.0');
		assert.ok(doc.info, 'Specification should contain info');
		assert.ok(doc.info.title, 'Specification should have a title');
		assert.ok(doc.paths, 'Specification should define paths');
		assert.ok(doc.components, 'Specification should define components');
		assert.ok(doc.components.schemas, 'Specification should define component schemas');
	});

	it('should successfully require src/config/swagger without throwing exceptions', () => {
		const { swaggerSpec } = require('../../src/config/swagger');
		assert.ok(swaggerSpec, 'swaggerSpec should be exported');
		assert.ok(swaggerSpec.openapi, 'swaggerSpec should have openapi version');
		assert.ok(swaggerSpec.paths, 'swaggerSpec should contain paths');
		assert.ok(Object.keys(swaggerSpec.paths).length > 50, 'swaggerSpec should contain registered paths');
		assert.ok(Array.isArray(swaggerSpec.servers), 'swaggerSpec should have servers configured');
	});

	it('should define User Guides tag under top-level tags', () => {
		const raw = fs.readFileSync(specPath, 'utf8');
		const doc = yaml.load(raw);

		assert.ok(Array.isArray(doc.tags), 'Tags should be an array');
		const userGuidesTag = doc.tags.find((t) => t.name === 'User Guides');
		assert.ok(userGuidesTag, 'User Guides tag should be defined in tags');
		assert.equal(userGuidesTag.description, 'User guide management (Facility Admin only)');
	});

	it('should document mentee module assignment endpoints', () => {
		const raw = fs.readFileSync(specPath, 'utf8');
		const doc = yaml.load(raw);
		const tag = doc.tags.find((entry) => entry.name === 'Mentee Module Assignments');
		assert.ok(tag);
		assert.ok(doc.paths['/api/v1/learning/mentees/{menteeId}/modules'].get);
		assert.ok(doc.paths['/api/v1/learning/modules/{moduleId}/assignments'].post);
		assert.ok(doc.paths['/api/v1/learning/modules/{moduleId}/mentees/{menteeId}/assignment'].delete);
		assert.deepEqual(doc.paths['/api/v1/learning/modules/{moduleId}/assignments'].post.requestBody.content['application/json'].schema.required, ['menteeId']);
	});

	it('should resolve all internal $ref references within openapi.yaml', () => {
		const raw = fs.readFileSync(specPath, 'utf8');
		const doc = yaml.load(raw);

		function getTarget(obj, parts) {
			let current = obj;
			for (const part of parts) {
				if (current == null || typeof current !== 'object' || !(part in current)) {
					return undefined;
				}
				current = current[part];
			}
			return current;
		}

		function collectRefs(node, location = '') {
			const refs = [];
			if (!node || typeof node !== 'object') return refs;
			if (Array.isArray(node)) {
				node.forEach((item, index) => {
					refs.push(...collectRefs(item, `${location}[${index}]`));
				});
			} else {
				for (const [key, value] of Object.entries(node)) {
					if (key === '$ref' && typeof value === 'string') {
						refs.push({ ref: value, location });
					} else {
						refs.push(...collectRefs(value, `${location}.${key}`));
					}
				}
			}
			return refs;
		}

		const allRefs = collectRefs(doc);
		assert.ok(allRefs.length > 0, 'Document should have $ref references');

		const unresolved = [];
		for (const { ref, location } of allRefs) {
			if (ref.startsWith('#/')) {
				const parts = ref.slice(2).split('/');
				const target = getTarget(doc, parts);
				if (target === undefined) {
					unresolved.push({ ref, location });
				}
			}
		}

		assert.deepEqual(unresolved, [], `Found unresolved $refs: ${JSON.stringify(unresolved)}`);
	});

	it('should define guides endpoints under /api/v1/settings/guides and /api/v1/settings/guides/{id}', () => {
		const raw = fs.readFileSync(specPath, 'utf8');
		const doc = yaml.load(raw);

		const listPath = doc.paths['/api/v1/settings/guides'];
		assert.ok(listPath, '/api/v1/settings/guides should exist');
		assert.ok(listPath.get, 'GET /api/v1/settings/guides should exist');
		assert.ok(listPath.post, 'POST /api/v1/settings/guides should exist');

		const itemPath = doc.paths['/api/v1/settings/guides/{id}'];
		assert.ok(itemPath, '/api/v1/settings/guides/{id} should exist');
		assert.ok(itemPath.get, 'GET /api/v1/settings/guides/{id} should exist');
		assert.ok(itemPath.patch, 'PATCH /api/v1/settings/guides/{id} should exist');
		assert.ok(itemPath.delete, 'DELETE /api/v1/settings/guides/{id} should exist');

		assert.equal(itemPath.patch.summary, 'Update a user guide');
		assert.equal(itemPath.delete.summary, 'Delete a user guide');
	});

	it('documents every registered assessment, passing-rule, and certificate route method', () => {
		const { swaggerSpec } = require('../../src/config/swagger');
		const routeGroups = [
			['/api/v1/assessments', require('../../src/routes/assessments.routes')],
			['/api/v1/assessment-passing-rules', require('../../src/routes/assessment-passing-rules.routes')],
			['/api/v1/certificates', require('../../src/routes/certificates.routes')],
		];
		const missing = [];

		for (const [prefix, router] of routeGroups) {
			for (const layer of router.stack) {
				if (!layer.route) continue;
				const pathName = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}`
					.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
				for (const method of Object.keys(layer.route.methods)) {
					if (layer.route.methods[method] && !swaggerSpec.paths[pathName]?.[method]) {
						missing.push(`${method.toUpperCase()} ${pathName}`);
					}
				}
			}
		}

		assert.deepEqual(missing, [], `Undocumented registered routes: ${missing.join(', ')}`);
	});

	it('documents passing-rule role security, schemas, and soft-deactivation response', () => {
		const raw = fs.readFileSync(specPath, 'utf8');
		const doc = yaml.load(raw);
		const collection = doc.paths['/api/v1/assessment-passing-rules'];
		const item = doc.paths['/api/v1/assessment-passing-rules/{id}'];

		assert.ok(collection.get && collection.post);
		assert.ok(item.get && item.patch && item.delete);
		assert.deepEqual(collection.get.security, [{ bearerAuth: [] }]);
		assert.deepEqual(collection.post.requestBody.content['application/json'].schema, {
			$ref: '#/components/schemas/AssessmentPassingRuleCreateRequest',
		});
		assert.deepEqual(item.patch.requestBody.content['application/json'].schema, {
			$ref: '#/components/schemas/AssessmentPassingRuleUpdateRequest',
		});
		assert.ok(item.delete.responses['200'].content['application/json'].schema.properties.data.properties.deactivated);
	});

	it('documents certificate issuance eligibility at its registered path with all path parameters', () => {
		const raw = fs.readFileSync(specPath, 'utf8');
		const doc = yaml.load(raw);
		const operation = doc.paths['/api/v1/certificates/eligibility/{mentee_id}/{cycle_id}/{thematic_area_id}'].get;

		assert.ok(operation);
		assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
		assert.deepEqual(operation.parameters.map((parameter) => parameter.name), [
			'mentee_id',
			'cycle_id',
			'thematic_area_id',
		]);
		assert.ok(operation.responses['200'].content['application/json'].schema.$ref
			=== '#/components/schemas/CertificateEligibilityResponse');
		assert.ok(operation.responses['401'] && operation.responses['403']);
	});
});
