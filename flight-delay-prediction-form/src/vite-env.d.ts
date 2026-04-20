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
  };
}
