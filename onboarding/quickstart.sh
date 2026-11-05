#!/usr/bin/env bash
# Review before running. Requires an owner-provided private archive and digest.
set -euo pipefail
umask 077
fail() { printf 'SpecGate setup: %s\n' "$1" >&2; exit 2; }
for executable in node npm git; do command -v "$executable" >/dev/null || fail "Missing prerequisite: $executable"; done
for name in SPECGATE_ARCHIVE SPECGATE_SHA256 SERVICE_ROOT SOURCE_SCOPE PILOT_DIR; do
  [[ -n "${!name:-}" ]] || fail "Set $name first; see quickstart.md."
done
node -e 'if (![22,24].includes(Number(process.versions.node.split(".")[0]))) process.exit(2)' || fail 'Use qualified Node 22 or 24.'
[[ "$SPECGATE_SHA256" =~ ^[a-fA-F0-9]{64}$ ]] || fail 'Expected a 64-character SHA-256 digest.'
[[ "$SPECGATE_ARCHIVE" = /* && "$SERVICE_ROOT" = /* && "$PILOT_DIR" = /* ]] || fail 'Archive, service and new pilot directory must be absolute paths.'
[[ ! -e "$PILOT_DIR" && ! -L "$PILOT_DIR" ]] || fail 'Pilot directory already exists; choose a new private directory.'
node --input-type=module -e '
 import {readFileSync} from "node:fs"; import {createHash} from "node:crypto";
 const actual=createHash("sha256").update(readFileSync(process.env.SPECGATE_ARCHIVE)).digest("hex");
 if(actual!==process.env.SPECGATE_SHA256.toLowerCase())process.exit(2);
' || fail 'Archive unreadable or SHA-256 mismatch. Nothing installed.'
revision="$(git -C "$SERVICE_ROOT" rev-parse --verify 'HEAD^{commit}')" || fail 'Service must have committed source in a Git repository.'
repository="$(git -C "$SERVICE_ROOT" rev-parse --show-toplevel)" || fail 'Cannot resolve the service repository.'
SERVICE_REPOSITORY="$repository" node --input-type=module -e '
 import {realpathSync} from "node:fs"; import {resolve,dirname,basename,sep} from "node:path";
 const repo=realpathSync(process.env.SERVICE_REPOSITORY);
 const target=resolve(realpathSync(dirname(process.env.PILOT_DIR)),basename(process.env.PILOT_DIR));
 if(target===repo||target.startsWith(repo+sep))process.exit(2);
' || fail 'Pilot directory must be outside the service repository, with an existing parent. Private tooling must not enter your source tree.'
mkdir -m 700 "$PILOT_DIR" || fail 'Cannot create the new pilot directory.'
if ! npm install --prefix "$PILOT_DIR/tool" --cache "$PILOT_DIR/empty-npm-cache" --offline --ignore-scripts --no-audit --no-fund --no-package-lock "$SPECGATE_ARCHIVE"; then
  fail 'Offline private archive install failed. No scan was run.'
fi
status=0
node "$PILOT_DIR/tool/node_modules/@qe-atlas/specgate/bin/specgate.mjs" scan \
  --root "$SERVICE_ROOT" --source "$SOURCE_SCOPE" --revision "$revision" \
  --output "$PILOT_DIR/scan.json" || status=$?
case "$status" in
  0) printf 'Declared subset analyzed. This is not a compatibility guarantee.\n' ;;
  1) printf 'Review required: partial analysis or empty route inventory. Do not treat this as PASS.\n' ;;
  *) fail 'Scan failed; do not accept or enforce this result.' ;;
esac
printf 'Pinned service commit: %s\nPrivate report: %s/scan.json\nOnly committed source was read; the service was not started.\n' "$revision" "$PILOT_DIR"
exit "$status"
