/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL?: string;
  readonly VITE_RELEASE_UI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
