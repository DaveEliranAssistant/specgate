# SpecGate bounded OpenAPI removal adapter

This isolated adapter reuses the original SG-02 `compareSpecPair` engine **unchanged**. It does not replace or extend the separate code-first scanner.

```bash
node tools/openapi-removals/cli.mjs --base base.json --head head.json \
  --json /new/output/specgate.json --markdown /new/output/specgate.md
node --test tools/openapi-removals/cli.test.mjs tools/openapi-removals/specgate-diff-test.mjs
```

Node 22/24, no dependencies or network. Inputs are JSON OpenAPI 3.0.x. Outputs must be new, distinct files in existing directories. Exit `0` means no detected removals in these two rules only; `1` means removals; `2` means malformed/unsupported input or tool failure. Reports preserve the engine's `manual_review` status and unassessed diagnostics even when the removal gate returns 0.

**Two rules only:** exact `PATH_REMOVED` and exact lowercase-method `OPERATION_REMOVED`. A removed path suppresses duplicate operation findings below it. Direct path-item references suppress uncertain operation comparisons; no references are resolved. Schema, auth, response, parameter, request-body and runtime-consumer effects are not checked. Duplicate object keys use native JSON last-key-wins. No findings is not overall compatibility or permission to merge.

Input bytes are capped at 1 MiB each before native parsing; the unchanged engine also caps parsed depth at 64. File reads are bounded and refuse final-component symlinks, but this is not an OS/filesystem sandbox. Pointers and route names can still be sensitive. Do not include secrets in fixtures or public artifacts.

See `upstream.json` for the historical engine hash. The owner explicitly approved MIT publication of **this bounded OpenAPI engine and wrapper only** for public qe-dogfood CI. No private code-first scanner code, credentials or unrelated QE Atlas source is included. Product changes remain a PR, not a main push or deployment.
