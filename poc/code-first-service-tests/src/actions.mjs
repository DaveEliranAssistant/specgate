import { assertRelativePath } from './safety.mjs';

export function authHeader(auth, baselineAuth) {
  if (auth === false) return null;
  if (!baselineAuth || baselineAuth.scheme !== 'Bearer' || typeof baselineAuth.syntheticCredential !== 'string') {
    throw new Error('Baseline auth must be a Bearer credential');
  }
  if (auth === true) return { Authorization: `Bearer ${baselineAuth.syntheticCredential}` };
  if (auth && typeof auth === 'object' && typeof auth.token === 'string' && Object.keys(auth).length === 1) {
    return { Authorization: `Bearer ${auth.token}` };
  }
  throw new Error('Unsupported auth action');
}

export function resolvePath(path, vars) {
  assertRelativePath(path);
  const resolved = path.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_match, name) => {
    if (!Object.hasOwn(vars, name)) throw new Error(`Missing extraction ${name}`);
    return encodeURIComponent(String(vars[name]));
  });
  if (resolved.includes('{') || resolved.includes('}') || resolved.includes('://')) {
    throw new Error(`Unresolved request path ${path}`);
  }
  return resolved;
}

export function readBodyPath(body, path) {
  if (typeof path !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(path)) {
    throw new Error(`Unsupported body path ${path}`);
  }
  return body?.[path];
}
