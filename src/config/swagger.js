const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const env = require('./env');
const specificationPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
const swaggerSpec = yaml.load(fs.readFileSync(specificationPath, 'utf8'));
swaggerSpec.servers[0].url = `http://localhost:${env.PORT || 5000}`;
module.exports = { swaggerSpec };
