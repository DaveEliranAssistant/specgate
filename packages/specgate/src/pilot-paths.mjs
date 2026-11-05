import { realpathSync } from "node:fs";
import {
  resolve,
  relative,
  isAbsolute,
  dirname,
  basename,
  join,
  sep,
} from "node:path";
// Trusted filesystem assumption; not a hostile concurrent substitution sandbox.
export function outsideTarget(root, destination) {
  const desired = resolve(destination);
  const canonical = join(realpathSync(dirname(desired)), basename(desired));
  const inside = relative(realpathSync(root), canonical);
  if (
    !inside ||
    (!inside.startsWith(".." + sep) && inside !== ".." && !isAbsolute(inside))
  )
    throw Error("Output must be outside target");
  return canonical;
}
