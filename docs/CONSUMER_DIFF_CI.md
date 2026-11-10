# Consumer-break check in CI (preview, documentation only)

> **Status: preview.** `specgate diff` ships in the npm package `@qe-atlas/specgate` (since `0.1.0-rc.3`; `0.1.0-rc.4` adds Router mounts, CommonJS, TypeScript and imported handlers). Output schema, rules and finding codes may change. This page is an example: this repository does not ship or enable the workflow below.

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
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - name: Will this PR break API consumers?
        id: diff
        env:
          npm_config_ignore_scripts: 'true'  # no lifecycle scripts; service dependencies are never installed
        run: |
          set +e
          npm exec --yes --package=@qe-atlas/specgate@0.1.0-rc.4 -- specgate diff \
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
- **Pin the tool.** Use an exact package version (as above) or a reviewed, digest-verified archive, never a floating tag or the pull request's own tree.
- **Fork PRs.** The example uses only `contents: read` and `pull_request` (not `pull_request_target`), so forked code runs without secrets. Keep it that way.
- Want a JSON artifact? Drop `--format markdown` and upload the file. The report is sealed with a `fingerprint`.
