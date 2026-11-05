import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runVercelBuild } from './vercel-build-lib.mjs';

const code = await runVercelBuild({
  env: process.env,
  async migrate() {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./migrate-waitlist.mjs', import.meta.url))], {
      encoding: 'utf8',
      env: process.env,
    });
    if ((child.status ?? 1) === 0) return { ok: true };
    const message = `${child.stderr ?? ''}\n${child.stdout ?? ''}\n${child.error?.message ?? ''}`;
    return { ok: false, message };
  },
  async build() {
    const child = spawnSync('npm', ['run', 'build:onboarding'], {
      stdio: 'inherit',
      env: process.env,
    });
    return child.status ?? 1;
  },
});

process.exit(code ?? 1);
