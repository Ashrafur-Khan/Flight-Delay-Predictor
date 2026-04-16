import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..');
const installersDir = path.join(repoRoot, 'desktop', 'dist', 'installers');
const githubOutputPath = process.env.GITHUB_OUTPUT;
const supportedExtensions = new Set(['.dmg', '.exe']);

const extensionArg = process.argv
  .slice(2)
  .find((argument) => argument.startsWith('--extension='));
const extension = extensionArg ? extensionArg.slice('--extension='.length) : '';

if (!supportedExtensions.has(extension)) {
  console.error('prepare-release-assets.mjs requires --extension=.dmg or --extension=.exe');
  process.exit(1);
}

if (!fs.existsSync(installersDir)) {
  console.error(`Installer output directory does not exist: ${installersDir}`);
  process.exit(1);
}

const installerCandidates = fs.readdirSync(installersDir)
  .filter((entry) => entry.endsWith(extension))
  .filter((entry) => !entry.endsWith(`${extension}.blockmap`))
  .map((entry) => path.join(installersDir, entry))
  .filter((entryPath) => fs.statSync(entryPath).isFile())
  .sort();

if (installerCandidates.length !== 1) {
  console.error(
    `Expected exactly one ${extension} installer in ${installersDir}, found ${installerCandidates.length}.`,
  );
  for (const candidate of installerCandidates) {
    console.error(candidate);
  }
  process.exit(1);
}

const installerPath = installerCandidates[0];
const installerFileName = path.basename(installerPath);
const checksum = crypto.createHash('sha256').update(fs.readFileSync(installerPath)).digest('hex');
const checksumPath = `${installerPath}.sha256`;

fs.writeFileSync(checksumPath, `${checksum}  ${installerFileName}\n`, 'utf8');

if (githubOutputPath) {
  fs.appendFileSync(githubOutputPath, `installer_path=${installerPath}\n`, 'utf8');
  fs.appendFileSync(githubOutputPath, `checksum_path=${checksumPath}\n`, 'utf8');
}

console.log(`Prepared release assets for ${installerFileName}`);
console.log(checksumPath);
