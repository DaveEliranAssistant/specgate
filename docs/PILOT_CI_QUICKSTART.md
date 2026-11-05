# Reproducible private-archive observe-only quickstart

## Actual availability, not a registry promise

The available distribution is a **locally packed private RC candidate**, now also built/tested by this PR's private static CI. There are no GitHub releases and no public npm installation claim. Older 0.1.0-rc.1 archives do not contain these new entrypoints; pin the source commit and archive SHA-256 from the matching evidence receipt. No publication is performed.

Reproduce the full installation/collector proof from the reviewed source checkout:

```sh
npm ci --ignore-scripts
npm ci --prefix packages/specgate --ignore-scripts
node scripts/verify-pilot-package.mjs /absolute/new/proof-directory
```

The script actually packs the allowlisted runtime plus exact bundled Acorn/license, installs with **an empty npm cache and `--offline --ignore-scripts`**, and invokes the installed entrypoints on committed synthetic source. It verifies clean/status-drift/comment/add/remove/unsupported cases, malformed inputs, unchanged scenario/baseline bytes and byte-identical generated assertions for the seeded status change. It does not start the service or execute generated tests. See the receipt/artifact links in the PR for the exact tested head, Node version and digest. Neither an archive install nor static seeded detection is customer qualification.

## Obtaining the candidate

An already authorized owner can download the private `specgate-static-pilot-node-22` artifact from the successful run linked in the PR using GitHub's UI or:

```sh
gh run download "$VERIFIED_RUN_ID" --repo DaveEliranAssistant/specgate \
  --name specgate-static-pilot-node-22 --dir candidate
```

The artifact contains `receipt.json` and the actual `.tgz`. Match its source run/head and SHA-256 to owner-reviewed evidence. A hash from the same untrusted location does not establish authenticity. Owner download access is not proof that a consumer repository has a suitable read-only credential. Do not copy the operator's broader login into customer CI. A published private release and narrowly scoped artifact reader are still separate distribution gates.

## Exact installed-package commands

Use trusted tooling/baselines/scenarios outside the target. The target must be an isolated Git checkout with the desired full head SHA available; do not run target scripts or install its dependencies. Start with an independently approved scan baseline from the accepted base SHA and reviewed scenarios from a trusted base revision. If the initial scan is partial, review its gaps rather than approving an invalid baseline or narrowing scope just to get green.

Set the operator-supplied paths/digest first; all directories must be fresh and outside the target:

```sh
# ARCHIVE, EXPECTED_SHA256, TOOL_DIR, EMPTY_CACHE, TARGET, TRUSTED_BASELINE,
# TRUSTED_SCENARIOS, NEW_EVIDENCE_DIR and FULL_HEAD_SHA are explicit inputs.
node --input-type=module -e 'import{readFileSync}from"node:fs";import{createHash}from"node:crypto";const actual=createHash("sha256").update(readFileSync(process.argv[1])).digest("hex");if(!/^[a-f0-9]{64}$/.test(process.argv[2])||actual!==process.argv[2])process.exit(2)' "$ARCHIVE" "$EXPECTED_SHA256"
node --input-type=module -e 'import{mkdirSync}from"node:fs";mkdirSync(process.argv[1],{mode:0o700})' "$TOOL_DIR"
npm install --prefix "$TOOL_DIR" --cache "$EMPTY_CACHE" --offline \
  --ignore-scripts --no-audit --no-fund --no-package-lock "$ARCHIVE"
node "$TOOL_DIR/node_modules/@qe-atlas/specgate/bin/specgate-observe.mjs" \
  "$TARGET" src "$TRUSTED_BASELINE" "$TRUSTED_SCENARIOS" \
  "$NEW_EVIDENCE_DIR" "$FULL_HEAD_SHA"
```

The collector takes one explicit source scope. Use `specgate-pilot.mjs --source` repeatedly for multi-scope analysis; do not silently vary approved baseline scopes. Evidence directory's parent must exist. `native.json`, `report.md`, `operational.json` preserve native result and analysis exit. `REVIEW_REQUIRED`/`INCOMPLETE` remain exit 1 in the evidence even when the collector succeeds; input/tool errors remain exit 2. Existing directories/files are refused, not cleaned or reused.

## CI report step (observe-only, not production enforcement)

Use the same commands in a read-only job after obtaining the owner-approved archive and trusted base baseline/scenarios. Checkout with `persist-credentials: false`, fetch the exact target commit, isolate source from tooling, disable install lifecycle scripts, and grant no target runtime secrets. Never execute artifact HTML or service code. In GitHub Actions:

```yaml
permissions:
  contents: read
steps:
  # Prior steps: trusted archive and digest, trusted baseline/scenarios,
  # isolated target checkout and offline installation as above.
  - name: Collect static review evidence, not an API pass
    run: node "$TOOL_DIR/node_modules/@qe-atlas/specgate/bin/specgate-observe.mjs" "$TARGET" src "$TRUSTED_BASELINE" "$TRUSTED_SCENARIOS" "$RUNNER_TEMP/specgate-evidence" "$FULL_HEAD_SHA"
  - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
    if: always()
    with:
      name: private-specgate-evidence
      path: ${{ runner.temp }}/specgate-evidence/
      if-no-files-found: error
      retention-days: 14
```

This is a wiring fragment, not a claim of a tested customer integration. The complete **tested product workflow** is `.github/workflows/quality.yml`, static pilot job, Node 22/24. It executes the actual package proof above, preserving original static assertions; the full fixture-runtime job is explicitly opt-in. Keep customer distribution/authentication and real-service qualification separately blocked until exercised. Roll back by removing the observe collector or pinning the previous approved archive; do not rewrite assertions/baselines.
