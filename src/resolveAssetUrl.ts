/**
 * The URL of an aircraft asset. A path relative to the app is served from its
 * base URL; a mod's asset is already resolved against the mod's own base URL,
 * as an absolute path or URL, and stays as it is.
 */
export function resolveAssetUrl(path: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(path)) return path;
  const base = (import.meta.env?.BASE_URL ?? "/") as string;
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}
