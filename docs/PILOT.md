# Developer pilot: static evidence first, qualification still gated

**Pilot-use prerelease, published on npm as `@qe-atlas/specgate@0.1.0-rc.1` (dist-tags `latest` and `next`, MIT).** Reuses the existing SpecGate 0.1.0-rc.1 committed-Git scanner, comparator and reviewed-scenario compiler; no new scanner or OpenAPI dependency. This PR stacks on onboarding PR #4. The old imported package/POC bytes and independent assertions remain unchanged and hash-checked. No GitHub release, public website, hosted signup, beta entitlement or production enforcement is implied.

## What is available

- The private archive built by `npm pack --ignore-scripts` includes the existing `bin/specgate.mjs` and new explicit Node entrypoints `bin/specgate-pilot.mjs` and `bin/specgate-observe.mjs`. New commands are not npm bin aliases and are absent from older archives with the same RC version (the npm tarball includes them); identify the exact source commit **and SHA-256**, not version alone.
- `specgate-pilot.mjs` reports supported route observations, unsupported constructs, associated reviewed behavioral scenarios and unassessed scope, using the existing scanner. Each change includes endpoint candidates, base/head registration locations where known, relevant reviewed scenario/reference/status assertion, observation deltas and recommended action. File hash drift is file-level candidate impact, not a changed-statement diagnosis. Comments can trigger review.
- JSON schema `specgate.pilot/1`: `UNCHANGED_DECLARED_SUBSET`, `REVIEW_REQUIRED`, `INCOMPLETE`. Native exits 0/1/2 retain unchanged/review/input-tool semantics. No global PASS or API compatibility verdict. Associated scenarios are **NOT_EXECUTED**; a reference string is not verified approval.
- If current analysis is partial, an old route missing from discovery is **not observed / unknown**, not a confirmed removal. Complete still means only the supplied supported grammar, not a full API census. New endpoints without independent expectations remain unassessed.
- Assertions are validated using the existing compiler against an internal union of base/head supported route registrations. This is a structural binding projection only, never an emitted scan, accepted baseline or claim of completeness. It allows reviewing both removed paths and independently approved newly added paths without rewriting the trusted baseline.

## Boundaries

Read [the original package guide](../packages/specgate/README.md), [original security model](../packages/specgate/SECURITY.md) and [additional pilot boundary](PILOT_SECURITY.md). Supported: bounded committed JavaScript ESM/Express literal routes, Node 22/24, Linux/macOS. TypeScript, routers/mounts, async/imported/dynamic handlers and other unsupported constructs remain gaps. Source outside explicit scopes, general flow, storage/outbound behavior, response schemas and full consumer compatibility remain unassessed. Windows is not qualified. Working-tree edits are not scanned.

This **code-first** command is distinct from the removal-only OpenAPI adapter in PR #1 and its shared-report PR #3. Neither is merged into this increment. No removed OpenAPI operations does not mean API compatibility; no static source drift does not mean correct behavior.

## Adoption path

1. Review the [recorded walkthrough](PILOT_WALKTHROUGH.md), supported subset and limits.
2. Install the published npm package, or obtain an owner-approved private archive and digest; reproduce the [actual archive and observe-only recipe](PILOT_CI_QUICKSTART.md).
3. Select a representative, explicitly authorized service and independently review baseline/scenarios. Repository access alone is not permission to start its runtime or call dependencies.
4. Run static observe-only collection on clean changes and separately controlled seeded/held-out cases. Triage findings without editing assertions to accommodate source changes.
5. Follow the [real-service protocol](PILOT_PROTOCOL.md) and populate the [unmeasured scorecard template](pilot-scorecard.template.json). Behavioral execution needs separate isolated-target authorization and evidence.
6. Owner review decides any broader rollout. Synthetic mechanics cannot authorize production enforcement.

Automatic PR CI runs static scanner/security/oracle tests and real offline archive-install/collection proofs only. The complete existing runtime suites remain intact behind explicit `workflow_dispatch` input `run_synthetic_runtime: true`; they were not executed or requalified by this static increment. This split prevents accidental execution of scanned fixture code; it is not a claim that omitted runtime gates passed. No assertions were removed or relaxed. A successful observe collector means evidence acquisition succeeded, not that the API passed.
