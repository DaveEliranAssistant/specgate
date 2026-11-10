# Your first private SpecGate report

Status: guided pilot, CLI 0.1.0-rc.4. This guide covers `scan/check`. The `specgate diff` consumer-break check ships in the package as a preview; code-versus-OpenAPI `conform` is not available. A successful scan is not API compatibility or production approval.

## Before you start

- Obtain permission to analyze one service. Use isolated Git metadata and a trusted host Git executable.
- Use Node 22 or 24, npm, Git and Bash on Linux/macOS. Windows is not qualified.
- Current scope: Express in JavaScript (ESM or CommonJS) or TypeScript (`.ts`, Node 22.13 or later; not TSX), literal routes on apps and `express.Router()` mounts with prefixes, and handlers imported from other scanned files. Contract checking (validation, response shapes, auth) does not yet cover real-world async/controller handlers: they are inventoried and fingerprinted, and changes are reported for review.
- Receive the private npm-pack archive and its independently trusted SHA-256 from your pilot coordinator. `@qe-atlas/specgate@0.1.0-rc.4` is also on npm (dist-tags `latest` and `next`), but this helper does not install from the registry. No live private release URL is advertised here. Do not paste credentials into chat or send source to this page.
- Review quickstart.sh before running it. Select a NEW private pilot directory OUTSIDE your service repository, with an existing parent directory. It must not be reused or symlinked. Do not publish its contents or npm cache.

## Configure the helper

Replace these examples with your own absolute paths and the owner-provided digest. These are settings, not downloadable artifact URLs.

```bash
export SPECGATE_ARCHIVE="/absolute/path/to/private-specgate-archive.tgz"
export SPECGATE_SHA256="REPLACE_WITH_OWNER_PROVIDED_64_HEX_DIGEST"
export SERVICE_ROOT="/absolute/path/to/authorized-service"
export SOURCE_SCOPE="src"
export PILOT_DIR="/absolute/path/to/NEW-private-pilot-directory"
bash quickstart.sh
```

The helper refuses missing values, invalid digests, an existing pilot directory or an unsupported Node version. It validates the archive SHA-256 BEFORE installing, uses offline npm installation with an empty cache, disables lifecycle scripts, resolves service HEAD to a commit once, and writes `PILOT_DIR/scan.json` privately. It does not install service dependencies, import source or start a service. Only committed source inside SOURCE_SCOPE is included. A source scope is a relative directory/file, not a shell glob.

There is no credential requirement for this local archive recipe. Obtaining a private release asset in CI is a SEPARATE integration gate: a scoped read-only reader secret is not configured, and authenticated CI download has not been verified. Do not substitute an administrator token. The offline archive test does not establish working private-release distribution.

## Read the first report

- Exit 0: declared subset analyzed. Inspect routes, source revision, warning and coverage. This is NOT a compatibility guarantee.
- Exit 1: review required—unsupported/partial analysis or no routes. Retain the report; do not suppress this into PASS.
- Exit 2: setup, input, scope, integrity or resource failure. Stop. Do not use an older report as though it belongs to this run.

Look at `schemaVersion`, `routes`, `gaps`, `complete` and `sourceCommit`. `auth: not_observed` does not prove that an endpoint is public. Reports omit literal response bodies and snippets but still retain potentially sensitive identifiers, paths and hashes.

The helper chooses one explicit source scope. For multiple scopes, use the installed CLI and repeat `--source`; modules outside the chosen scopes are not followed automatically. The installed executable is `PILOT_DIR/tool/node_modules/@qe-atlas/specgate/bin/specgate.mjs`. Use its `--help` for the supported syntax.

## Review a later change

A baseline is an independently REVIEWED scan of the accepted service state, not an automatic expected-output file. Keep it outside the untrusted PR checkout or obtain it from the reviewed base revision. Do not regenerate it merely to make a check pass.

```bash
# Replace these explicit paths; run with the trusted installed CLI.
node /absolute/private-pilot/tool/node_modules/@qe-atlas/specgate/bin/specgate.mjs check \
  --root /absolute/path/to/authorized-service --source src \
  --baseline /absolute/path/to/trusted-reviewed-scan.json \
  --format markdown
```

For check, exit 1 also includes route/source drift. A comment-only change can trigger review. This legacy check does NOT classify consumer breaks versus safe changes. New conformance/code-diff modes are not in this release candidate. No `--mode report-only` flag exists here; report-only describes the pilot process: collect and review results without blocking releases, while preserving error statuses.

## Pilot rollout, not a copy/paste privileged workflow

1. Pin a reviewed built artifact AND digest; keep its private distribution credential only in a protected download stage.
2. Analyze committed target source with trusted tooling, no target scripts/dependency installs, no credentials and network denied by the runner/container boundary. Preserve service commit and tool provenance.
3. Retain reports privately. Separately publish only explicitly approved, reviewed synthetic dogfood results.
4. Collect statuses 0/1/2 without changing their meaning. Investigate errors; a missing/skipped producer is not PASS.
5. Enable enforcement only after independent review, representative-service qualification and owner approval. Remove the CI consumer or restore the previous accepted tool pin to roll back; do not alter accepted expectations.

An executable cross-repository CI installation snippet is intentionally withheld until the scoped credential and actual download path are exercised. Fork PRs must not receive private artifact credentials. No pull_request_target workaround is proposed.

## Troubleshooting

- Missing edit: check the pinned commit and source scope; uncommitted/untracked files are excluded.
- Digest mismatch: obtain the correct archive/digest through your approved private channel. Never bypass verification.
- Offline install failed: coordinator must provide a correctly built archive with bundled exact parser dependency/license. Do not silently fall back to a public package.
- Existing directory: use a different NEW private pilot directory. The helper will not overwrite an earlier report or baseline.
- Coverage incomplete: retain the unsupported finding and arrange scope review. Do not label it compatible.
- Tool failure: share tool version, exit code, environment and a redacted minimal example privately. Never include tokens or customer source in public issues.
