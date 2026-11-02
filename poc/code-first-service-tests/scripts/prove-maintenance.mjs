import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyRuns } from '../src/maintain.mjs';
import { pocRoot } from '../src/load.mjs';
import { captureClosedPortError, proveEditedFixture } from './prove.mjs';

await proveEditedFixture({
  editPath: 'maintenance/sample-edits.json',
  slug: 'maintenance',
  evidenceLog: 'evidence/maintenance.txt',
  evidenceReport: 'evidence/maintenance-report.json',
});

const probe = await captureClosedPortError();
const classification = classifyRuns([{
  scenarioId: 'probe.closed-port',
  result: 'failed',
  error: `${probe.message}\n${probe.cause ?? ''}`,
  errorCode: probe.code,
}]);
writeFileSync(join(pocRoot, 'evidence/setup-probe.json'), `${JSON.stringify({
  note: 'Real loopback connection failure. The error text is the runtime message, and the classification is the maintenance function output.',
  probe,
  classification,
}, null, 2)}\n`);
if (classification.changeClass !== 'fixture_or_setup_breakage') {
  console.error('Closed-port probe was not classified as fixture or setup breakage');
  process.exitCode = 1;
} else {
  console.log(`setup probe ${probe.code ?? probe.message} -> ${classification.changeClass}`);
}
