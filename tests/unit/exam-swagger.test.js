const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

process.env.NODE_ENV = 'test';

describe('Dedicated Exam Swagger documentation', () => {
  const examSpecPath = path.resolve(__dirname, '../../src/docs/exams.openapi.yaml');
  const legacySpecPath = path.resolve(__dirname, '../../src/docs/openapi.yaml');

  it('contains only the implemented Exam import endpoint', () => {
    const doc = yaml.load(fs.readFileSync(examSpecPath, 'utf8'));
    assert.equal(doc.info.title, 'CBCM Examination Management System API');
    assert.deepEqual(Object.keys(doc.paths).sort(), ['/api/v1/exams/import', '/api/v1/exams/questions'].sort());
    assert.equal(doc.paths['/api/v1/exams/import'].post.requestBody.content['multipart/form-data'].schema.$ref, '#/components/schemas/ExamImportRequest');
    assert.equal(JSON.stringify(doc).toLowerCase().includes('quiz'), false);
  });

  it('includes Exam documentation in the main application specification', () => {
    const doc = yaml.load(fs.readFileSync(legacySpecPath, 'utf8'));
    assert.ok(doc.paths['/api/v1/exams/import']);
    assert.ok(doc.paths['/api/v1/exams/questions']);
    assert.ok(doc.components.schemas.ExamImportRequest);
    assert.ok(doc.components.schemas.ExamImportResponse);
    assert.ok(doc.components.schemas.ExamQuestionsResponse);
    assert.ok(doc.tags.some((tag) => tag.name === 'Exams'));
    assert.ok(doc.paths['/api/v1/learning/quizzes/{quizId}']);
  });

  it('serves the combined application Swagger UI with Exam documentation', async () => {
    const request = require('supertest');
    const app = require('../../src/app');
    const legacyPage = await request(app).get('/api/docs/');
    assert.equal(legacyPage.status, 200);
    assert.match(legacyPage.text, /CBCM API Documentation/);
  });
});
