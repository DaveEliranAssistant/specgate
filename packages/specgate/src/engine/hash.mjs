import { createHash } from 'node:crypto';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function fixtureHash(files) {
  const hash = createHash('sha256');
  const ordered = [...files].sort((left, right) => left.path.localeCompare(right.path));
  for (const file of ordered) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.source);
    hash.update('\0');
  }
  return hash.digest('hex');
}
