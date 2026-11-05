# SpecGate developer pilot — observe only

INCOMPLETE

Static source observations only, not API compatibility or behavioral validation. Reviewed assertions are never rewritten. A reference is not proof of approval; protect trusted inputs operationally.

## Coverage
Observed routes: 1; associated with reviewed scenarios: 1; without reviewed scenarios: 0; executed scenarios: 0.
- Only explicit committed Git source scopes and the documented Express grammar are analyzed; untracked/working-tree changes and excluded files are not assessed.
- Imports outside supplied scopes, database/outbound dependencies, general control flow, authorization correctness, response schemas and full consumer compatibility are unassessed.
- Scenario-to-route association is not executed behavioral coverage, approved review identity, freshness, or proof that every route/state is represented.
- File hashes detect drift, including comments; registration locations are not exact changed statement locations or proof of a behavioral defect.

## Supported route observations
- GET /health — src/app.mjs:1; reviewed scenarios: health.read

## Unsupported constructs
- inline-handler — src/app.mjs:1

## Reviewed scenarios (not executed)
- tickets.create — approved\_requirement; SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED
- health.read — approved\_requirement; SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED

## Detected changes
### route-not-observed — unknown
Source base: src/app.mjs:1; head: unknown:unknown. route-registration-or-gap.
- Endpoint candidate: POST /tickets — src/app.mjs:1
- Reviewed expectation: tickets.create; POST /tickets; HTTP 201; body assertion exact; reference SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED.
Expectation status: references-not-executed.
Investigate unsupported scope before claiming endpoint removal; run the unchanged independently reviewed expectations in an approved isolated environment.

### route-observation-changed — unverified-change
Source base: src/app.mjs:1; head: src/app.mjs:1. route-registration-or-gap.
- Endpoint candidate: GET /health — src/app.mjs:1
- Reviewed expectation: health.read; GET /health; HTTP 200; body assertion exact; reference SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED.
Expectation status: references-not-executed.
Review the source change and run relevant unchanged independently reviewed scenarios; fix a confirmed defect or approve a requirement change separately.

### source-changed — unverified-change
Source base: src/app.mjs:unknown; head: src/app.mjs:unknown. route-registration-in-changed-file.
- Endpoint candidate: POST /tickets — src/app.mjs:1
- Endpoint candidate: GET /health — src/app.mjs:1
- Reviewed expectation: tickets.create; POST /tickets; HTTP 201; body assertion exact; reference SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED.
- Reviewed expectation: health.read; GET /health; HTTP 200; body assertion exact; reference SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED.
Expectation status: references-not-executed.
Review the source change and run relevant unchanged independently reviewed scenarios; fix a confirmed defect or approve a requirement change separately.

### analysis-gap — unknown
Source base: src/app.mjs:1; head: src/app.mjs:1. route-registration-or-gap.
- Endpoint candidate: POST /tickets — src/app.mjs:1
- Endpoint candidate: GET /health — src/app.mjs:1
- Reviewed expectation: tickets.create; POST /tickets; HTTP 201; body assertion exact; reference SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED.
- Reviewed expectation: health.read; GET /health; HTTP 200; body assertion exact; reference SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED.
Expectation status: references-not-executed.
Review the unsupported construct manually; do not interpret missing observations as compatibility.

