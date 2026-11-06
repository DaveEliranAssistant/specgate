# Adoption and launch acceptance gates

## Dedicated product home

The product repository is `DaveEliranAssistant/specgate`, private by default. Product code, website, API, documentation, CI examples and product-specific operational runbooks should be maintained here. Do not continue implementing SpecGate in QE Atlas or create another scanner engine.

The product repository is distinct from a **pilot target**: an independently authorized real service used to qualify the scanner and reviewed expectations. No pilot target is needed to develop the product site, documentation or signup flow. Synthetic fixtures are valuable tests but must not be called a customer pilot.

## Implemented and imported

- Bounded JavaScript/Express committed-source scanner, CLI/check contracts and reviewed-scenario compiler.
- Synthetic generated API tests, seeded-defect detection and assertion-preserving maintenance proofs.
- Package published on npm as `@qe-atlas/specgate@0.1.0-rc.1` (dist-tags `latest` and `next`, MIT), bundled parser/license and empty-cache offline smoke test.
- Standalone Node 22/24 CI in this repository.

## Customer onboarding preview (review branch, not deployed)

The [guided pilot experience](../onboarding/README.md) provides a local fit check, actual recorded synthetic scan/check results, private archive quickstart, trust/troubleshooting notes and a downloadable pilot brief. The allowlisted static export includes no scanner runtime, third-party assets, analytics or source upload. Downloading the brief is not a signup or access grant.

The customer helper is exercised against a locally packed private candidate using a fresh offline npm cache, lifecycle scripts disabled and static source scans only. That proves the local archive recipe, not authenticated release download. CI distribution still requires the separately approved scoped read-only secret. Current scan/check is not consumer-compatibility proof; conform/diff are not implemented by this onboarding change. Existing source, assertions and baselines remain unchanged.

## Remaining work, in order

1. **Product website:** dedicated Vercel project linked to this repository, clear supported subset, installation path, limitations and launch status. Keep QE Atlas production untouched except a separately authorized link/update.
2. **Honest interactive walkthrough:** captured CLI results must be labeled recorded; live scanning must not upload or execute visitors' code implicitly. Demonstrate a route change, reviewed expectations and unsupported-coverage gaps.
3. **Adoption and CI quickstart:** run documented installation and CI commands against the actual package. Obtain tooling, baselines and scenarios from trusted revisions. Distinguish observe-only findings from tool failures. Describe the published npm package as a pilot-use prerelease, not production approval.
4. **Durable beta request flow:** bounded request handling, explicit consent/privacy, private storage, abuse controls and an actual read-back of a persisted test request. Signup receipt is not email verification, sent mail or access entitlement. No email campaign is authorized.
5. **Vercel setup:** use the already provisioned dedicated `specgate-beta` free-tier database, not A11yGate's database. It is still connected to QE Atlas. Do not detach it, copy runtime secrets, alter existing protection or provision paid resources merely as a side effect of repository creation. Connect it deliberately when configuring the dedicated app.
6. **Real-service qualification:** select an authorized representative service, approve expected behavior independently of source and run observe-only CI. Record coverage gaps, meaningful changes caught, false positives, environment/fixture safety and operational cost. This gate blocks production enforcement, not website development.

## Approval and verification boundaries

Earlier website/backend implementation stopped at a timed-out approval gate. This repository migration does not claim that blocked implementation or public deployment occurred. Preserve free-tier and existing protection boundaries. No database schema or credentials are included in this repository.

Do not claim launch readiness from a green scanner pipeline alone. Verify the website bytes, browser interactions, CI recipe and persisted signup independently when those components exist.


## Developer-pilot increment (review branch)

[Static developer-pilot evidence](PILOT.md) now prepares coverage/change explanations, actual archive-install observe-only collection, a recorded walkthrough and real-service protocol/scorecard. The new entrypoints ship in the published `@qe-atlas/specgate@0.1.0-rc.1` tarball but are not npm bin aliases. The imported scanner and assertions remain unchanged. Automatic checks are static; existing synthetic runtime proofs require explicit manual opt-in, and no real-service qualification is claimed. Gates 3 and 6 above remain partly blocked on authenticated consumer distribution and an explicitly authorized target with independent reviewed behavior/runtime permission. Public site/signup/deployment gates remain separate and unchanged.
