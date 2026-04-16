const releaseUiOverride = import.meta.env.VITE_RELEASE_UI;

export const isReleaseUi =
  releaseUiOverride === 'true'
  || (releaseUiOverride !== 'false' && import.meta.env.PROD);
