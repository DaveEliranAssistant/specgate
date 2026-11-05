#!/usr/bin/env node
import { mkdirSync, writeFileSync, realpathSync } from "node:fs";
import {
  resolve,
  relative,
  isAbsolute,
  dirname,
  basename,
  join,
} from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pilotMarkdown } from "../src/pilot-report.mjs";
let output;
const save = (name, value) =>
  writeFileSync(resolve(output, name), value, { flag: "wx", mode: 0o600 });
try {
  const [root, scope, baseline, scenarios, dest, revision = "HEAD"] =
    process.argv.slice(2);
  if (
    ![5, 6].includes(process.argv.length - 2) ||
    ![root, scope, baseline, scenarios, dest].every(
      (x) => typeof x === "string" && x,
    )
  )
    throw Error("arguments");
  const desired = resolve(dest);
  output = join(realpathSync(dirname(desired)), basename(desired));
  const inside = relative(realpathSync(root), output);
  if (
    !inside ||
    (!inside.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) &&
      inside !== ".." &&
      !isAbsolute(inside))
  )
    throw Error("output inside target");
  mkdirSync(output, { mode: 0o700 });
  const r = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./specgate-pilot.mjs", import.meta.url)),
      "--root",
      root,
      "--source",
      scope,
      "--baseline",
      baseline,
      "--scenarios",
      scenarios,
      "--revision",
      revision,
    ],
    { encoding: "utf8", timeout: 90000, maxBuffer: 16777216 },
  );
  if (r.error || ![0, 1].includes(r.status)) {
    save(
      "operational.json",
      JSON.stringify({
        mode: "observe-only",
        classification: "tool-error",
        analysisExitCode: r.status ?? 2,
      }),
    );
    throw Error("tool error");
  }
  const report = JSON.parse(r.stdout);
  if (
    report.schemaVersion !== "specgate.pilot/1" ||
    report.exitCode !== r.status ||
    report.mode !== "observe-only" ||
    ![
      r.status === 0 ? "UNCHANGED_DECLARED_SUBSET" : "REVIEW_REQUIRED",
      ...(r.status === 1 ? ["INCOMPLETE"] : []),
    ].includes(report.verdict)
  )
    throw Error("invalid report");
  save("native.json", r.stdout);
  save("report.md", pilotMarkdown(report));
  save(
    "operational.json",
    JSON.stringify(
      {
        mode: "observe-only",
        classification:
          r.status === 1 ? "review-required" : "unchanged-declared-subset",
        analysisExitCode: r.status,
        behavioralValidation: "NOT_EXECUTED",
        compatibility: "NOT_ASSESSED",
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    `Collected ${report.verdict}; native analysis exit ${r.status}. Collector success is not compatibility or behavioral clearance.\n`,
  );
} catch {
  process.stderr.write(
    "SpecGate observe collector: input/tool error or unsafe/existing evidence directory; no baseline/assertions changed.\n",
  );
  process.exitCode = 2;
}
