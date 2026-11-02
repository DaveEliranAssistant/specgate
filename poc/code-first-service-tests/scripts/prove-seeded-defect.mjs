import { proveEditedFixture } from './prove.mjs';

await proveEditedFixture({
  editPath: 'maintenance/seeded-defect.json',
  slug: 'seeded-defect',
  evidenceLog: 'evidence/seeded-defect.txt',
  evidenceReport: 'evidence/seeded-defect-report.json',
});
