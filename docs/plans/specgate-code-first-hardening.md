# SpecGate code-first release candidate Implementation Plan

> **For Hermes:** Execute directly under the owner's lean-operator direction; use test-driven-development and a separate review before release. Do not create a replacement team.

**Goal:** Turn the isolated code-first prototype into an installable, fail-closed local CLI and CI release candidate; no OpenAPI input and no production deployment.

**Architecture:** Preserve Grok's POC unchanged under poc/. Reuse its static Acorn discovery in a self-contained packages/specgate package; bound repository inputs and parser resources, project observations without source literals, and compare versioned snapshots without accepting changed behavior automatically. Compile explicitly reviewed scenario files into Playwright API tests for an explicitly supplied loopback target; never execute scanned source or infer correctness from implementation.

**Tech Stack:** Node 22+, ESM, Acorn, node:test, Playwright for generated API tests. No model calls, hosted service, secrets, scheduler or paid resource.

## Acceptance boundaries
- Explicit source scopes only, containment and symlink checks, bounded file/count/bytes/parser time/memory; no repository imports or install scripts during scanning.
- Deterministic JSON/Markdown reports with stable route IDs, hashes, provenance and explicit unsupported/partial-analysis findings. Partial, empty and failed scans cannot report a green gate.
- check command compares trusted snapshots; route removals and changed source require review. It never overwrites a baseline or weakens a test. Stable exit codes: 0 pass, 1 findings/review required, 2 invalid input/tool failure.
- generate requires reviewed assertions, an existing discovered route and valid scenario references. Credentials are environment references, never embedded; generated tests refuse non-loopback targets and redirects.
- Package allowlist, locked/audited dependencies, offline installation smoke test, CI workflow with read-only permissions and no deploy permissions, security/runbook/support-matrix documentation.
- Reproduce POC's good/seeded-defect/maintenance runs independently. Retain evidence and distinguish synthetic checks from real-customer qualification. Preserve static site's baseline tests/build and deployment settings.

### Task 1: Input boundary and code scan
Files: packages/specgate/test/scan.test.mjs, src/scan.mjs, src/parser-worker.mjs, src/engine/*.
1. Write tests for explicit scopes, route discovery, no execution, secret-free projection, path escape/symlink/limits, unsupported TypeScript, deterministic results and zero routes.
2. Run node --test packages/specgate/test/scan.test.mjs and record expected RED failures.
3. Implement bounded filesystem collection, worker parsing and safe normalized output by reusing POC discovery.
4. Run focused tests until green.

### Task 2: Versioned reports and CI CLI
Files: packages/specgate/test/cli.test.mjs, src/gate.mjs, src/cli.mjs, bin/specgate.mjs.
1. Write subprocess tests for scan/check JSON/Markdown, strict arguments, partial gate, tampered snapshots, removals and changed-source review.
2. Observe RED; implement validated snapshots, deterministic comparison and CLI with documented exit codes.
3. Run focused and combined suites; do not add automatic accept/update flags.

### Task 3: Reviewed executable scenarios
Files: packages/specgate/test/generate.test.mjs, src/generate.mjs, test/runtime.test.mjs.
1. Write RED tests for schema/reference/method/path checks, independent expectations, credential references, unsafe input/code-injection rejection, and loopback-only generated runtime.
2. Implement standalone Playwright compilation and CLI generate with no scanned-code imports or implicit test execution.
3. Execute generated tests against a controlled loopback Node HTTP service, then a seeded wrong-status implementation. Verify expected failure rather than changing assertions.

### Task 4: Reproduction, packaging and review
Files: packages/specgate/package.json, package-lock.json, README.md, SECURITY.md, .github/workflows/specgate-code-first.yml, docs/reports/*.
1. Install exact dependencies with lifecycle scripts disabled. Run old POC and current site regression/build tests plus new package suites.
2. Audit production dependencies; pack allowlisted artifacts, install the archive in scratch and exercise installed CLI against a repository scope.
3. Record actual command results, unresolved gaps and production rollout/rollback requirements. A synthetic service does not establish customer readiness.
4. Review diff for correctness/security, fix with regression tests, repeat verification, update shared knowledge/handoff, commit and open a draft PR. Read back remote commit/PR; do not merge or deploy.
