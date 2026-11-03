# Shared QE Atlas result

SpecGate emits schemaVersion 1 alongside its native reports as `qe-result-specgate.json`. Native outputs and exit semantics are unchanged. The CLI accepts --qe-result PATH to override the default.

Contract: https://github.com/DaveEliranAssistant/qe-atlas-report/pull/1 . The reporter discovers producers dynamically. Findings are capped at 100; totals and complete native reports are retained. Run provenance comes from GITHUB_REPOSITORY/GITHUB_RUN_ID; outside Actions the fallback URL ends in /actions/runs/0 and is not evidence of a real run.

SpecGate PASS means removal rules only; manual review is required and other compatibility is unassessed.

Operational failures may leave no shared file when input/path validation fails before output acquisition. Configure expected-files in the reporter so this is an explicit ERROR, never a silent omission.

Tests: `node --test tools/openapi-removals/*.test.mjs`. No baseline or assertion changes.
