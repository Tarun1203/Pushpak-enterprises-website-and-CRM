// Writes the release id shown in the CRM sidebar:  node scripts/stamp-release.mjs 1.0.0 [build]
// build defaults to the short git commit. Run before every deploy (see docs/DEPLOY-ROLLBACK.md).
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) { console.error('Usage: node scripts/stamp-release.mjs <version like 1.0.0> [build]'); process.exit(1); }
let build = process.argv[3];
if (!build) { try { build = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { build = 'local'; } }
const date = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
writeFileSync(new URL('../crm/release.js', import.meta.url),
  `/* Release identification. scripts/stamp-release.mjs rewrites this file at deploy time. */\nwindow.PE_RELEASE = ${JSON.stringify({ version, build, date })};\n`);
console.log(`Stamped release ${version} (${build}) ${date}`);
