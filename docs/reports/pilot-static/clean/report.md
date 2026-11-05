# SpecGate developer pilot — observe only

UNCHANGED\_DECLARED\_SUBSET

Static source observations only, not API compatibility or behavioral validation. Reviewed assertions are never rewritten. A reference is not proof of approval; protect trusted inputs operationally.

## Coverage
Observed routes: 2; associated with reviewed scenarios: 2; without reviewed scenarios: 0; executed scenarios: 0.
- Only explicit committed Git source scopes and the documented Express grammar are analyzed; untracked/working-tree changes and excluded files are not assessed.
- Imports outside supplied scopes, database/outbound dependencies, general control flow, authorization correctness, response schemas and full consumer compatibility are unassessed.
- Scenario-to-route association is not executed behavioral coverage, approved review identity, freshness, or proof that every route/state is represented.
- File hashes detect drift, including comments; registration locations are not exact changed statement locations or proof of a behavioral defect.

## Supported route observations
- POST /tickets — src/app.mjs:1; reviewed scenarios: tickets.create
- GET /health — src/app.mjs:1; reviewed scenarios: health.read

## Unsupported constructs

## Reviewed scenarios (not executed)
- tickets.create — approved\_requirement; SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED
- health.read — approved\_requirement; SYNTHETIC requirements: POST tickets remains 201; health remains 200; NOT EXECUTED

## Detected changes
No static changes in the declared subset; no API compatibility or behavioral pass is claimed.
