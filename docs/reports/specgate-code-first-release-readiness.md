# SpecGate code-first release-readiness report

## Disposition

**Internal pilot release candidate, not production approved.** Source is the input, not OpenAPI. CLI package: `@qe-atlas/specgate@0.1.0-rc.1`. No production deploy, registry publication, scheduler, paid resource, credential/permission change or site-runtime modification was performed.

## Scope and implementation

A separate self-contained `packages/specgate` package reuses the existing POC's Acorn discovery instead of rebuilding an OpenAPI engine. It reads committed source through pinned Git tree/blob objects with integrity checks, bounded acquisition/parsing, literal-free report projection, deterministic fingerprints and stable route identifiers, strict CLI/exit contracts, trusted-baseline comparison, and independently reviewed scenario compilation. Mutable working-tree traversal was removed after review. Common synchronous inline Express block handlers were added; unknown syntax remains a non-green analysis gap.

Source changes, including behavior invisible to static discovery, are held for review through file hashes. This is conservative change detection, not a semantic compatibility proof or automatic impacted-test selector. Scenarios retain independently reviewed expectations. Runtime requests remain isolated loopback-only and redirects are refused.

## Actual local verification

- New package suite: **41 tests passed**, including subprocess CLI checks, Git commit/blob acquisition and immutable-source substitution tests, unsafe input/limit checks, inline handlers, source-literal projection, review-found false-green regressions, and generated Playwright tests running against a controlled HTTP target. A seeded wrong status failed unchanged expectations; off-host configuration and redirects were rejected.
- POC unit suite: **21 passed**, including source/expectation independence and reviewed maintenance.
- POC generated baseline: **21 passed** on a real loopback Express service.
- Seeded-defect proof: **7 failed / 14 passed**, exactly the predicted affected scenario IDs. Proof command succeeded because the intended regression was caught, not because the defective service was accepted.
- Maintenance proof: **1 failed / 20 passed**, matching predicted impacted ID; setup probe classified `ECONNREFUSED` as fixture/setup breakage.
- Existing site: **12 Node tests and 5 Python tests passed**; **2 static build tests passed**.
- Knowledge checker passed and **8 checker tests passed**, including the new indexed candidate page; rerun required before final push.
- New CLI dependency audit: **zero current advisories**. Old POC had four vulnerable dependency entries (one moderate, three high); upgraded Express from 4.21.2 to 4.22.3 and lockfile. POC audit then reported **zero current advisories**.
- Packed archive: allowlisted runtime files only, installed **offline** with lifecycle scripts disabled; installed CLI scan, unchanged check, changed-source gate, generation and unsafe-path rejection passed. Final archive hash must be recorded after any review fixes; earlier archives are provisional.
- Strict static-site allowlist/build tests passed; the new code is not added to the public static export. Hosted byte verification is not claimed.

The initial POC artifact test failed when copied onto a branch lacking its generation commit ancestry. Retained the original Grok branch as an ancestor of this isolated candidate and reran: artifact/provenance check passed. No provenance assertion was removed or weakened. Original POC proof logs are historical; generated reproduction logs must not silently replace them in the PR.

## Security and operational boundaries

Inputs are explicit source scopes at a pinned Git commit; dependency traversal and arbitrary framework discovery are not promised. Uncommitted edits and untracked source are not scanned. Resource limits and workers are not an OS sandbox. Use isolated repository metadata, trusted Git and unprivileged disposable jobs with no credentials when scanning untrusted sources. Baselines/scenarios must originate in a reviewed trusted revision; fingerprints do not authenticate authorship. Reports may contain sensitive identifiers and paths, despite omitting literals/snippets. Generated test execution is separately authorized, test-only, bounded and loopback-only; a local proxy must not expose production.

## Independent review

The initial delegated reviewer failed before inspection because its configured model was unsupported. A separate one-shot read-only review using the working model then identified source-path substitution and false-complete function/binding/import-argument cases. Failing regression tests were added before fixes. Removed working-tree source traversal in favor of pinned Git blobs; rejected generator/async declarations and unsupported imported arguments; required req/res/next bindings and authorization-header provenance. Follow-up review found an unbound next() edge case; added a failing test and required the actual third-parameter binding. Added an aggregate Git acquisition deadline. Final focused independent source review returned passed:true with no security/correctness blockers; it did not execute tests or grant release approval. The parent separately ran the 41-test suite and installed-archive smoke test successfully.

## Published candidate and remote verification

[Draft PR #3](https://github.com/DaveEliranAssistant/qe-atlas/pull/3) remains open and draft. [GitHub Actions run 41350121935](https://github.com/DaveEliranAssistant/qe-atlas/actions/runs/41350121935) completed successfully on Node 22/24 against `44d999ad9055844826b9edbf0250327a7e636682`, including all package tests, baseline/defect/maintenance proofs, site/build/knowledge regressions, dependency audits and installed-archive smoke checks. The exact jobs and completed steps were read back.

The first remote run failed because a warm local npm cache had concealed missing registry metadata during offline installation. A regression smoke test with a genuinely empty cache reproduced the failure locally; bundling exact audited Acorn plus its license fixed it. Repeated empty-cache installation and the remote matrix then passed. Pinned checkout/setup-node actions use Node-24-compatible v5 revisions on Ubuntu 24.04. Local and CI archive hashes may differ with packaging environment; the local delivered archive is independently hashed/tested, not claimed bit-identical to the CI archive. See `specgate-code-first-verification.json` for the verified code commit, local hash and evidence links.

CI configuration is read-only and has no deployment or artifact-publication step; required checks/branch protections are unchanged. The separate automatic Vercel preview check is failing on the existing author/team-membership integration boundary; no impersonation, team/access change or protection bypass was attempted. Production rollout was not performed.

## Before production enforcement

1. Completed for this candidate: fix the reported independent review findings, repeat local verification and record the immutable code/archive evidence.
2. Completed for the verified code commit: Node 22/24 CI matrix, including empty-cache installed-archive smoke proof. Re-run on future code changes.
3. Supply a representative real service and independently approved requirements/scenarios; measure unsupported coverage, defects caught, false positives, fixture recovery and runtime at realistic scale.
4. Begin with observe-only customer CI. Review coverage gaps and conservative comment-only change findings; do not ignore partial analysis globally.
5. Owner accepts pilot evidence and separately approves enforcement/release. Keep rollback as removing the consuming CI step or pinning a previous accepted archive; never silently regenerate accepted expectations.

TypeScript, router mounting, imported/async handlers, arbitrary auth, general database/outbound analysis, real E2E composition, an autonomous model agent, Windows support and a public signed registry release remain outside this candidate. None is implied by the production-preparation request or by passing synthetic tests.
