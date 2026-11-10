# SpecGate

Code-first service discovery, reviewed regression tests and conservative CI change gates. **Service source code is the input; OpenAPI is not required.**

This public repository is the dedicated SpecGate product home. It replaces the QE Atlas candidate branch as the working home for future SpecGate changes. QE Atlas remains a separate product; its site and production deployment are not changed by this migration.

## Status

- **Available:** MIT-licensed CLI release candidate `@qe-atlas/specgate@0.1.0-rc.2`, published on npm with dist-tags `latest` and `next`; bounded committed-source scanning, baseline checks, reviewed-scenario compilation and executable synthetic proofs.
- **Public landing:** <https://specgate-qe-atlas.vercel.app> is live with the guided observe-only pilot, supported-scope fit check, recorded static CLI examples, offline quickstart, pilot brief and consented waitlist. See [how it is built and verified](onboarding/README.md).
- **Unreleased preview (source checkout only, not in the npm package):** `specgate diff --base REF --head REF`, a static base-vs-head consumer-break check for the supported Express subset. See [the package README](packages/specgate/README.md#consumer-break-check-preview-unreleased), the [CI example](docs/CONSUMER_DIFF_CI.md) and [its limits](docs/research/consumer-break-mode-b.md). Exit 0 is not a compatibility guarantee.
- **Not in this build:** authenticated private-release CI installation, code-versus-OpenAPI comparison and real-service qualification.
- **Not production approved:** begin with a controlled, observe-only pilot. Passing the synthetic suite is not customer-service qualification. SpecGate makes no full compatibility or production qualification claim.

**[Give feedback](https://github.com/DaveEliranAssistant/specgate/discussions/categories/ideas)** in the Ideas category of GitHub Discussions.

See [adoption status and remaining acceptance gates](docs/ADOPTION.md). No customer repository is required to build the website or signup flow. A customer service is only needed for the separate real-service qualification gate.

## Repository layout

| Location | Responsibility |
|---|---|
| `packages/specgate/` | Scanner, CLI, scenario compiler, package docs and tests |
| `poc/code-first-service-tests/` | Preserved synthetic test/oracle/maintenance proofs |
| `docs/` | Product adoption, release evidence, migration provenance and security notes |
| `.github/workflows/quality.yml` | Standalone Node 22/24 quality gates; no deployment or production secrets |

The [public landing](https://specgate-qe-atlas.vercel.app) is built from [`onboarding/`](onboarding/README.md): a static guided-pilot experience, with the consented waitlist served by `api/waitlist.mjs`.

## Development and verification

Requires Git, Node 22 or 24, and npm. From the repository root:

```bash
npm ci --ignore-scripts
npm ci --prefix packages/specgate --ignore-scripts
npm ci --prefix poc/code-first-service-tests --ignore-scripts
npm test
npm run test:proofs
npm run test:pack
npm run audit:production
```

The proof commands run test-owned synthetic services on loopback. They deliberately verify expected failures for seeded defects and assertion-preserving maintenance. Scanning does not execute the scanned service.

## CLI

```bash
node packages/specgate/bin/specgate.mjs --help
node packages/specgate/bin/specgate.mjs scan --root /path/to/service --source src
node packages/specgate/bin/specgate.mjs check \
  --root /path/to/service --source src --baseline /trusted/reviewed-baseline.json
node packages/specgate/bin/specgate.mjs generate \
  --root /path/to/service --source src \
  --scenarios /trusted/reviewed-scenarios.json --output /new/path/api.spec.mjs
```

Only committed source is scanned; `HEAD` is pinned once. Baselines and scenarios must come from trusted, reviewed revisions, not be silently accepted from an untrusted pull request. Exit codes: `0` declared-subset success, `1` findings or incomplete coverage requiring review, `2` input/tool failure.

The supported adapter is a constrained JavaScript/Express literal-route subset, not all JavaScript, TypeScript or frameworks. Unsupported constructs are reported as non-green gaps. Independently reviewed requirements define expected behavior; code changes do not automatically rewrite assertions.

See the [package guide](packages/specgate/README.md), [security model](packages/specgate/SECURITY.md) and [provenance](NOTICE.md). SpecGate is [MIT licensed](LICENSE). `@qe-atlas/specgate@0.1.0-rc.2` is published on npm with dist-tags `latest` and `next`. The source is public at <https://github.com/DaveEliranAssistant/specgate>.

## Vercel and waitlist

The public landing is deployed on Vercel at <https://specgate-qe-atlas.vercel.app>, with an explicitly allowlisted website output and server-only waitlist credentials. Never publish the repository tree, CLI fixtures, release reports or secrets as static files.

`GET /api/waitlist` on the landing reports `{"available":true}` when the waitlist database is configured. No unrelated database should be reused, and no paid plan is authorized.

## Imported evidence

The nested release reports describe the upstream candidate and its historical QE Atlas CI. They do not prove a deployment or run in this repository. The migration imports 77 committed files, recorded in [the import manifest](docs/provenance/import-manifest.json). Runtime, requirements, fixtures and generated artifacts are unchanged. One provenance test is adapted to verify the imported revision and input hashes instead of unavailable upstream Git ancestry. Source attribution and this snapshot/history distinction are documented in [NOTICE.md](NOTICE.md).


## Developer pilot evidence (review candidate)

See [the developer-pilot entry point](docs/PILOT.md): explicit static coverage and reviewed-expectation context, actual private archive observe-only installation, recorded walkthrough, real-service protocol and unmeasured scorecard. This does not enable production enforcement or imply API compatibility.
