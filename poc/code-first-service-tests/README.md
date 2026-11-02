# Code-first service tests (synthetic proof of concept)

Isolated proof that an agent-style tool can read a small service, emit versioned scenarios and executable Playwright API tests, and keep those tests stable when the source changes. Expectations come from `baseline/behavior-baseline.json`. The service implementation is evidence, not the oracle.

This directory does not change the QE Atlas site, `vercel.json`, root package scripts, or CI. The attached SpecGate handoff was not copied, modified, or imported.

The fixture is synthetic. It validates the mechanics only.

## Supported subset

`express-literal-routes-v1` — Express 4 on Node 22, ESM, with this grammar only:

- `import` default and named specifiers from a string literal.
- `export const app = express()` and `app.use(express.json())`.
- Top-level `app.get|post|put|patch|delete('/literal/path', middleware, handler)` where the path is a string literal (Express `:param` segments allowed) and every handler argument is an identifier.
- Exported `function (req, res)` / `(req, res, next)` handlers.
- Bindings `req.body.field`, `req.params.field`, and `req.headers.authorization`.
- Rejection `if`s whose body is exactly `res.status(number).json({ ...literals })` plus `return`.
- Conditions: `typeof x !== 'string'`, `x.length < N || x.length > M`, `x !== 'a' && x !== 'b'`, `x !== undefined && (...)`, `header !== 'Bearer ' + CONST`, and `!binding`.
- Calls to imported collaborators, and object-literal keys in those collaborators (DTO shape only).
- A terminal `res.status(number).json(...)`.

Anything else is reported under `unsupported` with file, symbol, and line. It does not become a route or an assertion. `fixture/ticket-desk/unsupported.mjs` holds computed methods, template paths, call paths, concatenation, inline handlers, `app.route().get`, and nested registration. `store.mjs` uses `Map` and assignments; those statements are reported and are not treated as expected values.

## What is not supported

Routers, `Router`, regex paths, spread objects, destructured parameters, `else`, `<=` / `>=`, computed keys, dynamic `import()`, auth schemes other than a bearer comparison against a named constant, and any host other than loopback. One framework subset only. No OpenAPI, no hosted target, no model calls.

## Layout

| Path | Role |
| --- | --- |
| `fixture/ticket-desk/` | Synthetic Express service. `runtime.mjs` is the loopback harness and is not scanned. |
| `baseline/behavior-baseline.json` | Reviewed requirements. This is the only assertion source. |
| `src/discover.mjs` | Static discovery. |
| `src/scenarios.mjs` | Versioned scenarios. Copies baseline actions and assertions, then attaches file/symbol/line/commit evidence. |
| `src/generate.mjs` | Playwright API spec. Local `127.0.0.1` only. |
| `src/maintain.mjs` | Impact plan. Assertion edits stay `needsReview` and `applied: false` until `applyReviewedChanges` is given explicit ids. Regression edits are `acceptBlocked`. |
| `generated/` | Committed output of `scripts/generate.mjs`. |
| `maintenance/` | Textual diffs applied only to temporary copies. |
| `evidence/` | Verbatim Playwright and probe output. |

Classifications:

- `approved_requirement` — reviewed behavior, executable.
- `accepted_regression_behavior` — reviewed acceptance (omitted body is stored as `""`), executable. Not scraped from the store.
- `implementation_observation` — discovered fact. Not executable.
- `unverified_proposal` — new route with no baseline case. Not added to the spec.

`sourceCommit` is the git HEAD at generation time. `fixtureSha256` pins the scanned bytes. A later evidence commit can move HEAD without changing the fixture hash.

## Reproduce

From the repository root, with Node 22:

```sh
npm ci
npm install --prefix poc/code-first-service-tests
cd poc/code-first-service-tests
node --test test/*.test.mjs
node scripts/generate.mjs
node scripts/run-generated.mjs
node scripts/prove-seeded-defect.mjs
node scripts/prove-maintenance.mjs
```

Playwright is the root devDependency. The POC installs only `express` and `acorn`. Generated tests bind `127.0.0.1` and call it with Playwright's API request context. No browser download is required for this suite.

Repository regression check, still from the root:

```sh
npm test
npm run test:build
```

On this branch those commands reported 12 passing Node tests, 5 passing Python tests, and 2 passing build tests. No root file outside `poc/code-first-service-tests/` is part of the change.

## Oracle rule

Discovery may record status codes, error strings, token literals, and DTO keys. The compiler does not copy them into assertions. Unit coverage rewrites `201` to `200`, `title_type` to another code, the bearer constant to `HACKED`, and the stored empty body to `'(none)'`. Scenario JSON and the generated spec stay byte-identical, and the create test still contains `toBe(201)`.

The live seeded defect changes only `res.status(201)` to `res.status(200)` in a temporary copy. The generated spec is unchanged and still expects 201. Playwright then fails that expectation.

## Maintenance rule

`maintenance/sample-edits.json` is applied to a temporary copy:

- title max `80` becomes `40` (service behavior)
- ticket object gains `assignee: null` (DTO)
- `GET /audit` is added (route)

`planMaintenance` marks `tickets.create.boundary-title-max` as `genuine_regression`, recommends fixing the service, and lists an assertion patch that would move 80 to 40. That patch is `needsReview: true`, `applied: false`, and `acceptBlocked: true` because adopting 40 would hide the regression. `GET /audit` is an `unverified_proposal` and is not inserted into the spec. `assignee` is an `implementation_observation`; subset matching keeps existing tests stable. The 81-character rejection still passes and stays an approved test, with an observation that it is no longer the tight bound.

An approved change is a separate path. A review record must name the new maximum, that length must match discovery, and `applyReviewedChanges` must be called with that scenario id. Only then does the scenario version increment. A review for 30 while discovery says 40 is rejected and the case stays a regression.

Failure classes:

| Class | Meaning |
| --- | --- |
| `genuine_regression` | Runtime assertion disagrees with the baseline, or static discovery predicts that. Fix the service. Do not edit the test. |
| `approved_behavior_change` | A review record matches the discovered change. The assertion patch waits for an explicit accept list. |
| `fixture_or_setup_breakage` | Parse error, missing `express.json()`, missing `resetStore`, collaborator module change, route registration removed while the handler remains, or a connection/module/syntax error. |
| `flakiness` | Supplied runs both pass and fail, or a timeout has no assertion mismatch. The assertion patch is dropped. Rerun. This was not demonstrated with a live flaky server. |

## Evidence from the runs in this workspace

POC tests, including the check that committed artifacts match a fresh build: `node --test test/*.test.mjs` reported 21 passed, 0 failed.

Good Playwright run (`node scripts/run-generated.mjs`): 21 passed. Stats are in `evidence/playwright-good.json`.

Seeded defect (`node scripts/prove-seeded-defect.mjs`): Playwright stats `expected: 14`, `unexpected: 7`, `flaky: 0`, exit status 1. The create test reports `Expected: 201` and `Received: 200` while the spec still calls `toBe(201)`. Predicted and actual failure ids match. Invalid, unauthorized, and not-found tests still pass, so this is not a dead server. See `evidence/seeded-defect.txt`.

Maintenance diff (`node scripts/prove-maintenance.mjs`): Playwright stats `expected: 20`, `unexpected: 1`, `flaky: 0`. The only failure is `tickets.create.boundary-title-max` with `Expected: 201` and `Received: 400` for the 80-character title. The over-max test and the other ids stay passing. See `evidence/maintenance.txt`.

Closed-port probe in the same script: a real `fetch` to a loopback port that had just been closed returned `ECONNREFUSED` / `connect ECONNREFUSED 127.0.0.1:<port>` and was classified `fixture_or_setup_breakage`. See `evidence/setup-probe.json`.

## Open correctness questions

- Subset `toMatchObject` checks do not fail when the response gains a contradictory extra field. Additive DTO keys are observations only.
- A route that is not statically discoverable is not given a test. The baseline path is still called when the route pattern was known and later disappears; a path that was never a string literal is only an unsupported gap.
- Static impact prediction can miss behavior hidden in unsupported store statements. The empty-body acceptance is a reviewed baseline value for that reason.
- Flakiness classification consumes supplied run records. One passing Playwright run cannot prove the suite is stable across retries.
- `resetStore` is an in-process seam. It is not a product endpoint. If the server moved to another process, cleanup would need another reviewed seam.
- The bearer value in the fixture must match the baseline or authorized tests fail. The generator will not update the test credential to the constant it discovered.
- Scenario `sourceCommit` refers to the commit at generation, which is the parent of the commit that adds the generated files when those are committed separately.

## Out of scope

Hosted services, multiple frameworks, auth portals, schedulers, paid infrastructure, external model or API calls, and uploading this code. Do not point the harness at a non-loopback URL.
