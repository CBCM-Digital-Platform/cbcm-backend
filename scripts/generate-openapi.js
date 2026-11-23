const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const swaggerJsdoc = require('swagger-jsdoc');

const root = path.resolve(__dirname, '..');
const specificationPath = path.join(root, 'src', 'docs', 'openapi.yaml');
const routeDocsGlob = path.join(root, 'src', 'routes', '*.routes.js').split(path.sep).join('/');

function generateOpenApi() {
	const source = fs.readFileSync(specificationPath, 'utf8');
	const specification = yaml.load(source);
	if (Object.keys(specification).at(-1) !== 'paths') {
		throw new Error('OpenAPI paths must be the final top-level section to safely append generated route documentation.');
	}

	const discovered = swaggerJsdoc({
		definition: {
			openapi: specification.openapi,
			info: specification.info,
			servers: specification.servers,
			components: specification.components,
		},
		apis: [routeDocsGlob],
	});
	const newsPaths = Object.fromEntries(Object.entries(discovered.paths || {})
		.filter(([routePath]) => routePath === '/api/v1/news' || routePath.startsWith('/api/v1/news/')));
	const missingPaths = Object.fromEntries(Object.entries(newsPaths)
		.filter(([routePath]) => !specification.paths?.[routePath]));

	if (Object.keys(missingPaths).length) {
		const generatedYaml = yaml.dump(missingPaths, { lineWidth: -1, noRefs: true, sortKeys: false });
		const indentedPaths = generatedYaml.split('\n').map((line) => line ? `  ${line}` : line).join('\n');
		const updatedSource = `${source.trimEnd()}\n${indentedPaths}`;
		const updatedSpec = yaml.load(updatedSource);
		for (const routePath of Object.keys(newsPaths)) {
			if (!updatedSpec.paths?.[routePath]) {
				throw new Error(`Generated OpenAPI path is missing: ${routePath}`);
			}
		}
		fs.writeFileSync(specificationPath, updatedSource);
		console.log(`Added ${Object.keys(missingPaths).length} News paths to src/docs/openapi.yaml.`);
	} else {
		for (const routePath of Object.keys(newsPaths)) {
			if (!specification.paths?.[routePath]) {
				throw new Error(`Generated OpenAPI path is missing: ${routePath}`);
			}
		}
		console.log('News paths are present in src/docs/openapi.yaml.');
	}
}

if (require.main === module) generateOpenApi();

module.exports = { generateOpenApi };
