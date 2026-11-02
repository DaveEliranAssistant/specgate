import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pocRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function loadFixtureFiles() {
  const manifest = JSON.parse(readFileSync(join(pocRoot, 'fixture/scan-manifest.json'), 'utf8'));
  return manifest.files.map((path) => ({ path, source: readFileSync(join(pocRoot, path), 'utf8') }));
}

export function loadBaseline() {
  return JSON.parse(readFileSync(join(pocRoot, 'baseline/behavior-baseline.json'), 'utf8'));
}

export function loadBaselineSource() {
  return readFileSync(join(pocRoot, 'baseline/behavior-baseline.json'), 'utf8');
}

export function loadJson(path) {
  return JSON.parse(readFileSync(join(pocRoot, path), 'utf8'));
}
