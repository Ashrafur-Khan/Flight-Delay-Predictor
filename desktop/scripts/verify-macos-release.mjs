import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status ?? 1}`);
  }
}

function resolveAppPath(candidatePath) {
  if (candidatePath) {
    return path.resolve(candidatePath);
  }

  const installersDir = path.resolve('desktop/dist/installers/mac-arm64');
  const candidates = fs.readdirSync(installersDir).filter((entry) => entry.endsWith('.app'));
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one .app bundle in ${installersDir}, found ${candidates.length}.`);
  }
  return path.join(installersDir, candidates[0]);
}

function resolveDmgPath(appPath) {
  const installersDir = path.resolve(path.dirname(path.dirname(appPath)));
  const candidates = fs.readdirSync(installersDir)
    .filter((entry) => entry.endsWith('.dmg'))
    .filter((entry) => !entry.endsWith('.dmg.blockmap'));

  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one DMG in ${installersDir}, found ${candidates.length}.`);
  }

  return path.join(installersDir, candidates[0]);
}

function hasNotarizationCredentials() {
  return Boolean(
    process.env.APPLE_ID
    && process.env.APPLE_APP_SPECIFIC_PASSWORD
    && process.env.APPLE_TEAM_ID,
  );
}

function notarizeDmg(dmgPath) {
  run('xcrun', [
    'notarytool',
    'submit',
    dmgPath,
    '--wait',
    '--apple-id',
    process.env.APPLE_ID,
    '--password',
    process.env.APPLE_APP_SPECIFIC_PASSWORD,
    '--team-id',
    process.env.APPLE_TEAM_ID,
  ]);
  run('xcrun', ['stapler', 'staple', dmgPath]);
}

function main() {
  if (process.platform !== 'darwin') {
    return;
  }

  const appPath = resolveAppPath(process.argv[2]);

  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);

  if (process.env.FLIGHT_DELAY_MAC_DISTRIBUTION === '1') {
    run('spctl', ['-a', '-t', 'exec', '-vv', appPath]);

    if (!hasNotarizationCredentials()) {
      throw new Error(
        'Distribution macOS builds require APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID for notarization.',
      );
    }

    notarizeDmg(resolveDmgPath(appPath));
    run('xcrun', ['stapler', 'staple', appPath]);
  } else {
    console.info('Skipping Gatekeeper and notarization checks for local ad-hoc macOS build.');
  }
}

main();
