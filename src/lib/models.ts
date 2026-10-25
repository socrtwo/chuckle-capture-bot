/**
 * Face-api model resources. Shared by the app (JokeApp.tsx) and the service
 * worker precache manifest (vite.config.ts) so both stay in sync.
 */
export const MODEL_BASE_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';

export const MODEL_NAMES = [
  'tiny_face_detector_model',
  'face_landmark_68_model',
  'face_expression_model',
] as const;

/** Files face-api fetches for each model: the weights manifest plus its shard. */
export const MODEL_FILES = MODEL_NAMES.flatMap((name) => [
  `${name}-weights_manifest.json`,
  `${name}.bin`,
]);

export const MODEL_URLS = MODEL_FILES.map((file) => `${MODEL_BASE_URL}/${file}`);
