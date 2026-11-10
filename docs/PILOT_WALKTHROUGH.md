# Recorded developer walkthrough — synthetic static mechanics only

This is a guided reading of **actual installed-package output on committed synthetic source**, not live scanning in a web page, customer validation, a runtime test pass or full API compatibility. The private source candidate remains in review. See the archive receipt and raw sample reports under `reports/pilot-static/` once recorded from the final runtime commit; fresh CI artifacts are linked in the PR.

## 1. Install the thing that actually exists

Follow `PILOT_CI_QUICKSTART.md`: obtain the approved private `.tgz`, verify SHA-256 against trusted matching source/run evidence, install offline with an empty cache and lifecycle scripts disabled. The public package is the scoped `@qe-atlas/specgate@0.1.0-rc.1`; unscoped `specgate` is not this package. No hosted source-upload promise. Do not execute service code. The installed `specgate-pilot.mjs` reuses the original scanner and scenario validator.

## 2. Start with the independent synthetic expectations

The proof declares POST `/tickets` must return HTTP 201 with exact `{ok:true}`, and GET `/health` HTTP 200 with exact `{ok:true}`. These are independently declared **synthetic fixture expectations**, not claimed customer approvals. Freeze their bytes and accepted scan before changing source. A real pilot substitutes a separately authorized service and actual independently reviewed requirements; a reference string alone is not approval.

## 3. Clean snapshot

The actual clean run reports `UNCHANGED_DECLARED_SUBSET`, native exit 0, two observed supported registrations and two associated scenario definitions, **zero executed scenarios**. Read the separate unassessed scope: response semantics, general flow, dependencies, unknown routes/states and full compatibility are not established. Collector exit 0 means acquisition succeeded.

## 4. Seed a status defect without changing the oracle

Change the POST source literal 201 to 200. The actual report is `REVIEW_REQUIRED`, native exit 1. Its `route-observation-changed` finding identifies POST `/tickets`, source registration/base/head, observed `[201]` versus `[200]`, reviewed `tickets.create`/HTTP 201, exact-body assertion kind and the synthetic requirement reference. It recommends reviewing and running that unchanged assertion under isolated authorization, not changing the expectation to 200.

The original generator produces **byte-identical tests** before/after this seed. No generated tests or service runtime were executed in this increment: this proves change context and assertion preservation, **not a runtime-confirmed defect**. Confirm the prediction only in the separately authorized behavioral phase.

## 5. Admit benign drift and missing review

A trailing comment still yields source-hash review, not a confirmed regression; every finding is an unverified change. This conservative noise is a pilot cost, not a marketed useful detection. A new `/audit` route without independent requirements is explicitly unassessed. A genuinely absent supported route in a complete supplied subset is a bounded registry change, not full consumer-compatibility diagnosis.

## 6. Unsupported means unknown

Switch the POST handler to async, hide its registration inside a helper function, or add dynamic registration (`app[verb](...)`). The actual report is `INCOMPLETE`, native exit 1, with unsupported construct/file/line and unassessed scope. An async inline handler is still discovered (the route stays observed), but its contract is outside the model, so it is an `analysis-gap`/unknown. A previous route omitted by partial discovery, such as a registration inside an unevaluated function, is `route-not-observed`/unknown, not a confirmed removal or success. Reviewed definitions are retained as not executed. Malformed review input instead makes the collector exit 2, not successful observation.

## 7. Decide whether a real pilot can start

Review `PILOT_PROTOCOL.md` and the null/unmeasured scorecard. Need a named authorized representative service, pinned commits/source scopes, an independently reviewed baseline/scenarios, isolated execution permission/data cleanup and appropriate private-artifact reader. Until then there are no customer usefulness/precision/recall/remediation-time results and no authorization for production enforcement.

All source fixtures and labels in the proof are synthetic. Original imported expectations/baselines and scanner code remain unchanged. The removal-only OpenAPI adapter is a separate mode/PR and is not evidence of code-first behavioral compatibility.
