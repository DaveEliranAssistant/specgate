# Consumer-break check in CI (preview, documentation only)

> **Status: unreleased preview.** `specgate diff` exists only in a source checkout of this repository. It is **not** in the published `@qe-atlas/specgate@0.1.0-rc.2` package. This page is an example: this repository does not ship or enable the workflow below.

The workflow runs `specgate diff` on each pull request: the PR head is compared with the merge base of the target branch. It needs no OpenAPI file, no model, no network access beyond the checkout, and does not start your service.

```yaml
# .github/workflows/specgate-consumer-diff.yml  (example — adapt and review before use)
name: SpecGate consumer-break check (preview)
on:
  pull_request:
permissions:
  contents: read
jobs:
  consumer-diff:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Check out the service under review
        uses: actions/checkout@v5          # pin to a full commit SHA in real use
        with:
          persist-credentials: false
          fetch-depth: 0                   # the merge base must be present locally
          path: service
      - name: Check out a trusted SpecGate revision (not from the PR)
        uses: actions/checkout@v5
        with:
          repository: DaveEliranAssistant/specgate
          ref: <reviewed-commit-sha>       # pin; preview code is not on npm
          persist-credentials: false
          path: specgate
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - name: Install SpecGate tooling only (no service dependencies, no lifecycle scripts)
        run: npm ci --prefix specgate/packages/specgate --ignore-scripts
      - name: Will this PR break API consumers?
        id: diff
        run: |
          set +e
          node specgate/packages/specgate/bin/specgate.mjs diff \
            --root service --source src \
            --base "origin/${{ github.base_ref }}" --head HEAD \
            --format markdown --output "$RUNNER_TEMP/specgate-diff.md"
          code=$?
          echo "exit=$code" >> "$GITHUB_OUTPUT"
          cat "$RUNNER_TEMP/specgate-diff.md" >> "$GITHUB_STEP_SUMMARY" || true
          # 0 = nothing found within the supported scope (NOT a compatibility guarantee)
          # 1 = breaking change or needs review (includes every analysis gap)
          # 2 = unreadable input / analysis failure: never treat as success
          exit $code
```

Notes:

- **Observe first.** During a pilot, add `continue-on-error: true` to the step and read the job summary. Only make it a required check after you have looked at its false positives on your own service.
- **Exit 2 is a failure, not a pass.** A missing merge base (shallow clone), a source scope that does not exist in one revision, or an unsupported ref all exit 2.
- **Exit 1 is not a defect verdict.** `needs_review` means "not statically provable", for example an analysis gap or a changed handler whose response type is not visible. A human decides.
- **Pin the tool.** Run SpecGate from a reviewed commit (or, once released, a pinned archive), never from the pull request's own tree.
- **Fork PRs.** The example uses only `contents: read` and `pull_request` (not `pull_request_target`), so forked code runs without secrets. Keep it that way.
- Want a JSON artifact? Drop `--format markdown` and upload the file. The report is sealed with a `fingerprint`.
