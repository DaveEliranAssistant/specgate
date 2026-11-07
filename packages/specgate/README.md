# SpecGate — code-first release candidate

**0.1.0-rc.2 · npm `latest` and `next` prerelease · Pilot use only · No OpenAPI input · MIT**

Scan service source, review changed behavior, and compile independently reviewed scenarios into Playwright API tests. This is a local CLI, not a hosted upload service or an autonomous test-writing agent. Production qualification is **not complete**: a representative real service, an independently approved correctness baseline and platform qualification are release gates.

## Install and scan

Node 22 or 24 and Git, Linux/macOS. Windows is not qualified.

```sh
npm exec --package=@qe-atlas/specgate@0.1.0-rc.2 -- specgate scan \
  --root ./my-service --source src --format markdown
```

From a source checkout:

```sh
npm ci --prefix packages/specgate --ignore-scripts
node packages/specgate/bin/specgate.mjs scan \
  --root ./my-service --source src --format markdown
```

`--source` is mandatory and repeatable. **Only committed source is scanned.** The default revision is `HEAD`, resolved once to an exact commit; `--revision` accepts `HEAD` or a full commit SHA. Uncommitted edits/untracked files are not scanned. Source is read from Git tree/blob objects with object-integrity checks, never through mutable working-tree source paths. The scanner does not import source, invoke project scripts, install target dependencies or contact a model/network service. Directories excluded by name: `.git`, `node_modules`, `dist`, `build`, `coverage`, `.next`. Only explicit source scopes are covered; imports are not followed outside those scopes. Include dependency modules in your scopes to detect their changes; unsupported statements will require manual review.

Reports contain route IDs, file/line references, content hashes, observed validation/auth/status information and coverage gaps. Implementation observations are **not assertions**. Literal constants, response bodies, enum values, source snippets, absolute checkout paths and parser error text are not emitted. Identifiers/paths are retained and may still be confidential. This is not a complete secret scanner.

### Supported adapter

The first adapter is deliberately narrow: JavaScript ESM, Express default import named `express`, top-level `const app = express()`, literal GET/POST/PUT/PATCH/DELETE paths, same-file named handlers and block-bodied synchronous inline handlers. Handler analysis recognizes the documented prototype's `req`/`res`/`next` grammar: selected type/length/enum checks, bearer comparison, literal numeric status and JSON responses.

TypeScript/JSX/CommonJS, routers/mount prefixes, aliases, async/expression-bodied inline handlers, decorators, dynamic registration, imported handlers, general control flow, database/outbound dependency analysis and arbitrary authentication schemes are **not supported**. Gaps and unknown middleware prevent green results. `auth: not_observed` does not mean unauthenticated. `complete: true` means only that the declared subset encountered no reported gaps, not full semantic coverage, safety or correct behavior.

### Resource bounds

At most 2,000 source files; 1 MiB/file; 20 MiB total; 10,000 selected Git entries; Git acquisition has a 30-second aggregate deadline with each command capped at 10 seconds; parser worker limited to 128 MiB old-generation memory and 10 seconds. API limits can only be reduced. Committed symlinks, submodules, escape paths and binary files fail closed. Working-tree source substitutions are ignored because source comes from pinned blobs. These controls are defense in depth, **not** an OS sandbox against a hostile local process corrupting repository metadata. Use isolated repository metadata and trusted host Git; run untrusted inputs without credentials and with network denied at the job/container level.

## Review changes in CI

```sh
# Inspect the initial report and commit it ONLY after human review.
node packages/specgate/bin/specgate.mjs scan \
  --root ./my-service --source src --output proposed-scan.json

# Use the approved baseline from a trusted base revision, not the PR branch.
node packages/specgate/bin/specgate.mjs check \
  --root ./my-service --source src --baseline trusted-baseline.json
```

- `0`: unchanged declared subset / successful scan or generation. **Not** permission to release.
- `1`: changed source/routes, partial analysis or an empty route inventory; review required.
- `2`: invalid input, corrupt/incompatible baseline, I/O failure or resource failure.

JSON is the default; `--format markdown` is available for scan/check. Output files use exclusive creation (`0600`) and cannot overwrite a baseline or existing test. There is no auto-accept switch. Fingerprints detect drift, not authenticity: protect baseline review with branch protection/CODEOWNERS as appropriate. A changed source hash conservatively requires review even for comments; impact minimization remains experimental in the separate POC. Exit 1 means review, not a proven defect.

## Generate executable API tests

Prepare a trusted, reviewed JSON scenario file. Minimal example:

```json
{
  "schemaVersion": "specgate.scenarios/1",
  "review": { "reference": "requirements/tickets.md#approved-create" },
  "scenarios": [{
    "id": "tickets.create",
    "classification": "approved_requirement",
    "steps": [{
      "method": "POST", "path": "/tickets", "body": { "title": "example" },
      "auth": { "bearerEnv": "TEST_API_TOKEN" },
      "expected": { "status": 201, "bodyMatch": { "ok": true } },
      "extract": { "ticketId": "id" }
    }],
    "cleanup": []
  }]
}
```

```sh
node packages/specgate/bin/specgate.mjs generate \
  --root ./my-service --source src \
  --scenarios reviewed-scenarios.json --output api.spec.mjs
# In a project with @playwright/test installed and a test-only service already running:
SPECGATE_BASE_URL=http://127.0.0.1:3000 npx --no-install playwright test api.spec.mjs
```

Use a Playwright config with `testMatch: '*.spec.mjs'`, one worker, zero retries, traces disabled and controlled report retention. Execution is a separate explicit step; SpecGate never starts scanned code. Every request must match a discovered route and use a reviewed status assertion. Exact `bodyEquals` or subset `bodyMatch` are optional; prefer exact matching when additive contradictory fields matter. Later steps can use `/tickets/{{ticketId}}`. Extraction names/fields and paths are restricted; unresolved or unsafe extracted values fail closed. Optional cleanup steps have the same schema and run in `finally`; provision test-only fixtures and handle partial-failure recovery externally. Credentials must be environment references; literal credential-like body keys are refused. A reference string is not proof of actual approval—trusted review is an operational requirement.

Generated tests only allow `http://127.0.0.1:PORT`, refuse redirects, use bounded request/test timeouts and never import service source. A loopback proxy can still forward traffic elsewhere: do not expose production systems through it. No automatic assertion repair, baseline acceptance, deployment, authentication bypass or external requests are provided.

## Verification and rollout

```sh
npm ci --ignore-scripts                         # root Playwright dev dependency
npm ci --prefix packages/specgate --ignore-scripts
npm test --prefix packages/specgate
npm audit --prefix packages/specgate --omit=dev
cd packages/specgate
npm pack --pack-destination /approved/output/path
```

Use the pinned archive produced by `npm pack` (or pack from inside this directory), verify its SHA-256 and retain local receipts. Acorn is exact-pinned and bundled with its license, so the tested archive installs offline even with an empty npm cache. Packed runtime excludes POC, tests, reports and repository metadata. The GitHub workflow runs quality checks only; it does not publish/deploy or access production credentials. Keep its required-check settings an explicit repository-owner decision.

Rollout: independent review → reproduce tests/audits → immutable archive install smoke → representative real-service qualification → observe-only CI pilot → investigate false positives/gaps → owner-approved enforcement/release. Roll back by removing the consuming CI step or pinning the previous accepted archive; do not rewrite accepted baselines to hide failures. No automatic startup, cron or product-site deployment is introduced.

See `SECURITY.md`, `NOTICE.md`, and the repository's release-readiness report. Full multi-framework/AI generation, real integration/E2E composition, real-customer acceptance, Windows support, signed registry releases and a vulnerability-disclosure service are not delivered by this candidate.

## npm release

MIT licensed (see `LICENSE`). Acorn is MIT-licensed; its bundled license is checked by the isolated install smoke. Root/POC tooling is excluded from the archive and the repository root stays `private`. With npm authenticated as **qe-atlas** (none of this runs in CI):

```sh
npm whoami # must print qe-atlas
npm test
npm run test:pack
cd packages/specgate
npm pack --dry-run
npm publish --dry-run --access public --tag next
npm publish --access public --tag next
```
