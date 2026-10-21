const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const swaggerJsdoc = require('swagger-jsdoc');
const env = require('./env');
const specificationPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
const routeDocsGlob = path.resolve(__dirname, '..', 'routes', '*.routes.js').split(path.sep).join('/');
const swaggerSpec = swaggerJsdoc({
	definition: yaml.load(fs.readFileSync(specificationPath, 'utf8')),
	apis: [routeDocsGlob],
});
const localUrl = `http://localhost:${env.PORT || 5000}`;
const publicUrl = env.PUBLIC_BASE_URL || localUrl;

swaggerSpec.servers = [
  { url: publicUrl, description: env.PUBLIC_BASE_URL ? 'Production server' : 'Current server' },
  { url: localUrl, description: 'Local development server' },
];
module.exports = { swaggerSpec };
