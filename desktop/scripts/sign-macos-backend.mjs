import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status ?? 1}`);
  }
}

function isSignableBinary(candidatePath) {
  const stat = fs.statSync(candidatePath);
  if (!stat.isFile()) {
    return false;
  }

  const extension = path.extname(candidatePath);
  if (['.dylib', '.so'].includes(extension)) {
    return true;
  }

  return extension === '' && (stat.mode & 0o111) !== 0;
}

function collectSignTargets(root) {
  const binaryTargets = [];
  const frameworkTargets = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.framework')) {
        const nestedTargets = collectSignTargets(fullPath);
        binaryTargets.push(...nestedTargets.binaryTargets);
        frameworkTargets.push(...nestedTargets.frameworkTargets);
        frameworkTargets.push(fullPath);
        continue;
      }

      const nestedTargets = collectSignTargets(fullPath);
      binaryTargets.push(...nestedTargets.binaryTargets);
      frameworkTargets.push(...nestedTargets.frameworkTargets);
      continue;
    }

    if (isSignableBinary(fullPath)) {
      binaryTargets.push(fullPath);
    }
  }

  return { binaryTargets, frameworkTargets };
}

function resolveCodesignIdentity() {
  return process.env.FLIGHT_DELAY_MAC_CODESIGN_IDENTITY || process.env.CSC_NAME || '-';
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const backendRoot = path.join(appPath, 'Contents', 'Resources', 'backend');
  if (!fs.existsSync(backendRoot)) {
    throw new Error(`Packaged backend resources were not found at ${backendRoot}`);
  }

  const identity = resolveCodesignIdentity();
  const { binaryTargets, frameworkTargets } = collectSignTargets(backendRoot);
  const baseCodesignArgs = ['--force', '--sign', identity];
  if (identity !== '-') {
    baseCodesignArgs.push('--timestamp');
  }

  for (const target of binaryTargets.sort((left, right) => right.length - left.length)) {
    run('codesign', [...baseCodesignArgs, target]);
  }

  for (const target of frameworkTargets.sort((left, right) => right.length - left.length)) {
    run('codesign', [...baseCodesignArgs, target]);
  }
}
