const test = require('node:test');
const assert = require('node:assert/strict');

const { focusWindow, getRecoveryStatus } = require('./runtimeHelpers');

test('focusWindow restores, shows, and focuses an existing window', () => {
  const calls = [];
  const windowRef = {
    isMinimized: () => true,
    isVisible: () => false,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };

  const handled = focusWindow(windowRef);

  assert.equal(handled, true);
  assert.deepEqual(calls, ['restore', 'show', 'focus']);
});

test('getRecoveryStatus transitions to restarting while retries remain', () => {
  const status = getRecoveryStatus({
    attempt: 0,
    maxAttempts: 3,
    apiBaseUrl: 'http://127.0.0.1:8123',
    lastError: 'Backend exited unexpectedly.',
    hasEverBeenHealthy: true,
  });

  assert.equal(status.state, 'restarting');
  assert.equal(status.isRestarting, true);
  assert.equal(status.lastError, 'Backend exited unexpectedly.');
});

test('getRecoveryStatus transitions to failed after retry exhaustion', () => {
  const status = getRecoveryStatus({
    attempt: 3,
    maxAttempts: 3,
    apiBaseUrl: 'http://127.0.0.1:8123',
    lastError: 'Backend could not recover.',
    hasEverBeenHealthy: true,
  });

  assert.equal(status.state, 'failed');
  assert.equal(status.isRestarting, false);
  assert.equal(status.lastError, 'Backend could not recover.');
});
