import { useSyncExternalStore } from 'react';

export type RuntimeTarget = 'web' | 'desktop';
export type DesktopBackendState = 'starting' | 'healthy' | 'restarting' | 'failed';

export interface DesktopBackendStatus {
  readonly state: DesktopBackendState;
  readonly apiBaseUrl: string | null;
  readonly lastError: string | null;
  readonly isRestarting: boolean;
  readonly hasEverBeenHealthy: boolean;
}

interface DesktopRuntimeConfig {
  readonly runtimeTarget: 'desktop';
  readonly apiBaseUrl: string | null;
  readonly backendStartupError: string | null;
  readonly backendStatus: DesktopBackendStatus;
  readonly getBackendStatus?: () => DesktopBackendStatus;
  readonly subscribeBackendStatus?: (
    callback: (status: DesktopBackendStatus) => void,
  ) => (() => void);
  readonly ensureBackendReady?: () => Promise<DesktopBackendStatus>;
}

export interface RuntimeConfig {
  readonly runtimeTarget: RuntimeTarget;
  readonly apiBaseUrl: string | undefined;
  readonly backendStartupError: string | null;
  readonly backendStatus: DesktopBackendStatus | null;
  readonly ensureBackendReady: (() => Promise<DesktopBackendStatus>) | null;
}

export interface DesktopRuntimeMessage {
  readonly summary: string;
  readonly details: string | null;
  readonly tone: 'info' | 'warning' | 'error';
}

let cachedRuntimeConfig: RuntimeConfig | null = null;
let cachedRuntimeSignature: string | null = null;

const normalizeBaseUrl = (value?: string | null) => {
  if (!value) return undefined;
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeBackendStatus = (value?: Partial<DesktopBackendStatus> | null): DesktopBackendStatus => ({
  state: value?.state ?? 'starting',
  apiBaseUrl: value?.apiBaseUrl ?? null,
  lastError: value?.lastError ?? null,
  isRestarting: Boolean(value?.isRestarting),
  hasEverBeenHealthy: Boolean(value?.hasEverBeenHealthy),
});

const readDesktopRuntimeConfig = (): DesktopRuntimeConfig | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidate = window.flightDelayDesktop;
  if (!candidate || candidate.runtimeTarget !== 'desktop') {
    return null;
  }

  const backendStatus = normalizeBackendStatus(
    typeof candidate.getBackendStatus === 'function'
      ? candidate.getBackendStatus()
      : candidate.backendStatus,
  );

  return {
    runtimeTarget: 'desktop',
    apiBaseUrl: candidate.apiBaseUrl ?? backendStatus.apiBaseUrl ?? null,
    backendStartupError: candidate.backendStartupError ?? null,
    backendStatus,
    getBackendStatus: candidate.getBackendStatus,
    subscribeBackendStatus: candidate.subscribeBackendStatus,
    ensureBackendReady: candidate.ensureBackendReady,
  };
};

const deriveBackendStartupError = (
  desktopRuntime: DesktopRuntimeConfig | null,
  backendStatus: DesktopBackendStatus | null,
) => {
  if (backendStatus?.state === 'failed' && !backendStatus.hasEverBeenHealthy) {
    return backendStatus.lastError;
  }

  return desktopRuntime?.backendStartupError ?? null;
};

export const getRuntimeConfig = (): RuntimeConfig => {
  const desktopRuntime = readDesktopRuntimeConfig();
  const backendStatus = desktopRuntime?.backendStatus ?? null;
  const runtimeTarget: RuntimeTarget = desktopRuntime?.runtimeTarget ?? 'web';
  const apiBaseUrl = normalizeBaseUrl(
    backendStatus?.apiBaseUrl ?? desktopRuntime?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL,
  );
  const backendStartupError = deriveBackendStartupError(desktopRuntime, backendStatus);
  const ensureBackendReady = desktopRuntime?.ensureBackendReady ?? null;
  const runtimeSignature = JSON.stringify({
    runtimeTarget,
    apiBaseUrl,
    backendStartupError,
    backendStatus,
  });

  if (
    cachedRuntimeConfig
    && cachedRuntimeSignature === runtimeSignature
    && cachedRuntimeConfig.ensureBackendReady === ensureBackendReady
  ) {
    return cachedRuntimeConfig;
  }

  cachedRuntimeSignature = runtimeSignature;
  cachedRuntimeConfig = {
    runtimeTarget,
    apiBaseUrl,
    backendStartupError,
    backendStatus,
    ensureBackendReady,
  };

  return cachedRuntimeConfig;
};

const subscribeToRuntimeConfig = (onStoreChange: () => void) => {
  const desktopRuntime = readDesktopRuntimeConfig();
  if (!desktopRuntime?.subscribeBackendStatus) {
    return () => {};
  }

  return desktopRuntime.subscribeBackendStatus(() => {
    onStoreChange();
  });
};

export const useRuntimeConfig = (): RuntimeConfig => useSyncExternalStore(
  subscribeToRuntimeConfig,
  getRuntimeConfig,
  getRuntimeConfig,
);

export const isDesktopRuntime = (): boolean => getRuntimeConfig().runtimeTarget === 'desktop';

export const shouldShowDesktopStartupIssue = (runtimeConfig: RuntimeConfig): boolean => (
  runtimeConfig.runtimeTarget === 'desktop'
  && Boolean(runtimeConfig.backendStatus?.state === 'failed' && !runtimeConfig.backendStatus.hasEverBeenHealthy)
);

export const ensureDesktopBackendReady = async (): Promise<DesktopBackendStatus | null> => {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.runtimeTarget !== 'desktop') {
    return null;
  }

  if (runtimeConfig.ensureBackendReady) {
    return runtimeConfig.ensureBackendReady();
  }

  if (runtimeConfig.backendStatus?.state === 'healthy') {
    return runtimeConfig.backendStatus;
  }

  throw new Error(
    runtimeConfig.backendStatus?.lastError
      ?? runtimeConfig.backendStartupError
      ?? 'The local desktop prediction service is unavailable.',
  );
};

export const describeDesktopRuntimeMessage = (
  runtimeConfig: RuntimeConfig,
  fallbackDetails?: string | null,
): DesktopRuntimeMessage => {
  const status = runtimeConfig.backendStatus;
  const details = fallbackDetails ?? status?.lastError ?? runtimeConfig.backendStartupError ?? null;

  if (!status) {
    return {
      summary: 'The packaged app could not determine its local prediction service.',
      details,
      tone: 'error',
    };
  }

  switch (status.state) {
    case 'starting':
      return {
        summary: 'The local prediction service is starting. Prediction will be available as soon as startup finishes.',
        details,
        tone: 'info',
      };
    case 'restarting':
      return {
        summary: 'The local prediction service is restarting. You can retry once the reconnection finishes.',
        details,
        tone: 'warning',
      };
    case 'failed':
      return {
        summary: status.hasEverBeenHealthy
          ? 'The local prediction service is unavailable right now. Predict again to trigger another recovery attempt.'
          : 'The local prediction service did not start.',
        details,
        tone: 'error',
      };
    case 'healthy':
    default:
      return {
        summary: 'The local prediction service reported an error.',
        details,
        tone: 'error',
      };
  }
};
