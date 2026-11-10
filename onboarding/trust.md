# SpecGate pilot: trust, privacy and boundaries

## What runs where

The static onboarding page performs a browser-local fit check and displays recorded synthetic CLI JSON. It has no source-upload field, external assets, analytics or persistence. The optional waitlist is the only form that sends data to a server, and only after consent. Downloading a brief is not a submission, email verification or access grant. The current preview is not a production deployment.

The local scanner reads committed Git tree/blob objects from a pinned revision and parses them. Scan/check do not import service modules, invoke project scripts, install target dependencies, start target services or contact a model/network service. Private artifact acquisition and npm installation are separate trusted preparation steps. The helper uses an owner-provided archive, digest verification, offline installation with a fresh cache and --ignore-scripts.

The scanner's byte/time/worker bounds are defense in depth, not an OS sandbox. Run untrusted Git metadata only in an appropriate isolated environment with trusted host tools. Enforce network/credential restrictions at the runner/container level; this helper does not create that sandbox.

## Confidentiality

The source repository is private; the CLI package `@qe-atlas/specgate@0.1.0-rc.4` is public on npm under MIT. Public dogfood may contain the authorized sample API/spec/demo PRs, not vendored scanner source. If you use a private archive instead of the registry, obtain only an immutable private built artifact with a least-privilege read-only credential, and never publish that archive, source maps or private npm cache through public CI artifacts/logs/caches. Do not expose a private reader secret to fork or untrusted jobs.

Reports exclude source snippets, literal constants, response bodies and enum values in this release candidate. Route paths, identifiers, source names and hashes remain and can be sensitive. This is not a complete secret scanner. Review and redact reports before sharing. No source upload is required to request a guided pilot.

## Limits to the verdict

The current candidate models Express in JavaScript (ESM/CommonJS) and TypeScript, including Router mounts and imported handlers, but contract checking covers only a narrow synchronous handler grammar, not real-world async/controller handlers. complete:true is declared-subset completeness only. auth:not_observed is not proof of public access. Exit 0 is not release approval, a security certification or a consumer-compatibility guarantee. Code-versus-OpenAPI conformance is not released; the base/head consumer-break check (`specgate diff`) is a preview. Source-change review can flag comments; do not call every finding a defect.

Unknown/unsupported coverage remains non-green. Preserve statuses and independently reviewed expectations; do not regenerate baselines or weaken assertions to silence findings. Report-only rollout does not turn tool failures into success.

## Pilot scope and support

Use one authorized service, an agreed source scope and a named technical owner. Agree report recipients and retention/deletion rules before acquisition. Keep credentials short-lived and private. No production release, changed branch protection, hosted signup, guaranteed support SLA, automatic remediation or customer qualification is implied.

Use your existing private pilot-coordinator contact for support. Share tool version, platform/Node version, exit code and a minimal redacted reproduction, not tokens or full customer source. Roll back by disabling the consumer step or pinning the last accepted artifact; retain reviewed expectations intact.
