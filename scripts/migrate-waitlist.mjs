import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { redactConnectionStrings } from './vercel-build-lib.mjs';

const url = process.env.DATABASE_URL_POOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('Set DATABASE_URL_POOLED or DATABASE_URL, then run npm run db:migrate.');
  process.exit(1);
}

const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'waitlist.sql');
const sql = await readFile(sqlPath, 'utf8');
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(sql);
  console.log('waitlist_signups is ready.');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Migration failed.';
  console.error(redactConnectionStrings(message, [url]));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
