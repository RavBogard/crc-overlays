import {Pool} from 'pg';
import fs from 'node:fs';

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const connection = await pool.connect();
try {
  await connection.query('BEGIN');
  for (const name of ['postgres.sql', 'playback-snapshot.sql', 'authoring.sql', 'oauth.sql', 'access.sql', 'access-identities.sql', 'access-requests.sql', 'devices.sql', 'history-reader.sql', 'setup-progress.sql', 'service-collections.sql', 'assets.sql', 'source-review.sql', 'operations.sql', 'authoring-defaults.sql', 'local-sources.sql', 'workspace-branding.sql', 'layout-definitions.sql', 'review-boards.sql', 'companion-decks.sql', 'singular-references.sql']) {
    await connection.query(fs.readFileSync(new URL(`../db/${name}`, import.meta.url), 'utf8'));
  }
  const baseline = JSON.parse(fs.readFileSync(new URL('../lib/cues.json', import.meta.url), 'utf8'));
  // Existing output sessions also receive an immutable payload on their first
  // refresh after deployment. Never overwrite a payload already selected.
  for (const cue of baseline) {
    await connection.query('UPDATE state SET cue_payload=$1::jsonb WHERE id=1 AND cue=$2 AND cue_payload IS NULL', [JSON.stringify(cue), cue.id]);
  }
  await connection.query('COMMIT');
  console.log('Authoring schema ready; existing selected graphic preserved.');
} catch (error) {
  await connection.query('ROLLBACK');
  console.error('Authoring migration failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
