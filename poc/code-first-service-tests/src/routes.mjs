export function findRoute(routes, method, path) {
  const concrete = path.replace(/\{\{[A-Za-z_][A-Za-z0-9_]*\}\}/g, 'value');
  const matches = [...routes].filter((route) => {
    if (route.method !== method) return false;
    const pattern = `^${route.path.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+')}$`;
    return new RegExp(pattern).test(concrete);
  });
  matches.sort((left, right) => (left.params?.length ?? 0) - (right.params?.length ?? 0));
  return matches[0] ?? null;
}
