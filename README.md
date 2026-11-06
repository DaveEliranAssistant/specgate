# SpecGate

Code-first service discovery, reviewed regression tests and conservative CI change gates. **Service source code is the input; OpenAPI is not required.**

This private repository is the dedicated SpecGate product home. It replaces the QE Atlas candidate branch as the working home for future SpecGate changes. QE Atlas remains a separate product; its site and production deployment are not changed by this migration.

## Status

- **Available:** MIT-licensed CLI release candidate `@qe-atlas/specgate@0.1.0-rc.1`, published on npm with dist-tags `latest` and `next`; bounded committed-source scanning, baseline checks, reviewed-scenario compilation and executable synthetic proofs.
- **Reviewable onboarding preview:** [guided pilot page and verification instructions](onboarding/README.md), supported-scope fit check, recorded static CLI examples, private offline quickstart and pilot brief. This is not a deployed public website or hosted signup.
- **Not launched:** public product website, authenticated private-release CI installation, hosted signup endpoint, consumer-compatibility modes and real-service qualification. Waitlist code is merged but not deployed, and no `DATABASE_URL_POOLED` is configured. https://specgate.vercel.app is a separate pre-flight portal, not this product's landing.
- **Not production approved:** begin with a controlled, observe-only pilot. Passing the synthetic suite is not customer-service qualification.

See [adoption status and remaining acceptance gates](docs/ADOPTION.md). No customer repository is required to build the website or signup flow. A customer service is only needed for the separate real-service qualification gate.

## Repository layout

| Location | Responsibility |
|---|---|
| `packages/specgate/` | Scanner, CLI, scenario compiler, package docs and tests |
| `poc/code-first-service-tests/` | Preserved synthetic test/oracle/maintenance proofs |
| `docs/` | Product adoption, release evidence, migration provenance and security notes |
| `.github/workflows/quality.yml` | Standalone Node 22/24 quality gates; no deployment or production secrets |

The reviewable [onboarding preview](onboarding/README.md) now lives here. It is a static guided-pilot experience, not a public deployment or hosted signup. A public website and beta-access backend remain unlaunched.

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

See the [package guide](packages/specgate/README.md), [security model](packages/specgate/SECURITY.md) and [provenance](NOTICE.md). SpecGate is [MIT licensed](LICENSE). `@qe-atlas/specgate@0.1.0-rc.1` is published on npm with dist-tags `latest` and `next`. This source repository remains private.

## Vercel and beta access

The intended topology is one dedicated Vercel project backed by this GitHub repository, with an explicitly allowlisted website output and server-only beta credentials. Never publish the repository tree, CLI fixtures, private release reports or secrets as static files.

An existing dedicated free-tier `specgate-beta` database was provisioned before this repository existed. It is currently attached to QE Atlas, not this repository. It must be connected to the future dedicated SpecGate project and verified before any signup is described as live. No unrelated database should be reused, and no paid plan is authorized.

## Imported evidence

The nested release reports describe the upstream candidate and its historical QE Atlas CI. They do not prove a deployment or run in this repository. The migration imports 77 committed files, recorded in [the import manifest](docs/provenance/import-manifest.json). Runtime, requirements, fixtures and generated artifacts are unchanged. One provenance test is adapted to verify the imported revision and input hashes instead of unavailable upstream Git ancestry. Source attribution and this snapshot/history distinction are documented in [NOTICE.md](NOTICE.md).


## Developer pilot evidence (review candidate)

See [the developer-pilot entry point](docs/PILOT.md): explicit static coverage and reviewed-expectation context, actual private archive observe-only installation, recorded walkthrough, real-service protocol and unmeasured scorecard. This does not enable production enforcement or imply API compatibility.
