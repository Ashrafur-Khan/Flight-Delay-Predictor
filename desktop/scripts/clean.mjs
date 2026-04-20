import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '..', '..');
const targets = [
  path.join(repoRoot, 'desktop', '.pyinstaller'),
  path.join(repoRoot, 'desktop', 'dist', 'backend'),
  path.join(repoRoot, 'desktop', 'dist', 'installers'),
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
}
