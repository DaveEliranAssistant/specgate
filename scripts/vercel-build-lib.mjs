export function databaseUrlFrom(env) {
  const pooled = env.DATABASE_URL_POOLED?.trim();
  if (pooled) return pooled;
  const direct = env.DATABASE_URL?.trim();
  return direct || null;
}

export function redactConnectionStrings(text, secrets = []) {
  let output = String(text ?? '').replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'")]+/gi, '[redacted-database-url]');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) {
      output = output.split(secret).join('[redacted-database-url]');
    }
  }
  return output;
}

export async function runVercelBuild({ env, migrate, build, log = console.log, error = console.error }) {
  const url = databaseUrlFrom(env);
  if (!url) {
    log('No DATABASE_URL_POOLED or DATABASE_URL set. Skipping waitlist migration.');
  } else {
    let result;
    try {
      result = await migrate();
    } catch (cause) {
      result = { ok: false, message: cause instanceof Error ? cause.message : 'migration failed' };
    }
    if (!result?.ok) {
      const detail = redactConnectionStrings(result?.message || 'migration failed', [
        env.DATABASE_URL_POOLED,
        env.DATABASE_URL,
        url,
      ]);
      error(`Waitlist migration failed. The build was stopped. ${detail}`);
      return 1;
    }
    log('Waitlist migration finished.');
  }
  const status = await build();
  return typeof status === 'number' ? status : 1;
}
