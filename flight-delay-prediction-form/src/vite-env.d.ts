/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_LOCAL_RESULT_ASSISTANT_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
