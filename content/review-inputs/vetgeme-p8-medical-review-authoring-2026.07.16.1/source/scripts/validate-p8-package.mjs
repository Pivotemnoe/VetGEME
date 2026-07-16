import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'MANIFEST.json'), 'utf8'));
const audit = JSON.parse(fs.readFileSync(path.join(packageRoot, 'generated/P8_SOURCE_AUDIT.json'), 'utf8'));
const dialogue = JSON.parse(fs.readFileSync(path.join(packageRoot, 'generated/P8_DIALOGUE_VALIDATION.json'), 'utf8'));
const issues = [];
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

for (const relativePath of manifest.authoritativeFiles) {
  const file = path.join(packageRoot, relativePath);
  if (!fs.existsSync(file)) {
    issues.push({ code: 'AUTHORITATIVE_FILE_MISSING', relativePath });
    continue;
  }
  if (manifest.fileSha256[relativePath] !== sha256(file)) {
    issues.push({ code: 'AUTHORITATIVE_FILE_DIGEST_MISMATCH', relativePath });
  }
}

const exactChecks = {
  familyCount: audit.counts.families === 39 && manifest.counts.families === 39,
  variantCount: audit.counts.variants === 215 && manifest.counts.variants === 215,
  presentationCount: audit.counts.presentations === 645 && manifest.counts.presentations === 645,
  sourceAuditFailsClosed: audit.status === 'blocked' && manifest.gates.sourceAudit === 'blocked',
  correctionNotClaimed: manifest.gates.correctionComplete === false,
  externalApprovalNotClaimed: manifest.gates.externalVeterinaryApproval === false,
  activationForbidden: manifest.activationAllowed === false && manifest.gates.activationManifestPresent === false,
  dialogueGatePasses: dialogue.status === 'pass' && manifest.gates.humanDialogueLibrary === 'pass',
  humanProfilesComplete: dialogue.counts.expectedOwnerProfiles === 12 && dialogue.counts.actualOwnerProfiles === 12
};
for (const [check, passed] of Object.entries(exactChecks)) {
  if (!passed) issues.push({ code: 'PACKAGE_GATE_MISMATCH', check });
}

const report = {
  schemaVersion: 1,
  packageId: manifest.packageId,
  packageVersion: manifest.packageVersion,
  status: issues.length === 0 ? 'pass' : 'blocked',
  exactChecks,
  sourceDefectsRemainOpen: audit.counts.issues,
  activationAllowed: false,
  issues
};
fs.writeFileSync(path.join(packageRoot, 'generated/P8_PACKAGE_VALIDATION.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'pass') process.exitCode = 1;
