export type RuntimeTarget = 'web' | 'desktop';

export interface DesktopRuntimeConfig {
  readonly runtimeTarget: 'desktop';
  readonly apiBaseUrl: string | null;
  readonly backendStartupError: string | null;
}

const normalizeBaseUrl = (value?: string | null) => {
  if (!value) return undefined;
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const readDesktopRuntimeConfig = (): DesktopRuntimeConfig | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidate = window.flightDelayDesktop;
  if (!candidate || candidate.runtimeTarget !== 'desktop') {
    return null;
  }

  return {
    runtimeTarget: 'desktop',
    apiBaseUrl: candidate.apiBaseUrl ?? null,
    backendStartupError: candidate.backendStartupError ?? null,
  };
};

export const getRuntimeConfig = () => {
  const desktopRuntime = readDesktopRuntimeConfig();
  const runtimeTarget: RuntimeTarget = desktopRuntime?.runtimeTarget ?? 'web';

  return {
    runtimeTarget,
    apiBaseUrl: normalizeBaseUrl(desktopRuntime?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL),
    backendStartupError: desktopRuntime?.backendStartupError ?? null,
  };
};

export const isDesktopRuntime = (): boolean => getRuntimeConfig().runtimeTarget === 'desktop';
