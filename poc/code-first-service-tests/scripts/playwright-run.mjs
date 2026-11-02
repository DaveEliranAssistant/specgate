import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function findPlaywrightCli(start) {
  let dir = resolve(start);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = join(dir, 'node_modules', '@playwright', 'test', 'cli.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not find @playwright/test. Run npm ci at the repository root.');
}

export function runPlaywright({ config, cwd }) {
  const cli = findPlaywrightCli(cwd);
  const result = spawnSync(process.execPath, [cli, 'test', '--config', config], {
    cwd,
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ? String(result.error) : null,
  };
}
