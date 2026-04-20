import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..');
const destinationPath = path.join(repoRoot, 'backend', 'model.pkl');
const sourcePathInput = process.env.FLIGHT_DELAY_RELEASE_MODEL_PATH?.trim();

if (!sourcePathInput) {
  process.exit(0);
}

if (!path.isAbsolute(sourcePathInput)) {
  console.error('FLIGHT_DELAY_RELEASE_MODEL_PATH must be an absolute path.');
  process.exit(1);
}

const sourcePath = path.resolve(sourcePathInput);

if (!fs.existsSync(sourcePath)) {
  console.error(`Release model artifact not found: ${sourcePath}`);
  process.exit(1);
}

if (!fs.statSync(sourcePath).isFile()) {
  console.error(`Release model artifact must be a file: ${sourcePath}`);
  process.exit(1);
}

if (sourcePath === destinationPath) {
  console.log(`Using release model artifact already staged at ${destinationPath}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
fs.copyFileSync(sourcePath, destinationPath);

const copiedBytes = fs.statSync(destinationPath).size;
const copiedMiB = (copiedBytes / (1024 * 1024)).toFixed(1);

console.log(
  `Staged release model artifact from ${sourcePath} to ${destinationPath} (${copiedMiB} MiB)`,
);
