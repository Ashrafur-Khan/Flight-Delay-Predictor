/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_RELEASE_UI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  flightDelayDesktop?: {
    readonly runtimeTarget: 'desktop';
    readonly apiBaseUrl: string | null;
    readonly backendStartupError: string | null;
    readonly backendStartup: {
      readonly code: string;
      readonly title: string;
      readonly message: string;
      readonly technicalSummary: string | null;
      readonly backendExecutablePath: string | null;
      readonly logPath: string | null;
      readonly exitCode: number | null;
      readonly signal: string | null;
    } | null;
  };
}
