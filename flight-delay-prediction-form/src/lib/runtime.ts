export type RuntimeTarget = 'web' | 'desktop';

export type DesktopStartupCode =
  | 'launch_blocked'
  | 'backend_exited_early'
  | 'backend_unhealthy'
  | 'model_incompatible'
  | 'runtime_config_missing'
  | 'runtime_config_invalid'
  | 'unknown';

export interface DesktopStartupIssue {
  readonly code: DesktopStartupCode;
  readonly title: string;
  readonly message: string;
  readonly technicalSummary: string | null;
  readonly backendExecutablePath: string | null;
  readonly logPath: string | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
}

export interface DesktopRuntimeConfig {
  readonly runtimeTarget: 'desktop';
  readonly apiBaseUrl: string | null;
  readonly backendStartupError: string | null;
  readonly backendStartup: DesktopStartupIssue | null;
}

const normalizeBaseUrl = (value?: string | null) => {
  if (!value) return undefined;
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeDesktopStartupIssue = (candidate: unknown): DesktopStartupIssue | null => {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const issue = candidate as Partial<DesktopStartupIssue>;
  return {
    code: typeof issue.code === 'string' ? issue.code as DesktopStartupCode : 'unknown',
    title: typeof issue.title === 'string' ? issue.title : 'The local prediction service did not start.',
    message: typeof issue.message === 'string' ? issue.message : 'The local prediction service did not start.',
    technicalSummary: typeof issue.technicalSummary === 'string' ? issue.technicalSummary : null,
    backendExecutablePath: typeof issue.backendExecutablePath === 'string' ? issue.backendExecutablePath : null,
    logPath: typeof issue.logPath === 'string' ? issue.logPath : null,
    exitCode: typeof issue.exitCode === 'number' ? issue.exitCode : null,
    signal: typeof issue.signal === 'string' ? issue.signal : null,
  };
};

export const getDesktopStartupErrorMessage = (issue: DesktopStartupIssue | null): string | null => (
  issue?.message ?? null
);

const readDesktopRuntimeConfig = (): DesktopRuntimeConfig | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidate = window.flightDelayDesktop;
  if (!candidate || candidate.runtimeTarget !== 'desktop') {
    return null;
  }

  const backendStartup = normalizeDesktopStartupIssue(candidate.backendStartup);
  const backendStartupError = typeof candidate.backendStartupError === 'string'
    ? candidate.backendStartupError
    : getDesktopStartupErrorMessage(backendStartup);

  return {
    runtimeTarget: 'desktop',
    apiBaseUrl: candidate.apiBaseUrl ?? null,
    backendStartupError,
    backendStartup,
  };
};

export const getRuntimeConfig = () => {
  const desktopRuntime = readDesktopRuntimeConfig();
  const runtimeTarget: RuntimeTarget = desktopRuntime?.runtimeTarget ?? 'web';

  return {
    runtimeTarget,
    apiBaseUrl: normalizeBaseUrl(desktopRuntime?.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL),
    backendStartupError: desktopRuntime?.backendStartupError ?? null,
    backendStartup: desktopRuntime?.backendStartup ?? null,
  };
};

export const isDesktopRuntime = (): boolean => getRuntimeConfig().runtimeTarget === 'desktop';
