import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { scanRepository } from "../src/scan.mjs";
import { commitFixture } from "./fixture-git.mjs";
const cli = resolve(import.meta.dirname, "../bin/specgate-pilot.mjs"),
  observe = resolve(import.meta.dirname, "../bin/specgate-observe.mjs");
const source =
  "import express from 'express';export const app=express();app.get('/health',(req,res)=>{res.status(200).json({ok:true});});";
async function setup(t) {
  const work = mkdtempSync(join(tmpdir(), "pilot-cli-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const root = join(work, "service");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/app.mjs"), source);
  commitFixture(root);
  const baseline = join(work, "baseline.json");
  writeFileSync(
    baseline,
    JSON.stringify(await scanRepository({ root, sources: ["src"] })),
  );
  const scenarios = join(work, "reviewed.json");
  writeFileSync(
    scenarios,
    JSON.stringify({
      schemaVersion: "specgate.scenarios/1",
      review: { reference: "req/<script>NOT_EXECUTED</script>" },
      scenarios: [
        {
          id: "health.ok",
          classification: "approved_requirement",
          steps: [
            {
              method: "GET",
              path: "/health",
              expected: { status: 200, bodyEquals: { ok: true } },
            },
          ],
        },
      ],
    }),
  );
  return { root, work, baseline, scenarios };
}
const run = (bin, args) =>
  spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    timeout: 20000,
  });
test("actual pilot CLI emits JSON and escaped Markdown, leaves target source unexecuted", async (t) => {
  const x = await setup(t);
  const args = [
    "--root",
    x.root,
    "--source",
    "src",
    "--baseline",
    x.baseline,
    "--scenarios",
    x.scenarios,
  ];
  const a = run(cli, args);
  assert.equal(a.status, 0, a.stderr);
  const r = JSON.parse(a.stdout);
  assert.equal(r.compatibility, "NOT_ASSESSED");
  const b = run(cli, [...args, "--format", "markdown"]);
  assert.equal(b.status, 0, b.stderr);
  assert.ok(b.stdout.includes("&lt;script&gt;"));
  assert.ok(!b.stdout.includes("<script>"));
});
test("observe collector retains native review/incomplete exit 1 but input/tool failures remain exit 2", async (t) => {
  const x = await setup(t);
  writeFileSync(
    join(x.root, "src/app.mjs"),
    source.replace("ok:true", "ok:false"),
  );
  commitFixture(x.root);
  const out = join(x.work, "proof");
  const a = run(observe, [x.root, "src", x.baseline, x.scenarios, out]);
  assert.equal(a.status, 0, a.stderr);
  const r = JSON.parse(readFileSync(join(out, "native.json")));
  assert.equal(r.exitCode, 1);
  assert.equal(r.verdict, "REVIEW_REQUIRED");
  const op = JSON.parse(readFileSync(join(out, "operational.json")));
  assert.equal(op.analysisExitCode, 1);
  assert.equal(op.classification, "review-required");
  const b = run(observe, [x.root, "src", x.baseline, x.scenarios, out]);
  assert.equal(b.status, 2);
  writeFileSync(x.scenarios, "{malformed");
  assert.equal(
    run(observe, [
      x.root,
      "src",
      x.baseline,
      x.scenarios,
      join(x.work, "invalid"),
    ]).status,
    2,
  );
});
test("committed source side effects are never executed or leaked into the report", async (t) => {
  const x = await setup(t);
  const sentinel = join(x.work, "EXECUTED");
  writeFileSync(
    join(x.root, "src/app.mjs"),
    source +
      `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(sentinel)},'SOURCE_CANARY');`,
  );
  commitFixture(x.root);
  const a = run(cli, [
    "--root",
    x.root,
    "--source",
    "src",
    "--baseline",
    x.baseline,
    "--scenarios",
    x.scenarios,
  ]);
  assert.equal(a.status, 1);
  assert.ok(!existsSync(sentinel));
  assert.ok(!a.stdout.includes(sentinel));
  assert.ok(!a.stdout.includes("SOURCE_CANARY"));
});
test("CLI and collector never overwrite trusted baseline/expectations or existing reports", async (t) => {
  const x = await setup(t);
  const before = readFileSync(x.baseline, "utf8");
  const a = run(cli, [
    "--root",
    x.root,
    "--source",
    "src",
    "--baseline",
    x.baseline,
    "--scenarios",
    x.scenarios,
    "--output",
    x.baseline,
  ]);
  assert.equal(a.status, 2);
  assert.equal(readFileSync(x.baseline, "utf8"), before);
  assert.equal(
    run(observe, [
      x.root,
      "src",
      x.baseline,
      x.scenarios,
      join(x.root, "reports"),
    ]).status,
    2,
  );
  const alias = join(x.work, "alias");
  symlinkSync(x.root, alias);
  assert.equal(
    run(observe, [
      x.root,
      "src",
      x.baseline,
      x.scenarios,
      join(alias, "leaked"),
    ]).status,
    2,
  );
  assert.ok(!existsSync(join(x.root, "leaked")));
});

test("direct pilot CLI refuses output inside target, including parent symlink aliases", async (t) => {
  const x = await setup(t);
  const args = [
    "--root",
    x.root,
    "--source",
    "src",
    "--baseline",
    x.baseline,
    "--scenarios",
    x.scenarios,
  ];
  assert.equal(
    run(cli, [...args, "--output", join(x.root, "new-report.json")]).status,
    2,
  );
  assert.ok(!existsSync(join(x.root, "new-report.json")));
  const alias = join(x.work, "alias-output");
  symlinkSync(x.root, alias);
  assert.equal(
    run(cli, [...args, "--output", join(alias, "escaped.json")]).status,
    2,
  );
  assert.ok(!existsSync(join(x.root, "escaped.json")));
});
