# Mode B: base-vs-head consumer-break check — limits and next step

> **Update 2026-11-10 (unreleased branch):** limits 1 and 7 and next step 1 below are addressed by the project-level engine (routers and mount prefixes, CommonJS, TypeScript, imported handlers, middleware chains) and the persistent-gap policy. See [real-service-trial.md](real-service-trial.md) for the trial on two public Express services and what remains.

Status: preview, unreleased. Implemented in `packages/specgate/src/diff.mjs` (`specgate diff`). Approved by the owner on 2026-11-09.

## What it does

It scans the base and head revisions from Git with the existing bounded, non-executing scanner (`git-source.mjs` → parser worker), extracts a per-route contract and classifies the differences:

- **Route identity:** method + literal path. Unmatched routes are paired when their path shape is the same with renamed parameters (`path-param-renamed`, `needs_review`), or when head adds parameter segments (`path-param-added`, `breaking`). The rest are classified as removed or added. A removed literal route whose URL a head `:param` route now captures is `needs_review`.
- **Request contract:** recognized checks on `req.body.*`, `req.params.*` and `req.headers.*` (typeof, length bounds, string enums, falsy, bearer comparison), whether each check is optional, and the literal rejection status.
- **Response contract:** literal success statuses, plus field names and types when the body is an object literal or a same-handler `const` object literal. Types come from literals or from locals proven by a required typeof/enum check.
- **Change evidence:** a normalized AST hash of the handler and middleware chain, the AST hashes of relative imports reachable from the handler's imported calls (within scanned scopes), and hashes of referenced top-level constants.

Design rule: **only provable changes are `breaking`; everything else that changed, plus every analysis gap, is `needs_review`.** The tool never claims a change is safe. Exit 0 only means nothing was found within the supported scope.

The existing `scan` and `check` output is unchanged. Contract facts are an opt-in side channel of the same worker, and a test asserts that the sealed scan is byte-identical with and without them.

## Known limits

1. **Same narrow subset as `scan`.** JavaScript ESM, top-level `const app = express()`, literal paths and same-file named or block-bodied sync inline handlers only. Routers, mount prefixes, TypeScript, CommonJS, async handlers, imported handlers, decorators and dynamic registration all become analysis gaps (exit 1). For most real services today this means exit 1 with a list of gaps. That is honest, but not yet useful as a gate.
2. **Straight-line handlers only.** `else` branches, loops, try/catch and early returns other than the recognized `if (...) { res.status(N).json({...}); return; }` are gaps. Multiple success paths are not modeled.
3. **Response types are rarely fully visible.** Values from imported calls, databases, `req.params` or member expressions are `unknown`. Such routes are flagged `unmodeled-behavior-changed` whenever their handler code changes, so expect review noise on real services.
4. **Local renames are not alpha-normalized.** Renaming a local variable in an unmodeled handler changes its AST hash and triggers review. Comments, formatting, declaration order and the handler's own name are normalized away.
5. **Registration order is ignored.** Express matches the first registered route. Reordering overlapping routes (`/users/me` vs `/users/:id`) can change behavior, and this is not detected.
6. **External packages and unscanned files are invisible.** A dependency bump in `package.json`, or a change outside `--source` scopes, produces no finding. Transitive dependency tracking covers only relative imports that resolve inside the scanned scopes. Those files are usually gaps themselves, because non-handler functions are outside the subset.
7. **Middleware is opaque unless it is a same-file named function.** `app.use(...)` other than `express.json()` is a gap. Global auth, CORS, rate limits and body-size limits are not modeled.
8. **Headers other than bearer `authorization`, query strings, content types and response headers are not modeled.** Status codes set via `res.sendStatus`, `res.send` or `res.end` are gaps.
9. **Semantics are not modeled.** Same shape and different meaning (a renamed enum's meaning, changed units, different ordering, changed pagination) is invisible unless a literal value hash changes.
10. **`path-param-renamed` is `needs_review`, not `breaking`** (owner decision, 2026-11-10). A renamed parameter with the same route shape (`/users/:id` → `/users/:userId`) is invisible on the wire, but generated SDKs and OpenAPI consumers that address parameters by name may need updating, so a human decides. Adding a parameter segment or changing the route shape stays `breaking`.
11. **No allowlist or "intended break" mechanism.** Deliberate, versioned breaks still exit 1. The optional `poc/agentic-triage` intent file is not wired into `diff`, by design, to keep the verdict deterministic and model-free.
12. **Git preconditions.** Refs must exist locally, and the default merge-base mode needs history (`fetch-depth: 0`). Ranges, `:` paths and reflog syntax are refused.

## What the next step should be

In order of expected value:

1. **Express Router + mount prefixes** (`const r = express.Router(); r.get(...); app.use('/v1', r)`), including same-file and relative-import routers. This is the single largest source of gaps in real Express services. Without it, most real services cannot get an exit 0.
2. **A real-service qualification run.** Run `diff` over the last ~50 merged PRs of one representative service. Measure the gap rate, `needs_review` rate and any `breaking` false positives, and use that data to set priorities instead of guessing.
3. **Branch-aware handler modeling** (if/else and early-return trees). That makes multiple statuses per route and conditional response shapes visible, which reduces `unmodeled-behavior-changed` noise.
4. **Async handlers** with `await` on imported calls, treating results as `unknown` but keeping the request/response skeleton modeled.
5. **Optional schema hints** (zod/joi/express-validator, JSDoc `@typedef`) to type response fields statically. These should stay additive: a hint can turn `unknown` into a type but never downgrade a finding.
6. **A reviewed "intended breaks" file** from the trusted base branch, analogous to the triage intent file. It would let a reviewer acknowledge a specific finding fingerprint without weakening the rules.
