// Logical backup of the development database to JSON files outside the repo.
// Usage (from cbcm-backend): node scripts/backup-dev-db.js [outputDir]
// Requires DATABASE_URL in .env. Never prints credentials.

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const OUTPUT_DIR = process.argv[2] || 'D:\\CBCM-backups';
const BATCH_SIZE = 500;

async function main() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		console.error('DATABASE_URL is not set.');
		process.exit(1);
	}
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const outDir = path.join(OUTPUT_DIR, `cbcm-dev-${stamp}`);
	fs.mkdirSync(outDir, { recursive: true });

	const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
	await client.connect();

	const meta = { createdAt: new Date().toISOString(), database: 'dev', tables: {} };

	const { rows: tables } = await client.query(
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		 ORDER BY table_name`
	);

	for (const { table_name: table } of tables) {
		const file = path.join(outDir, `${table}.json`);
		const out = fs.createWriteStream(file);
		out.write('{"table":"' + table + '","rows":[\n');
		let count = 0;
		let offset = 0;
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const { rows } = await client.query(
				`SELECT row_to_json(t) AS row FROM (SELECT * FROM "${table}" ORDER BY 1 LIMIT $1 OFFSET $2) t`,
				[BATCH_SIZE, offset]
			);
			for (const r of rows) {
				out.write((count ? ',\n' : '') + JSON.stringify(r.row));
				count += 1;
			}
			if (rows.length < BATCH_SIZE) break;
			offset += BATCH_SIZE;
		}
		out.write('\n]}\n');
		await new Promise((resolve) => out.end(resolve));
		meta.tables[table] = count;
		console.log(`${table}: ${count} rows`);
	}

	// Schema snapshot for reconstruction reference.
	const { rows: columns } = await client.query(
		`SELECT table_name, column_name, data_type, is_nullable, column_default
		 FROM information_schema.columns
		 WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
	);
	fs.writeFileSync(path.join(outDir, '_schema.json'), JSON.stringify(columns, null, 2));
	fs.writeFileSync(path.join(outDir, '_meta.json'), JSON.stringify(meta, null, 2));

	await client.end();
	console.log(`Backup written to ${outDir}`);
	console.log(`Tables: ${Object.keys(meta.tables).length}, total rows: ${Object.values(meta.tables).reduce((a, b) => a + b, 0)}`);
}

main().catch((error) => {
	console.error('Backup failed:', error.message);
	process.exit(1);
});
