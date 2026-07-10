// Validates every template in templates/*.json against the snapshot format.
// parseSnapshot (@studyos/core) is the source of truth; on top of it we do a
// lightweight consistency check against templates/schema.json (no ajv dep):
// the schema itself must parse and its required keys must match the format.
// Usage: bun scripts/validate-templates.ts — exits 1 on any failure.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
// Relative import: repo root has no node_modules link for workspace packages.
import {
  parseSnapshot,
  snapshotHash,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
} from '../packages/core/src/snapshot';

const templatesDir = join(import.meta.dir, '..', 'templates');

let failures = 0;
const report = (file: string, error?: string): void => {
  if (error === undefined) {
    console.log(`ok    ${file}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${file}: ${error}`);
  }
};

// 1. schema.json must parse and stay in sync with the frozen format.
const SNAPSHOT_REQUIRED = [
  'format',
  'version',
  'exported_at',
  'track',
  'topics',
  'cards',
  'lessons',
  'lesson_items',
  'content',
];
try {
  const raw: unknown = JSON.parse(await Bun.file(join(templatesDir, 'schema.json')).text());
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('schema root must be an object');
  }
  const schema = raw as Record<string, unknown>;
  const required = Array.isArray(schema['required']) ? (schema['required'] as unknown[]) : [];
  for (const key of SNAPSHOT_REQUIRED) {
    if (!required.includes(key)) throw new Error(`schema is missing required key '${key}'`);
  }
  const properties =
    typeof schema['properties'] === 'object' && schema['properties'] !== null
      ? (schema['properties'] as Record<string, unknown>)
      : {};
  const constOf = (key: string): unknown =>
    typeof properties[key] === 'object' && properties[key] !== null
      ? (properties[key] as Record<string, unknown>)['const']
      : undefined;
  if (constOf('format') !== SNAPSHOT_FORMAT) {
    throw new Error(`schema format const must be '${SNAPSHOT_FORMAT}'`);
  }
  if (constOf('version') !== SNAPSHOT_VERSION) {
    throw new Error(`schema version const must be ${SNAPSHOT_VERSION}`);
  }
  report('schema.json');
} catch (error) {
  report('schema.json', error instanceof Error ? error.message : String(error));
}

// 2. Every other templates/*.json must be a valid snapshot.
const files = (await readdir(templatesDir))
  .filter((f) => f.endsWith('.json') && f !== 'schema.json')
  .sort();
if (files.length === 0) {
  report('(templates)', 'no template json files found');
}
for (const file of files) {
  try {
    const snapshot = parseSnapshot(await Bun.file(join(templatesDir, file)).text());
    console.log(
      `ok    ${file} — "${snapshot.track.title}" · ${snapshot.topics.length} topics · ` +
        `${snapshot.cards.length} cards · ${snapshot.lessons.length} lessons · hash ${snapshotHash(snapshot)}`,
    );
  } catch (error) {
    report(file, error instanceof Error ? error.message : String(error));
  }
}

if (failures > 0) {
  console.error(`\n${failures} template(s) failed validation`);
  process.exit(1);
}
