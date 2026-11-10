# SpecGate — code-first release candidate

**0.1.0-rc.4 · npm prerelease · Pilot use only · No OpenAPI input · MIT**

> **New in 0.1.0-rc.4: a project-level Express engine.** SpecGate now follows `express.Router()` mounts and their prefixes across files (nested routers, `router.route()`, `router.param`, literal route tables), reads **CommonJS** (`require`, `module.exports`) as well as ESM, scans **TypeScript** (`.ts/.mts/.cts`, via Node's built-in type stripping, no new dependency), and resolves **imported handlers**, controllers and middleware factories to the files that define them. In a [real-service trial](https://github.com/DaveEliranAssistant/specgate/blob/main/docs/research/real-service-trial.md) on two public Express services (one CommonJS, one TypeScript) it found 53 of 53 routes at their full mounted paths, matched the expected verdict on 15 of 16 real commit pairs (the 16th was stricter, for a correct reason) and flagged both real breaking route renames as `breaking`.
>
> **Honest limit:** contract checking (request validation, response shapes and status codes, auth) does **not** yet cover real handlers. It still applies only to the narrow synchronous `res.status(<literal>).json(...)` grammar, and 0 of the 53 real routes in the trial fit it. Real handlers (async, `res.send`, status constants, Joi/`validate()` middleware, passport/`express-jwt`) are inventoried and fingerprinted, so a changed one is reported as `needs_review` with reasons, but never classified as breaking or passed. `breaking` is provable only for route-level changes (a route, method or path shape removed).

Scan service source, review changed behavior, and compile independently reviewed scenarios into Playwright API tests. This is a local CLI, not a hosted upload service or an autonomous test-writing agent. Production qualification is **not complete**: a representative real service, an independently approved correctness baseline and platform qualification are release gates.

## Install and scan

Node 22 or 24 and Git, Linux/macOS. Windows is not qualified.

```sh
npm exec --package=@qe-atlas/specgate@0.1.0-rc.4 -- specgate scan \
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

The adapter is a static, project-level model of Express (`express-literal-routes-v1` scan schema). Nothing is imported or executed.

- **Languages:** JavaScript ESM and CommonJS (`require`, `module.exports`, `exports.x`), and TypeScript (`.ts/.mts/.cts`) via Node's built-in type stripping (Node ≥ 22.13; older Node reports TypeScript as `unsupported-language`). `.d.ts` files are ignored. TSX/JSX are not supported.
- **Express objects:** `express()` apps and `express.Router()`/`Router()` instances created from the real `express` import (look-alikes are reported as `unverified-express-binding`).
- **Registration:** literal GET/POST/PUT/PATCH/DELETE paths via `x.get(...)`, `x.route(path).get(...).post(...)`, `router.param(name, fn)`, and `use([path], ...)`, including chained `Router().use(a).use(b)` and `export default Router().use('/api', api)`.
- **Mounting:** routers mounted with prefixes across files (`app.use('/api', require('./routes'))`, nested routers, the same router at several prefixes), route tables unrolled from literal arrays (`table.forEach((r) => router.use(r.path, r.route))`), registrations inside top-level `if` blocks (discovered, marked `conditional`, plus a `conditional-registration` gap).
- **Handlers and middleware:** inline functions (sync/async), local functions, handlers imported from other scanned files (controllers, barrels, `module.exports = { ... }` objects), middleware factories (`validate(schema)`, `auth('role')`, `catchAsync(fn)`), external package middleware. Middleware order follows Express: `use` layers apply to routes registered after them; error/fall-through middleware registered later is tracked separately.
- **Contract model:** request validation, bearer-auth and response shape are modeled only for handlers in the documented narrow `req`/`res`/`next` grammar (block-bodied synchronous functions, literal `res.status(n).json(...)`). Everything else is **opaque**: its route is still inventoried and its code and transitive dependency slice are fingerprinted, but no contract is inferred.

Unsupported and reported as gaps: dynamic or template paths with expressions, wildcard/regex paths, `all`/`options`/`head`, routers passed into functions (`setup(app)`), registrations inside functions/loops/callbacks, middleware whose value cannot be resolved (could be a hidden router), routers never mounted, cross-module registration on another module's router, decorators/class controllers and other frameworks. Gaps prevent green scans. `auth: unknown` is reported whenever any middleware in the chain is opaque; `auth: not_observed` never means unauthenticated. `complete: true` means only that the declared subset encountered no reported gaps.

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

## Consumer-break check (`specgate diff`, preview)

> **Preview.** `specgate diff` ships in the npm package (since `0.1.0-rc.3`); `0.1.0-rc.4` adds the project-level engine and the persistent-gap policy described below. Output schema, rules and finding codes may change.

Answers "will this change break my API consumers?" by scanning two committed revisions with the same scanner as `scan` and comparing route-level contracts. No OpenAPI, no model and no network; the service is never started or imported.

```sh
git fetch origin main   # both refs must exist locally; nothing is fetched by SpecGate
npm exec --package=@qe-atlas/specgate@0.1.0-rc.4 -- specgate diff \
  --root ./my-service --source src --base origin/main --head HEAD --format markdown
```

`--base`/`--head` accept branch, tag and remote-tracking names, `HEAD~N` or a commit SHA (no ranges, `:` paths or reflog syntax). By default the head is compared with `merge-base(base, head)`, like a pull-request diff, so routes added to `main` after you branched are not reported as removals; `--base-mode tip` compares with the base tip instead. CI checkouts need enough history for the merge base (`fetch-depth: 0`).

| Classification | Codes |
|---|---|
| `breaking` | `route-removed`, `method-removed`, `path-param-added` (route shape changed), `required-request-field-added`, `request-field-became-required`, `request-field-type-changed`, `request-constraint-tightened`, `request-enum-value-removed`, `rejection-status-changed`, `response-status-changed`, `response-status-removed`, `response-field-removed`, `response-field-type-changed`, `auth-gate-added` |
| `needs_review` | every new or changed `analysis-gap` (base or head); `path-param-renamed` (same route shape, different parameter name); a removal while head has gaps (route may be hidden, not removed); `route-now-matched-by-parameterized-route`; `route-contract-not-analyzable`; `unmodeled-behavior-changed` (handler code changed and its response shape/types or imported calls are not statically visible); `handler-dependency-changed`; `referenced-constant-changed`; `response-literal-value-changed`; `response-status-added`; `optional-request-field-constrained`; `unattributed-validation-changed`; `auth-gate-removed` (security, not a consumer break); `route-chain-changed` (middleware added/removed on an opaque route); `route-became-conditional` / `route-no-longer-conditional`; `trailing-middleware-changed`; `added-route-overlaps-parameterized-route` |
| `non_breaking` | `route-added`, `method-added`, `response-field-added`, `request-constraint-relaxed`, `request-enum-value-added`, `request-field-became-optional`, `request-validation-removed` |

"Required request field" means a body/header input guarded by a recognized `typeof`/length/enum/falsy check that rejects with a literal status. Response fields are compared only when the body is an object literal or a same-handler `const` object literal; field types are known for literals and for locals proven by a required `typeof` or enum check. `path-param-renamed` (for example `/users/:id` → `/users/:userId`) is `needs_review`, not `breaking`: raw URLs still match, but generated SDKs and OpenAPI consumers that address parameters by name may need updating. Adding a parameter segment or otherwise changing the route shape stays `breaking` (`path-param-added`) or is reported as a removal plus an addition.

**Opaque routes and persistent gaps.** For a route whose handler or middleware is outside the contract model, `diff` compares fingerprints instead of contracts: the chain's own code, the transitive dependency slice (referenced top-level symbols, the specific members used from imported scanned modules, module-load side effects) and the error/fall-through middleware after it. If any of these changed, the route gets `route-contract-not-analyzable` with reasons (`route-code-changed`, `dependency-changed`, `trailing-middleware-changed`, …); if none changed, nothing is reported for it. An unsupported construct whose code **and** dependency slice are byte-identical in both revisions is a *persistent gap*: it is listed under `coverage.persistentGaps` and does not by itself fail the check, because the change under review cannot have altered it. Any new, removed or changed gap is still an `analysis-gap` (`needs_review`). Removals are `breaking` only when the head revision has no new or changed gaps.

Comment-only edits, formatting, declaration/registration reordering and handler renames do not produce findings: routes are matched by method and path, and handler evidence is a normalized AST hash (comments, positions and the function's own name removed). Literal values (tokens, enum members, response values) appear only as short hashes and are never printed.

Output is JSON (`specgate.diff/1`, default) or `--format markdown`. JSON is sealed with a SHA-256 `fingerprint` over its canonical form. Findings are ordered by classification, method, path and code, so identical inputs produce byte-identical reports. Each report records both commits, both scan fingerprints and the exit-code meanings.

- `0`: no `breaking` and no `needs_review` finding **within the supported static subset**. **This is not a compatibility guarantee.** Runtime behavior, data, external packages, unscanned files and anything the scanner cannot model are not covered.
- `1`: at least one `breaking` or `needs_review` finding. Any new, removed or changed analysis gap yields 1; persistent (byte-identical) gaps are listed in coverage.
- `2`: unreadable input: unknown/unsafe ref, missing merge base, source scope missing from a revision, invalid arguments, unsafe path, resource limit or analysis failure. Arguments are not echoed.

See [docs/CONSUMER_DIFF_CI.md](../../docs/CONSUMER_DIFF_CI.md) for a GitHub Actions example (documentation only) and [docs/research/consumer-break-mode-b.md](../../docs/research/consumer-break-mode-b.md) for limits and next steps. The optional `poc/agentic-triage` spike is unrelated to this verdict; no model is involved in `diff`.

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
