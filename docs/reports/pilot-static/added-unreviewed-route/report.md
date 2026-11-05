# SpecGate developer pilot — observe only

REVIEW\_REQUIRED

Static source observations only, not API compatibility or behavioral validation. Reviewed assertions are never rewritten. A reference is not proof of approval; protect trusted inputs operationally.

## Coverage
Observed routes: 3; associated with reviewed scenarios: 2; without reviewed scenarios: 1; executed scenarios: 0.
- Only explicit committed Git source scopes and the documented Express grammar are analyzed; untracked/working-tree changes and excluded files are not assessed.
- Imports outside supplied scopes, database/outbound dependencies, general control flow, authorization correctness, response schemas and full consumer compatibility are unassessed.
- Scenario-to-route association is not executed behavioral coverage, approved review identity, freshness, or proof that every route/state is represented.
- File hashes detect drift, including comments; registration locations are not exact changed statement locations or proof of a behavioral defect.

## Supported route observations
- POST /tickets — src/app.mjs:1; reviewed scenarios: tickets.create
- GET /audit — src/app.mjs:1; reviewed scenarios: none (unassessed)
- GET /health — src/app.mjs:1; reviewed scenarios: health.read

## Unsupported constructs

## Reviewed scenarios (not executed)
- tickets.create — approved\_requirement; SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED
- health.read — approved\_requirement; SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED

## Detected changes
### route-added — unverified-change
Source base: unknown:unknown; head: src/app.mjs:1. route-registration-or-gap.
- Endpoint candidate: GET /audit — src/app.mjs:1
Expectation status: unassessed.
Obtain independent reviewed expectations for the added endpoint; do not infer assertions from its implementation.

### source-changed — unverified-change
Source base: src/app.mjs:unknown; head: src/app.mjs:unknown. route-registration-in-changed-file.
- Endpoint candidate: POST /tickets — src/app.mjs:1
- Endpoint candidate: GET /health — src/app.mjs:1
- Endpoint candidate: GET /audit — src/app.mjs:1
- Reviewed expectation: tickets.create; POST /tickets; HTTP 201; body assertion exact; reference SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED.
- Reviewed expectation: health.read; GET /health; HTTP 200; body assertion exact; reference SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED.
Expectation status: references-not-executed.
Review the source change and run relevant unchanged independently reviewed scenarios; fix a confirmed defect or approve a requirement change separately.

