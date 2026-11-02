export function assertLoopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid base URL');
  }
  if (url.protocol !== 'http:') throw new Error('Only http loopback URLs are allowed');
  if (url.username || url.password) throw new Error('Credentials are not allowed in the base URL');
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error(`Refusing non-local host ${url.hostname}`);
  }
  return url;
}

export function assertHarnessSpecifier(specifier) {
  if (typeof specifier !== 'string' || specifier.includes('\\') || specifier.includes('://')) {
    throw new Error('Unsafe harness specifier');
  }
  const segments = specifier.split('/');
  if (segments.length < 2 || (segments[0] !== '.' && segments[0] !== '..')) {
    throw new Error('Unsafe harness specifier');
  }
  if (!segments.at(-1).endsWith('.mjs')) throw new Error('Unsafe harness specifier');
  for (const segment of segments.slice(1)) {
    if (segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment)) {
      throw new Error('Unsafe harness specifier');
    }
  }
}

export function assertRelativePath(path) {
  if (typeof path !== 'string' || path.includes('://') || path.includes('\\') || !path.startsWith('/')) {
    throw new Error(`Unsafe request path ${path}`);
  }
  if (!/^\/[A-Za-z0-9_./{}:-]+$/.test(path)) throw new Error(`Unsafe request path ${path}`);
}
