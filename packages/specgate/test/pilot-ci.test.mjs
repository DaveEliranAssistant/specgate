import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("automatic pilot CI is static-only; retained full runtime proofs require explicit workflow-dispatch approval", () => {
  const y = readFileSync(
    new URL("../../../.github/workflows/quality.yml", import.meta.url),
    "utf8",
  );
  assert.match(y, /run_synthetic_runtime:/);
  assert.match(y, /if:.*workflow_dispatch.*run_synthetic_runtime/);
  assert.match(y, /name: Static developer-pilot evidence/);
  assert.match(y, /scripts\/verify-pilot-package.mjs/);
  assert.doesNotMatch(y, /pull_request_target|secrets\./);
});
