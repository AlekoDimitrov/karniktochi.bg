// Where product photo URLs start. In `astro dev` the local R2 simulation is served at /dev-media
// (src/dev/media-route.ts, injected only in dev); everywhere else MEDIA_BASE_URL, the bucket's own domain,
// so customers' photo requests never reach the Worker (DECISIONS, 2026-10-29).

export const DEV_MEDIA_BASE = '/dev-media';

export const mediaBase = (env: { MEDIA_BASE_URL: string }) => (import.meta.env.DEV ? DEV_MEDIA_BASE : env.MEDIA_BASE_URL);
