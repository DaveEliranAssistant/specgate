import * as acorn from 'acorn';
import { SCHEMA_VERSION, SUPPORTED_SUBSET } from './constants.mjs';
import { sha256 } from './hash.mjs';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

export function discover(files) {
  const parsed = files.map((file) => discoverSource(file.path, file.source));
  return {
    schemaVersion: SCHEMA_VERSION,
    synthetic: true,
    supportedSubset: SUPPORTED_SUBSET,
    files: parsed.map((file) => ({
      path: file.file,
      sha256: sha256(file.source),
      parseError: file.parseError,
    })),
    routes: parsed.flatMap((file) => file.routes),
    dto: parsed.flatMap((file) => file.dto),
    constants: parsed.flatMap((file) => file.constants),
    exports: parsed.flatMap((file) => file.exports),
    imports: parsed.flatMap((file) => file.imports),
    setups: parsed.flatMap((file) => file.setups),
    functions: parsed.flatMap((file) => file.functions),
    unsupported: parsed.flatMap((file) => file.unsupported),
  };
}

export function discoverSource(file, source) {
  const empty = {
    file,
    source,
    parseError: null,
    routes: [],
    dto: [],
    constants: [],
    exports: [],
    imports: [],
    setups: [],
    functions: [],
    unsupported: [],
  };
  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'module', locations: true });
  } catch (error) {
    empty.parseError = error.message;
    empty.unsupported.push({
      file,
      line: error.loc?.line ?? null,
      pattern: 'parse-error',
      symbol: null,
      snippet: String(error.message).slice(0, 180),
    });
    return empty;
  }

  const handled = new WeakSet();
  const functions = new Map();
  const imports = new Map();
  const pendingRoutes = [];
  const top = { file, source, handled, unsupported: empty.unsupported, setups: empty.setups, pendingRoutes, nested: false, inlineFunction: fn => recordFunction(fn, false, empty, imports, handled) };

  for (const statement of ast.body) {
    if (statement.type === 'ImportDeclaration') {
      recordImport(statement, empty, imports);
      continue;
    }
    if (statement.type === 'FunctionDeclaration') {
      recordFunction(statement, false, empty, imports, handled);
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'FunctionDeclaration') {
      recordFunction(statement.declaration, true, empty, imports, handled);
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration') {
      recordVariable(statement.declaration, true, empty);
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration') {
      empty.unsupported.push(item(file, source, statement, 'unsupported-export', null));
      continue;
    }
    if (statement.type === 'VariableDeclaration') {
      recordVariable(statement, false, empty);
      continue;
    }
    if (statement.type === 'ExpressionStatement' && classifyAppCall(statement.expression, top)) continue;
    empty.unsupported.push(item(file, source, statement, 'unsupported-statement', null));
  }

  for (const fn of empty.functions) {
    const full = fn.detail;
    if (!full) continue;
    functions.set(full.name, full);
  }

  for (const pending of pendingRoutes) {
    const handler = functions.get(pending.handler);
    const middleware = pending.middleware.map((name) => functions.get(name) ?? null);
    const unresolved = pending.middleware.filter((_name, index) => !middleware[index]) ;
    const authGate = Boolean(handler?.authGate) || middleware.some((fn) => fn?.authGate);
    empty.routes.push({
      method: pending.method,
      path: pending.path,
      params: pending.params,
      handler: pending.handler,
      middleware: pending.middleware,
      auth: unresolved.length > 0 || !handler ? null : authGate,
      file,
      registration: { file, line: pending.line, symbol: `app.${pending.method.toLowerCase()}` },
      handlerLocation: handler ? { file, line: handler.line, symbol: handler.name } : null,
      middlewareLocations: pending.middleware.map((name, index) => (
        middleware[index] ? { file, line: middleware[index].line, symbol: name } : { file, line: pending.line, symbol: name }
      )),
      validation: [
        ...middleware.filter(Boolean).flatMap((fn) => fn.validation),
        ...(handler?.validation ?? []),
      ],
      terminalResponses: handler?.terminalResponses ?? [],
      dependencies: handler?.calls ?? [],
      handlerUnsupported: handler ? handler.unsupportedCount : null,
    });
  }

  walk(ast, (node) => {
    if (!isAppCall(node) || handled.has(node)) return;
    handled.add(node);
    empty.unsupported.push(item(file, source, node, 'unclassified-app-call', null));
  });

  empty.functions = empty.functions.map(({ detail, ...summary }) => summary);
  return empty;
}

function recordImport(statement, result, imports) {
  if (statement.source.type !== 'Literal' || typeof statement.source.value !== 'string') {
    result.unsupported.push(item(result.file, result.source, statement, 'unsupported-import', null));
    return;
  }
  const names = [];
  for (const specifier of statement.specifiers) {
    if (specifier.type === 'ImportDefaultSpecifier') {
      names.push({ imported: 'default', local: specifier.local.name });
      imports.set(specifier.local.name, { module: statement.source.value, imported: 'default' });
      continue;
    }
    if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
      names.push({ imported: specifier.imported.name, local: specifier.local.name });
      imports.set(specifier.local.name, { module: statement.source.value, imported: specifier.imported.name });
      continue;
    }
    result.unsupported.push(item(result.file, result.source, specifier, 'unsupported-import', null));
    return;
  }
  result.imports.push({
    file: result.file,
    line: statement.loc.start.line,
    module: statement.source.value,
    names,
  });
}

function recordVariable(statement, exported, result) {
  const pattern = statement.kind === 'const' ? 'unsupported-declaration' : 'unsupported-declaration';
  if (statement.declarations.length !== 1 || statement.declarations[0].id.type !== 'Identifier') {
    result.unsupported.push(item(result.file, result.source, statement, pattern, null));
    return;
  }
  const declarator = statement.declarations[0];
  const name = declarator.id.name;
  if (statement.kind === 'const' && declarator.init?.type === 'Literal') {
    result.constants.push({
      file: result.file,
      name,
      literal: declarator.init.value,
      line: declarator.loc.start.line,
      note: 'Observed source literal. Not an assertion source.',
    });
    if (exported) result.exports.push({ file: result.file, name, kind: 'const', line: statement.loc.start.line });
    return;
  }
  if (statement.kind === 'const' && isExpressAppInit(declarator.init) && name === 'app') {
    result.setups.push({ file: result.file, kind: 'express-app', line: declarator.loc.start.line, symbol: 'app' });
    if (exported) result.exports.push({ file: result.file, name, kind: 'const', line: statement.loc.start.line });
    return;
  }
  const initPattern = declarator.init?.type === 'NewExpression' ? 'new-expression' : pattern;
  result.unsupported.push(item(result.file, result.source, statement, initPattern, name));
}

function recordFunction(fn, exported, result, imports, handled) {
  const analyzed = analyzeFunction(fn, result.file, result.source, imports, handled, result.unsupported);
  result.dto.push(...analyzed.dto);
  if (exported) result.exports.push({ file: result.file, name: analyzed.name, kind: 'function', line: fn.loc.start.line });
  result.functions.push({
    file: result.file,
    name: analyzed.name,
    line: analyzed.line,
    authGate: analyzed.authGate,
    unsupportedCount: analyzed.unsupportedCount,
    detail: analyzed,
  });
}

function analyzeFunction(fn, file, source, imports, handled, unsupported) {
  const info = {
    name: fn.id?.name ?? '(anonymous)',
    line: fn.loc.start.line,
    validation: [],
    terminalResponses: [],
    calls: [],
    dto: [],
    authGate: false,
    callsNext: false,
    unsupportedCount: 0,
  };
  if (!fn.id || fn.params.some((param) => param.type !== 'Identifier')) {
    unsupported.push(item(file, source, fn, 'destructured-parameter', info.name));
    info.unsupportedCount += 1;
    return info;
  }
  if (fn.async || fn.generator || fn.params[0]?.name !== 'req' || fn.params[1]?.name !== 'res' || (fn.params[2] && fn.params[2].name !== 'next') || fn.params.length > 3) {
    unsupported.push(item(file, source, fn, 'unsupported-handler-kind-or-bindings', info.name));
    info.unsupportedCount += 1;
    return info;
  }
  const bindings = new Map();
  const ctx = { file, source, functionName: info.name, imports, handled, unsupported, info, hasNextBinding: fn.params[2]?.name === 'next' };
  for (const statement of fn.body.body) {
    if (interpretStatement(statement, bindings, ctx)) continue;
    const pattern = statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression'
      ? 'assignment'
      : statement.type === 'VariableDeclaration' && statement.kind !== 'const'
        ? 'unsupported-declaration'
        : 'unsupported-statement';
    unsupported.push(item(file, source, statement, pattern, info.name));
    info.unsupportedCount += 1;
  }
  info.authGate = info.validation.some((entry) => entry.kind === 'auth_header');
  return info;
}

function interpretStatement(statement, bindings, ctx) {
  if (statement.type === 'ExpressionStatement' && classifyAppCall(statement.expression, {
    ...ctx,
    nested: true,
    pendingRoutes: [],
    setups: [],
  })) return true;
  if (parseConst(statement, bindings, ctx)) return true;
  if (parseIf(statement, bindings, ctx)) return true;
  if (statement.type === 'ExpressionStatement' && parseTerminal(statement.expression, ctx)) return true;
  if (statement.type === 'ExpressionStatement' && ctx.hasNextBinding && isNextCall(statement.expression)) {
    ctx.info.callsNext = true;
    return true;
  }
  if (statement.type === 'ReturnStatement' && (
    statement.argument == null
    || statement.argument.type === 'Identifier'
    || statement.argument.type === 'Literal'
  )) return true;
  return false;
}

function parseConst(statement, bindings, ctx) {
  if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') return false;
  if (statement.declarations.length !== 1 || statement.declarations[0].id.type !== 'Identifier') return false;
  const declarator = statement.declarations[0];
  const name = declarator.id.name;
  const binding = declarator.init && parseReqBinding(declarator.init);
  if (binding) {
    bindings.set(name, binding);
    return true;
  }
  if (declarator.init?.type === 'ObjectExpression') {
    const keys = parseDtoObject(declarator.init);
    if (!keys) return false;
    ctx.info.dto.push({
      file: ctx.file,
      function: ctx.functionName,
      line: statement.loc.start.line,
      local: name,
      keys,
    });
    bindings.set(name, { source: 'object' });
    return true;
  }
  const call = declarator.init && parseImportedCall(declarator.init, ctx);
  if (!call || !call.argumentsSupported) return false;
  ctx.info.calls.push({ ...call, line: statement.loc.start.line, file: ctx.file });
  bindings.set(name, { source: 'call', callee: call.callee });
  return true;
}

function parseIf(statement, bindings, ctx) {
  if (statement.type !== 'IfStatement') return false;
  if (statement.alternate) {
    ctx.unsupported.push(item(ctx.file, ctx.source, statement, 'else-branch', ctx.functionName));
    ctx.info.unsupportedCount += 1;
    return true;
  }
  const condition = parseCondition(statement.test, bindings);
  if (!condition || statement.consequent.type !== 'BlockStatement') return false;
  const body = statement.consequent.body;
  if (body.length !== 2 || body[0].type !== 'ExpressionStatement' || body[1].type !== 'ReturnStatement' || body[1].argument != null) {
    return false;
  }
  const response = parseResponse(body[0].expression);
  if (!response || response.bodyKind !== 'literal') return false;
  ctx.info.validation.push({
    ...condition,
    optional: condition.optional === true,
    file: ctx.file,
    line: statement.loc.start.line,
    observedRejection: {
      status: response.status,
      body: response.literal,
      line: response.line,
      note: 'Implementation observation. Not an assertion source.',
    },
  });
  return true;
}

function parseTerminal(expression, ctx) {
  const response = parseResponse(expression);
  if (!response) return false;
  ctx.info.terminalResponses.push({
    status: response.status,
    bodyKind: response.bodyKind,
    name: response.name ?? null,
    literal: response.literal ?? null,
    line: response.line,
    note: 'Implementation observation. Not an assertion source.',
  });
  return true;
}

function parseResponse(expression) {
  if (expression.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.computed) return null;
  if (expression.callee.property.name !== 'json' || expression.arguments.length !== 1) return null;
  const statusCall = expression.callee.object;
  if (statusCall.type !== 'CallExpression' || statusCall.callee.type !== 'MemberExpression' || statusCall.callee.computed) return null;
  if (statusCall.callee.object.type !== 'Identifier' || statusCall.callee.object.name !== 'res') return null;
  if (statusCall.callee.property.name !== 'status' || statusCall.arguments.length !== 1) return null;
  const statusArg = statusCall.arguments[0];
  if (statusArg.type !== 'Literal' || typeof statusArg.value !== 'number') return null;
  const body = parseResponseBody(expression.arguments[0]);
  if (!body) return null;
  return { status: statusArg.value, line: expression.loc.start.line, ...body };
}

function parseResponseBody(node) {
  if (node.type === 'Identifier') return { bodyKind: 'identifier', name: node.name };
  if (node.type !== 'ObjectExpression') return null;
  const literal = {};
  for (const property of node.properties) {
    if (property.type !== 'Property' || property.computed || property.shorthand || property.key.type !== 'Identifier') return null;
    if (property.value.type !== 'Literal') return null;
    literal[property.key.name] = property.value.value;
  }
  return { bodyKind: 'literal', literal };
}

function parseCondition(node, bindings) {
  const typeCondition = parseTypeCondition(node, bindings);
  if (typeCondition) return typeCondition;
  const authCondition = parseAuthCondition(node, bindings);
  if (authCondition) return authCondition;
  if (node.type === 'UnaryExpression' && node.operator === '!' && node.argument.type === 'Identifier') {
    return { kind: 'falsy', local: node.argument.name, field: null };
  }
  if (node.type === 'LogicalExpression' && node.operator === '||') return parseOrCondition(node, bindings);
  if (node.type === 'LogicalExpression' && node.operator === '&&') return parseAndCondition(node, bindings);
  return null;
}

function parseTypeCondition(node, bindings) {
  if (node.type !== 'BinaryExpression' || node.operator !== '!==') return null;
  if (node.left.type !== 'UnaryExpression' || node.left.operator !== 'typeof' || node.left.argument.type !== 'Identifier') return null;
  if (node.right.type !== 'Literal' || typeof node.right.value !== 'string') return null;
  const local = node.left.argument.name;
  return { kind: 'type', local, field: fieldOf(bindings, local), expectedType: node.right.value };
}

function parseAuthCondition(node, bindings) {
  if (node.type !== 'BinaryExpression' || node.operator !== '!==' || node.left.type !== 'Identifier') return null;
  const right = node.right;
  if (right.type !== 'BinaryExpression' || right.operator !== '+' || right.left.type !== 'Literal' || right.left.value !== 'Bearer ') return null;
  if (right.right.type !== 'Identifier' || bindings.get(node.left.name)?.header !== 'authorization') return null;
  return {
    kind: 'auth_header',
    local: node.left.name,
    field: null,
    header: bindings.get(node.left.name)?.header ?? null,
    schemePrefix: 'Bearer ',
    constant: right.right.name,
  };
}

function parseOrCondition(node, bindings) {
  const parts = flatten(node, '||');
  const lengths = parts.map(parseLengthCompare);
  if (lengths.every(Boolean)) return lengthResult(lengths, bindings);
  const types = [];
  const ranges = [];
  for (const part of parts) {
    const typeCondition = parseTypeCondition(part, bindings);
    const lengthCondition = parseLengthCompare(part);
    if (typeCondition) types.push(typeCondition);
    else if (lengthCondition) ranges.push(lengthCondition);
    else return null;
  }
  if (types.length !== 1) return null;
  if (ranges.some((part) => part.local !== types[0].local)) return null;
  return { ...types[0], ...rangeBounds(ranges) };
}

function parseAndCondition(node, bindings) {
  const parts = flatten(node, '&&');
  if (parts.every(isEnumLeaf)) {
    const local = parts[0].left.name;
    if (parts.some((part) => part.left.name !== local)) return null;
    return { kind: 'enum', local, field: fieldOf(bindings, local), values: parts.map((part) => part.right.value) };
  }
  if (parts.length === 2 && isUndefinedCheck(parts[0])) {
    const inner = parseCondition(parts[1], bindings);
    if (!inner || inner.local !== parts[0].left.name) return null;
    return { ...inner, optional: true };
  }
  return null;
}

function lengthResult(parts, bindings) {
  if (parts.some((part) => part.local !== parts[0].local)) return null;
  return {
    kind: 'length',
    local: parts[0].local,
    field: fieldOf(bindings, parts[0].local),
    ...rangeBounds(parts),
  };
}

function rangeBounds(parts) {
  const bounds = {};
  for (const part of parts) {
    if (part.operator === '<') bounds.minLength = part.value;
    if (part.operator === '>') bounds.maxLength = part.value;
  }
  return bounds;
}

function parseLengthCompare(node) {
  if (node.type !== 'BinaryExpression' || (node.operator !== '<' && node.operator !== '>')) return null;
  if (node.left.type !== 'MemberExpression' || node.left.computed || node.left.property.name !== 'length') return null;
  if (node.left.object.type !== 'Identifier' || node.right.type !== 'Literal' || typeof node.right.value !== 'number') return null;
  return { local: node.left.object.name, operator: node.operator, value: node.right.value };
}

function isEnumLeaf(node) {
  return node.type === 'BinaryExpression'
    && node.operator === '!=='
    && node.left.type === 'Identifier'
    && node.right.type === 'Literal'
    && typeof node.right.value === 'string';
}

function isUndefinedCheck(node) {
  return node.type === 'BinaryExpression'
    && node.operator === '!=='
    && node.left.type === 'Identifier'
    && node.right.type === 'Identifier'
    && node.right.name === 'undefined';
}

function fieldOf(bindings, local) {
  return bindings.get(local)?.field ?? null;
}

function parseReqBinding(node) {
  if (node.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') return null;
  const middle = node.object;
  if (middle.type !== 'MemberExpression' || middle.computed || middle.property.type !== 'Identifier') return null;
  if (middle.object.type !== 'Identifier' || middle.object.name !== 'req') return null;
  const name = node.property.name;
  if (middle.property.name === 'body') return { source: `req.body.${name}`, field: name };
  if (middle.property.name === 'params') return { source: `req.params.${name}`, param: name };
  if (middle.property.name === 'headers') return { source: `req.headers.${name}`, header: name };
  return null;
}

function parseImportedCall(node, ctx) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return null;
  const imported = ctx.imports.get(node.callee.name);
  if (!imported) return null;
  return {
    callee: node.callee.name,
    module: imported.module,
    argumentsSupported: node.arguments.every(isSupportedArgument),
  };
}

function isSupportedArgument(node) {
  if (node.type === 'Identifier' || node.type === 'Literal') return true;
  if (node.type === 'MemberExpression') return Boolean(parseReqBinding(node));
  if (node.type === 'ObjectExpression') return Boolean(parseDtoObject(node));
  return false;
}

function parseDtoObject(node) {
  if (node.type !== 'ObjectExpression') return null;
  const keys = [];
  for (const property of node.properties) {
    if (property.type !== 'Property' || property.computed || property.method) return null;
    if (property.key.type !== 'Identifier') return null;
    if (property.shorthand) {
      keys.push({ name: property.key.name, kind: 'shorthand' });
      continue;
    }
    if (property.value.type === 'Literal') {
      keys.push({ name: property.key.name, kind: 'literal', literal: property.value.value });
      continue;
    }
    if (property.value.type === 'Identifier') {
      keys.push({ name: property.key.name, kind: 'identifier', identifier: property.value.name });
      continue;
    }
    if (
      property.value.type === 'MemberExpression'
      && !property.value.computed
      && property.value.object.type === 'Identifier'
      && property.value.property.type === 'Identifier'
    ) {
      keys.push({ name: property.key.name, kind: 'dynamic' });
      continue;
    }
    return null;
  }
  return keys;
}

function classifyAppCall(node, ctx) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return false;
  const chained = chainedRoute(node);
  if (chained) {
    ctx.handled.add(node);
    ctx.handled.add(chained);
    ctx.unsupported.push(item(ctx.file, ctx.source, node, 'chained-route', 'app.route'));
    return true;
  }
  const callee = node.callee;
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'app') return false;
  ctx.handled.add(node);
  if (ctx.nested) {
    ctx.unsupported.push(item(ctx.file, ctx.source, node, 'nested-registration', 'app'));
    return true;
  }
  if (callee.computed) {
    ctx.unsupported.push(item(ctx.file, ctx.source, node, 'computed-method', 'app'));
    return true;
  }
  const methodName = callee.property.type === 'Identifier' ? callee.property.name : null;
  if (methodName === 'use') {
    if (isJsonSetup(node)) {
      ctx.setups.push({ file: ctx.file, kind: 'json-parser', line: node.loc.start.line, symbol: 'express.json' });
      return true;
    }
    ctx.unsupported.push(item(ctx.file, ctx.source, node, 'unsupported-middleware', 'app.use'));
    return true;
  }
  if (!HTTP_METHODS.has(methodName)) {
    ctx.unsupported.push(item(ctx.file, ctx.source, node, 'unsupported-app-method', methodName));
    return true;
  }
  if (node.arguments.length < 2) {
    ctx.unsupported.push(item(ctx.file, ctx.source, node, 'unsupported-route-arity', `app.${methodName}`));
    return true;
  }
  const [pathArg, ...originalHandlers] = node.arguments;
  const handlers = originalHandlers.map((handler, index) => {
    if ((handler.type === 'ArrowFunctionExpression' || handler.type === 'FunctionExpression') && handler.body.type === 'BlockStatement' && !handler.async && !handler.generator && ctx.inlineFunction) {
      const name = `inline_${node.loc.start.line}_${node.start}_${index}`;
      const id = { type: 'Identifier', name };
      ctx.inlineFunction({ ...handler, type: 'FunctionDeclaration', id });
      return id;
    }
    return handler;
  });
  if (pathArg.type !== 'Literal' || typeof pathArg.value !== 'string') {
    ctx.unsupported.push(item(ctx.file, ctx.source, node, pathPattern(pathArg), `app.${methodName}`));
    return true;
  }
  if (handlers.some((handler) => handler.type !== 'Identifier')) {
    const inline = handlers.some((handler) => handler.type === 'ArrowFunctionExpression' || handler.type === 'FunctionExpression');
    ctx.unsupported.push(item(ctx.file, ctx.source, node, inline ? 'inline-handler' : 'non-identifier-handler', `app.${methodName}`));
    return true;
  }
  const parsedPath = parseRoutePath(pathArg.value);
  if (!parsedPath) {
    ctx.unsupported.push(item(ctx.file, ctx.source, node, 'unsupported-path-syntax', `app.${methodName}`));
    return true;
  }
  ctx.pendingRoutes.push({
    method: methodName.toUpperCase(),
    path: pathArg.value,
    params: parsedPath,
    middleware: handlers.slice(0, -1).map((handler) => handler.name),
    handler: handlers.at(-1).name,
    line: node.loc.start.line,
  });
  return true;
}

function pathPattern(node) {
  if (node.type === 'TemplateLiteral') return 'template-path';
  if (node.type === 'CallExpression') return 'call-expression-path';
  if (node.type === 'BinaryExpression') return 'concatenated-path';
  if (node.type === 'Identifier') return 'identifier-path';
  return 'non-literal-path';
}

function chainedRoute(node) {
  if (node.callee.type !== 'MemberExpression' || node.callee.computed || !HTTP_METHODS.has(node.callee.property.name)) return null;
  const inner = node.callee.object;
  if (inner.type !== 'CallExpression' || inner.callee.type !== 'MemberExpression' || inner.callee.computed) return null;
  if (inner.callee.object.type !== 'Identifier' || inner.callee.object.name !== 'app' || inner.callee.property.name !== 'route') return null;
  return inner;
}

function isJsonSetup(node) {
  if (node.arguments.length !== 1 || node.arguments[0].type !== 'CallExpression') return false;
  const call = node.arguments[0];
  if (call.arguments.length !== 0 || call.callee.type !== 'MemberExpression' || call.callee.computed) return false;
  return call.callee.object.type === 'Identifier'
    && call.callee.object.name === 'express'
    && call.callee.property.name === 'json';
}

function isExpressAppInit(node) {
  return node?.type === 'CallExpression'
    && node.callee.type === 'Identifier'
    && node.callee.name === 'express'
    && node.arguments.length === 0;
}

function isNextCall(node) {
  return node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'next' && node.arguments.length === 0;
}

function parseRoutePath(path) {
  if (!path.startsWith('/')) return null;
  const params = [];
  for (const segment of path.split('/').slice(1)) {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
      params.push(name);
      continue;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  }
  return params;
}

function isAppCall(node) {
  return node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && chainHasApp(node.callee);
}

function chainHasApp(node) {
  let current = node;
  while (current) {
    if (current.type === 'Identifier') return current.name === 'app';
    if (current.type === 'MemberExpression') current = current.object;
    else if (current.type === 'CallExpression') current = current.callee;
    else return false;
  }
  return false;
}

function flatten(node, operator) {
  if (node.type === 'LogicalExpression' && node.operator === operator) {
    return [...flatten(node.left, operator), ...flatten(node.right, operator)];
  }
  return [node];
}

function item(file, source, node, pattern, symbol) {
  return { file, line: node.loc?.start.line ?? null, pattern, symbol, snippet: snippet(source, node) };
}

function snippet(source, node) {
  const line = node.loc?.start.line ?? 1;
  return (source.split('\n')[line - 1] ?? '').trim().slice(0, 180);
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else walk(value, visit);
  }
}
