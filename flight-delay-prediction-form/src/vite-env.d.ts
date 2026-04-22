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
    readonly backendStatus: {
      readonly state: 'starting' | 'healthy' | 'restarting' | 'failed';
      readonly apiBaseUrl: string | null;
      readonly lastError: string | null;
      readonly isRestarting: boolean;
      readonly hasEverBeenHealthy: boolean;
    };
    readonly getBackendStatus?: () => {
      readonly state: 'starting' | 'healthy' | 'restarting' | 'failed';
      readonly apiBaseUrl: string | null;
      readonly lastError: string | null;
      readonly isRestarting: boolean;
      readonly hasEverBeenHealthy: boolean;
    };
    readonly subscribeBackendStatus?: (
      callback: (status: {
        readonly state: 'starting' | 'healthy' | 'restarting' | 'failed';
        readonly apiBaseUrl: string | null;
        readonly lastError: string | null;
        readonly isRestarting: boolean;
        readonly hasEverBeenHealthy: boolean;
      }) => void,
    ) => (() => void);
    readonly ensureBackendReady?: () => Promise<{
      readonly state: 'starting' | 'healthy' | 'restarting' | 'failed';
      readonly apiBaseUrl: string | null;
      readonly lastError: string | null;
      readonly isRestarting: boolean;
      readonly hasEverBeenHealthy: boolean;
    }>;
  };
}
