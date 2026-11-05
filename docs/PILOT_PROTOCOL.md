# Real-service qualification protocol — not yet performed

## Current authorization and access gate

No explicitly selected, representative real-service target with an approved behavior baseline/runtime authorization was identified in the project knowledge or current repository. The owned qe-dogfood and Ticket Desk fixtures are synthetic and cannot fill this gate. Mere access to another repository is not authorization to start its service, call dependencies or mutate data. No customer repository/source was copied or executed for this increment.

To complete qualification, the owner must provide:

1. An explicitly authorized representative service/repository, exact accepted base and candidate head commits, source scopes, framework/runtime and named reviewing maintainer. Read-only committed-source access is enough for initial static qualification.
2. Independently reviewed requirements/scenarios and accepted scan baseline from a protected/trusted base revision, with review decision/reference. Define endpoint states, auth/validation boundaries, fixture setup/cleanup and unsupported/out-of-scope behavior. Expectations must not be inferred or repaired from the changed implementation.
3. **Separate permission for behavioral execution** against an isolated test-only target, allowed operations/data/dependencies, loopback binding, no production proxy, test-only credential references, cleanup/rollback and retention policy. No production/customer credentials in source, scanner or PR jobs.
4. An owner-approved private package/digest and, if automated cross-repository retrieval is needed, narrowly scoped read-only artifact access. The operator's broad login is not the CI reader.

Choose a small meaningful ESM/Express REST service with literal routes, at least one authenticated operation, validation boundaries and a maintainer able to distinguish intended behavior from incidental implementation. If representative code uses unsupported routers/TypeScript/async registration, record that gap or decline fit; do not rewrite the service merely to pass this scanner.

## Phase A: baseline and held-out plan

Record service/ref/scopes, package/digest, reviewer, environment and authorization in the scorecard. Inventory independently known endpoints beside observed supported registrations; unknown/dynamic endpoints stay unknown, not denominator zero. Review expected statuses and body/auth/data invariants without consulting seeded variants. Freeze scenario IDs/expectations and baseline hashes. Predeclare a clean change, benign/comment-only change, relevant seeded status/route/validation defect and unsupported construct; avoid cherry-picking after seeing detections. A seed in a real service remains a **controlled real-service seed**, not a naturally occurring customer defect.

## Phase B: observe-only static trial

Time from first install attempt to a valid retained report, including failed setup/retries. Run the actual installed candidate at accepted/head refs without starting/importing source. Record findings individually: endpoint candidate, source registration/file, expectation/reference, confidence, recommended action and true/false/unresolved maintainer disposition. File-level drift is not a confirmed defect; benign review overhead belongs in the scorecard. Keep setup failures, missing coverage, unsupported constructs and parser failures separate from useful detections. Do not call collector success an API pass.

## Phase C: authorized behavioral validation

Only after separate isolated-target approval: run the existing generated reviewed tests with controlled fixture lifecycle, no retries to hide errors, no live external side effects and traces disabled. Retain independent assertions; compare clean and seeded runs, cleanup and repeatability. Preserve source/scenario/package/environment identities for each run. Classify confirmed regression, approved requirement change, fixture/environment issue, flakiness or unresolved; do not automatically alter expectations. Service-level tests are not composed E2E or full integration qualification.

## Scorecard and measurements

Use `pilot-scorecard.template.json`; null means unmeasured, never zero. One row per change/finding/decision, with evidence and reviewer:

- **Useful detections:** maintainer-confirmed actionable findings, with independently expected/held-out defects as denominator where known. Separate natural defects, controlled seeds, static review candidates and runtime confirmations. Never claim recall when the true defect set is unknown.
- **False positives:** maintainer-dismissed incorrect impact/diagnosis among triaged findings. Record expected benign drift/review overhead separately; show useful, dismissed and unresolved counts. Zero reviewed findings means precision unmeasured, not 100%.
- **Coverage gaps:** known endpoint/state inventory versus supported observed registrations, mapped reviewed scenarios and actually executed checks. Record unknown denominators and missing dependency/framework scopes explicitly; route association is not behavioral coverage.
- **Setup time:** elapsed time and active maintainer minutes to first valid report, install/input/permission failures included.
- **Maintenance effort:** active minutes and files/scenarios touched to investigate/change requirements or maintain tests; unchanged IDs/assertions, unintended rewrites and cleanup cost. Do not monetize hypothetical savings as measurements.

The maintainer sets acceptance thresholds **before** results. Stop for unsafe acquisition/execution, leaked values, false green on unsupported scope, assertion mutation or unusable noise. Keep observe-only until triaged results and independently approved coverage/behavior evidence justify a separate owner rollout decision.

## Explicit launch gates

Real-service selection/approval and reviewed baseline; actual isolated behavior/cleanup evidence; measured useful/dismissed/unresolved findings and costs; authenticated private consumer distribution with least privilege; independent review and platform/security qualification; explicit owner-approved enforcement/release policy. Windows/multiple frameworks/full compatibility remain unsupported or unassessed. Public website, durable signup and deployment are separate adoption gates in ADOPTION.md, not delivered or enabled by this pilot increment.
