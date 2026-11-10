# Real-service trial: SpecGate on two public Express services

**Date:** 2026-11-10 · **Branch:** `real-service-trial` (draft PR, unreleased) · **Baseline:** `main` @ `751f18c` (= published `0.1.0-rc.3`)

## Verdict: is this past POC?

**Partly. It is now a working tool for one job, and still a POC for another.**

- **Route inventory and consumer-break triage on conventional Express services: past POC.** On two real, independently written services (one CommonJS, one TypeScript), SpecGate now finds **53 of 53** routes, at their full mounted paths, with handler and middleware locations across files. Across 16 real commit pairs it flags both real breaking renames as `breaking`, reports the 3 purely additive commits as exit 0, and limits `needs_review` to the routes whose code or dependencies actually changed. Across 18 seeded mutations of real code (prefix, method and path changes, deleted routes, validator, controller, service, auth middleware and error-handler edits, hidden registrations, comment-only edits) there were no silent passes, and none of the 3 behavior-preserving edits was flagged.
- **Contract checking (request validation, response shapes, auth) on real services: still a POC.** **0 of 53** real routes fit the narrow contract grammar (async handlers, `res.send`, `httpStatus.CREATED`, Joi/`validate()` middleware, `express-jwt`/passport). So `breaking` is provable only for inventory-level changes: route, method or path shape removed. Behavioral changes (status codes, validation, auth) are reported as `needs_review` with reasons. They are never classified, and they are never passed.

What's still missing before calling it a product is listed under [Remaining limits](#remaining-limits-and-whats-missing).

## Targets

| Target | Upstream | Language / style | License | Trial range |
|---|---|---|---|---|
| `boilerplate` | [hagopj13/node-express-boilerplate](https://github.com/hagopj13/node-express-boilerplate) (241 commits) | JavaScript CommonJS; `express.Router()`, `router.route().post().get()`, `forEach` route table, env-conditional mounts, controllers + `catchAsync`, `validate(Joi schema)` + `auth('right')` middleware factories, passport, error converter/handler | MIT (LICENSE file) | 2019-10 … 2021-06, scan at `179ae84` |
| `realworld` | [gothinkster/node-express-realworld-example-app](https://github.com/gothinkster/node-express-realworld-example-app) (65 commits) | 2016–2018: JavaScript CommonJS, nested routers mounted with `require()`, `router.param`, `express-jwt` `auth.required/optional`, inline handlers. 2023+: **TypeScript**, `Router().use(a).use(b)`, `export default Router().use('/api', api)`, async inline handlers, Prisma services | `package.json` says MIT (ISC in 2018); no LICENSE file | JS `a74fd52`…`16b0ff3`, scan at `ba04b70`; TS `5eeccf1`, `30b68e1` |

Both targets were cloned into `../targets` (outside this repository) and are read only through Git objects at pinned commits. Nothing was installed, imported or executed. **No code from either target is copied into this repository.** The new test fixtures are original, minimal code written to reproduce the same *patterns*.

## Method

```sh
git clone https://github.com/hagopj13/node-express-boilerplate ../targets/boilerplate
git clone https://github.com/gothinkster/node-express-realworld-example-app ../targets/realworld
node scripts/real-service-trial.mjs ../targets --mutations          # human-readable
node scripts/real-service-trial.mjs ../targets --mutations --json   # raw results
```

For each pair, `specgate diff --base <c>~1 --head <c>` was run. The "expected" column is the ground truth from reading the upstream diff, not from SpecGate. `non_breaking+review` means additive for consumers, though shared modules also changed, so review of some routes is defensible. Route ground truth was counted by hand from the route files. Mutations are applied to a throwaway local clone, one commit each. Everything is deterministic, with no network and no model.

## Results: route inventory (`specgate scan`)

| Scan | Ground truth | Before (`main`) | After |
|---|---|---|---|
| S1 boilerplate @ `179ae84` (CJS) | 14 routes | **0** routes, 289 gaps (every `require`/`const` was a gap) | **14/14**, full `/v1/...` paths, 1 marked `conditional` (`/v1/docs`, development only) |
| S2 realworld @ `ba04b70` (CJS) | 19 routes | **0** routes, 84 gaps | **19/19**, nested `/api/...` prefixes, `router.param` applied |
| S3 realworld @ `30b68e1` (TypeScript) | 20 routes | **0** routes, every file `unsupported-language` | **20/20** (incl. `GET /` in `main.ts`) |

After the fix, every route has `auth: unknown` and the scans remain `complete: false`. That is correct: all handlers are async or use unmodeled helpers, so their contracts are opaque (these become `contract` gaps). Inventory-level gaps that remain on real code: `conditional-registration` (env-dependent `app.use`), `unsupported-route-method` (`app.options('*', cors())`).

## Results: commit pairs (`specgate diff`)

Counts are `breaking / needs_review / non_breaking` findings.

| # | Commit | What changed upstream | Expected | Before (`main`) | After | Notes |
|---|---|---|---|---|---|---|
| B1 | `c7879be` | `POST /v1/auth/refreshTokens` → `/refresh-tokens` | breaking | needs_review 0/61/0 (gaps only) | **breaking** 1/0/1 | `route-removed` + `route-added` ✅ |
| B2 | `750feb5` | `POST /v1/auth/logout` added (controller, service, validation modules grew) | non_breaking(+review) | needs_review 0/75/0 | **exit 0** 0/0/1 | existing routes use unchanged members of the grown modules ✅ |
| B3 | `9dae3f2` | 2 email-verification routes added; roles, token types and config changed | non_breaking+review | needs_review 0/77/0 | needs_review 0/15/2 | 12 routes `dependency-changed` + `trailing-middleware-changed` via config/roles (the passport strategy and error handler depend on them) ✅ conservative |
| B4 | `40b6294` | `POST /v1/auth/verification-email` → `/send-verification-email`; email/token services changed | breaking | needs_review 0/77/0 | **breaking** 1/2/1 | plus 2 routes whose services changed ✅ |
| B5 | `68d1e33` | `/v1/docs` mount made conditional on `config.env` | needs_review | needs_review 0/77/0 | needs_review 0/2/0 | `route-became-conditional` + new `conditional-registration` gap ✅ |
| B6 | `f7a7aab` | `DELETE /v1/users/:userId` added | non_breaking(+review) | needs_review 0/59/0 | **exit 0** 0/0/1 | `method-added` ✅ |
| B7 | `3b43f7f` | `POST /v1/auth/reset-password` added | non_breaking(+review) | needs_review 0/63/0 | **exit 0** 0/0/1 | ✅ |
| B8 | `cd683e9` | Joi query key `sort` → `sortBy` on `GET /v1/users` | needs_review | needs_review 0/61/0 | needs_review 0/1/0 | exactly `GET /v1/users` ✅ (a real consumer break, but Joi is not modeled, so it is review, not breaking) |
| B9 | `19cda9c` | roles config refactor | needs_review | needs_review 0/77/0 | needs_review 0/17/0 | all routes: roles feed the user model, used by the global passport strategy ✅ conservative |
| R1 | `a74fd52` | `GET /api/articles` + `GET /api/articles/feed` added | non_breaking | needs_review 0/20/0 | needs_review 0/1/2 | `added-route-overlaps-parameterized-route`: `/feed` now shadows `GET /api/articles/:article` for slug `feed` ⚠️ stricter than expected, correct reason |
| R2 | `a7bc455` | PUT/DELETE `/api/articles/:article` handler logic changed | needs_review | needs_review 0/20/0 | needs_review 0/2/0 | exactly those 2 routes ✅ |
| R3 | `e07c9bb` | edit to `routes/auth.js` that is a **syntax error** at head | needs_review | needs_review 0/21/0 | needs_review 0/17/0 | `parse-error` gap + the 16 routes that use `auth` ✅ |
| R4 | `2d9df7c` | syntax fix in `routes/auth.js` | needs_review | needs_review 0/21/0 | needs_review 0/17/0 | same 16 routes; `/api/tags`, login, register untouched ✅ |
| R5 | `16b0ff3` | query coercion in list handlers | needs_review | needs_review 0/20/0 | needs_review 0/2/0 | `GET /api/articles`, `GET /api/articles/feed` ✅ |
| R6 | `5eeccf1` | TypeScript: every handler switched user key; auth module moved; error handler edited | needs_review | needs_review 0/36/0 | needs_review 0/20/0 | all 20 routes (17 code, 20 deps, 19 trailing) ✅ |
| R7 | `30b68e1` | TypeScript: one-line fix in `getCurrentUser` service | needs_review | needs_review 0/33/0 | needs_review 0/1/0 | exactly `GET /api/user` ✅ |

**Summary:** before, all 16 pairs returned the same `needs_review` buried in 20–77 gap findings, and neither real breaking rename was identified. After, 15 of 16 match the expected verdict and 1 (R1) is stricter for a correct, explained reason. No pair passes something that changed behavior. Persistent gaps (for example `src/app.js` `conditional-registration` in B1) are listed under `coverage.persistentGaps` and do not block.

## Results: seeded mutations (no-silent-pass check)

| # | Mutation on real code | Expected | Result |
|---|---|---|---|
| M1 | `app.use('/v1', …)` → `/v2` | breaking | breaking (`route-removed`×14) |
| M2 | `.patch(` → `.put(` on `/v1/users/:userId` | breaking | breaking (`method-removed`) |
| M3 | delete `POST /v1/auth/logout` | breaking | breaking |
| M4 | `/:userId` → `/:userId/:version` | breaking | breaking (`path-param-added`) |
| M5 | Joi body rule tightened in `user.validation.js` | needs_review | needs_review (only routes using that schema) |
| M6 | controller success status `CREATED` → `OK` | needs_review | needs_review |
| M7 | service used by a controller changed | needs_review | needs_review |
| M8 | authorization rule changed inside `auth()` factory | needs_review | needs_review |
| M9 | error handler (registered after routes) changed | needs_review | needs_review (`trailing-middleware-changed`) |
| M10 | registration moved into a helper `later(router)` | needs_review | needs_review (`analysis-gap` + unprovable `route-removed`) |
| M11 | `auth('getUsers')` removed from a route | needs_review | needs_review (`route-chain-changed`) |
| M12 | comment/whitespace only | pass | pass |
| M13 | unused helper added to a used service module | pass | pass |
| T1 | TS: `'/api'` → `'/api/v2'` | breaking | breaking |
| T2 | TS: `/articles/feed` → `/articles/my-feed` | needs_review* | needs_review (`route-now-matched-by-parameterized-route`: the old URL now reaches `/articles/:slug`) |
| T3 | TS: `auth.optional` → `auth.required` on `/tags` | needs_review | needs_review |
| T4 | TS: service default page size changed | needs_review | needs_review |
| T5 | TS: comment only | pass | pass |

18/18 as expected. *T2 was first written as "breaking". The existing ruleset deliberately treats a removed literal route still captured by a parameterized route as `needs_review`, so the expectation was corrected, not the tool.

## What the trial exposed, and the fixes (in priority order)

1. **CommonJS was invisible** (0 routes; every `require`/`var` was a gap). Added a project-level parser for ESM and CommonJS: `require`, destructured requires, `require('x').y`, `module.exports =`, `exports.x =`, barrels, `export … from`.
2. **`express.Router()` mounting with prefixes.** Added an app/router graph: `use([path], …)`, nested routers across files, `Router().use(a).use(b)` chains, `export default Router().use('/api', api)`, `x.route(path).get().post()`, `router.param`, `forEach` route tables over literal arrays, top-level `if` mounts (discovered + `conditional`). Unmounted routers, routers passed to helpers, unresolvable `use` arguments, and route-looking calls on unknown receivers are gaps.
3. **Handlers imported from other files / controller patterns.** Handler and middleware references resolve through imports, object exports and barrels to the actual function or factory call (`catchAsync(async …)`, `validate(schema)`, `auth('right')`, `jwt({...})`).
4. **TypeScript.** Types are stripped with Node's built-in `module.stripTypeScriptTypes` (positions preserved; `transform` fallback for enums/parameter properties). No new dependency. `.d.ts` is ignored; TSX/JSX remain unsupported.
5. **Middleware chains.** Express ordering (a `use` layer applies only to later routes; path-scoped `use`); body parsers are recognized as benign; later error/fall-through middleware is fingerprinted separately (`trailing-middleware-changed`); middleware added or removed on opaque routes is `route-chain-changed`.
6. **Opaque routes were all-or-nothing.** Each route now carries order-independent fingerprints of its chain code and its **dependency slice** (referenced top-level symbols, the specific members used from imported modules, module-load side effects). The fingerprint is computed as a closure over dependency nodes, so cycles and evaluation order cannot change it; that was a real bug found during the trial. Unchanged opaque routes are no longer flagged. Changed ones get `route-contract-not-analyzable` with reasons.
7. **Gaps blocked every PR forever.** An unsupported construct whose code *and* dependency slice are byte-identical in both revisions is a *persistent gap*: listed in coverage, not a finding. New, removed or changed gaps are still `needs_review`. Removals are `breaking` only if the head has no new or changed gaps.
8. **New literal route shadowing an existing `/:param` route** (R1) → `added-route-overlaps-parameterized-route` (needs_review).

Tests: 17 new diff fixtures (`router-prefix-route-renamed`, `router-mount-prefix-changed`, `imported-controller-changed`, `controller-addition-only`, `service-dependency-changed`, `validation-rule-changed`, `middleware-removed-from-route`, `error-handler-changed`, `registration-hidden-in-helper`, `added-route-shadows-parameterized-route`, `route-became-conditional`, `persistent-gap-unchanged`, `persistent-gap-dependency-changed`, `typescript-route-renamed`, `typescript-service-changed`, `typescript-types-only`, `typescript-auth-guard-changed`) and 11 scan-level tests in `packages/specgate/test/project.test.mjs`.

### Existing expectations that changed (and why)

| Test / fixture | Old expectation | New | Reason |
|---|---|---|---|
| `route-moved-to-router` | needs_review (Router unsupported) | exit 0, no findings | Router mounting is now supported. Same route, same chain. |
| `unsupported-patterns` | analysis-gap only | analysis-gap + `route-added` (non_breaking) | The async inline route is now discovered. The template path and unresolved middleware are still gaps. |
| `dependency-changed` | analysis-gap + handler-dependency-changed | handler-dependency-changed | The helper `lookupTicket(id)` is not a route handler, so it is no longer reported as a gap. The route is still flagged. |
| `scan.test` "unsupported TypeScript" / `cli.test` "partial scan" | `.ts` file ⇒ unsupported | uses `.tsx` | `.ts` is now supported. TSX remains unsupported. |
| `pilot.test` "missing observations" | async handler hides the route | async route is observed and INCOMPLETE; a second mutation hides the registration in a function and checks `route-not-observed` | Preserves the original intent with a construct that is still hidden. |

`docs/provenance/import-manifest.json` records the new hashes for the adapted imported files, marked as pending owner review.

## Remaining limits and what's missing

- **No contracts on real handlers.** The contract grammar still covers only synchronous `res.status(<literal>).json(...)` handlers. Real code uses `async`, `res.send`, status constants (`httpStatus.CREATED`), `next(err)` and `throw new ApiError(...)`. Next: model those, plus **Joi / celebrate / express-validator / zod** schemas used through `validate()`-style middleware, so B8-style changes (`sort` → `sortBy`) become provably `breaking` rather than review.
- **Auth is never observed on real services.** `express-jwt`, passport and custom `auth()` factories are opaque (`auth: unknown`). Adding or removing them is reported (`route-chain-changed`), but not classified.
- **Coarse dependency slices in apps with global side effects.** A global `passport.use(strategy)` or config validation makes every route depend on config/models. That is correct but noisy (B3, B9: every route flagged). Declaration initializers are treated as pure, and only top-level statements count as module side effects.
- **Not modeled (always gaps):** registration inside functions (`module.exports = (app) => {…}`), class/decorator controllers (NestJS, routing-controllers), `app.all/options/head`, regex/wildcard/array paths, dynamic route tables, sub-apps with `mergeParams` semantics, other frameworks (Fastify, Koa, Hapi), TSX/JSX, and TypeScript path aliases (`@/…` is treated like an external package, so code behind it is not fingerprinted).
- **Scope is explicit.** Imports outside `--source` scopes and `node_modules` are not followed. Dependency version bumps (`package.json`) are invisible.
- **Performance of Git acquisition.** Parsing and analysis of a synthetic 900-file / 1,500-route service takes ~0.7 s. Acquisition spawns one `git cat-file` per blob (~12 s for 900 files, against a 30 s budget), so repositories near the 2,000-file limit will hit the acquisition timeout. A batched `cat-file --batch` reader with the same integrity checks is needed.
- **Real-world validation breadth.** Two services (one by a single author, one a tutorial app) and 16 commit pairs are evidence, not qualification. Still required: a pilot on a larger production service with its team, a false-positive rate over a few hundred PRs, Windows, and an approved correctness baseline.
- **Housekeeping:** CLI `--version` and the `toolVersion` field still say `0.1.0-rc.1` (pre-existing; `toolVersion` is part of the baseline schema check, so it was not changed here).
