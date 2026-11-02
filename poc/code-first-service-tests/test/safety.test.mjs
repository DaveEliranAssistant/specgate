import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSpec } from '../src/generate.mjs';
import { assertHarnessSpecifier, assertLoopbackBaseUrl } from '../src/safety.mjs';

test('loopback guard accepts only local http URLs', () => {
  assert.equal(assertLoopbackBaseUrl('http://127.0.0.1:4317').port, '4317');
  assert.equal(assertLoopbackBaseUrl('http://localhost:9').hostname, 'localhost');
  assert.throws(() => assertLoopbackBaseUrl('http://127.0.0.1.evil.com'), /non-local/);
  assert.throws(() => assertLoopbackBaseUrl('https://127.0.0.1'), /http/);
  assert.throws(() => assertLoopbackBaseUrl('http://example.com'), /non-local/);
  assert.throws(() => assertLoopbackBaseUrl('http://user:pass@127.0.0.1'), /Credentials/);
});

test('harness specifier stays inside the proof of concept', () => {
  assert.doesNotThrow(() => assertHarnessSpecifier('../fixture/ticket-desk/runtime.mjs'));
  assert.throws(() => assertHarnessSpecifier('../../server.mjs'), /Unsafe/);
  assert.throws(() => assertHarnessSpecifier('http://evil.example/runtime.mjs'), /Unsafe/);
  assert.throws(() => assertHarnessSpecifier('/etc/passwd'), /Unsafe/);
});

test('generator refuses a remote harness', () => {
  assert.throws(() => generateSpec({ auth: { scheme: 'Bearer', syntheticCredential: 'synthetic-token' }, scenarios: [] }, {
    harnessSpecifier: 'http://evil.example/runtime.mjs',
  }), /Unsafe/);
});
