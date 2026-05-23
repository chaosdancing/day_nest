/**
 * HTTP helpers shared across service modules.
 *
 * Underscore prefix marks this as internal to the services folder — page
 * code should import named services (collectionsService, etc.), never this.
 */

/**
 * Build a query string from a flat params object, skipping `undefined`,
 * `null`, and empty-string values. Returns `""` when no params survive.
 */
export function qs(
  params: Record<string, string | number | undefined | null>,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Throw if `statusCode` is outside 2xx. The thrown message intentionally
 * strips the query string from `url` to avoid leaking user-typed search
 * terms / locations through future log shipping.
 */
export function ensureOk(
  method: string,
  url: string,
  statusCode: number,
  body: unknown,
): void {
  if (statusCode >= 200 && statusCode < 300) return;
  const pathOnly = url.split('?')[0] ?? url;
  const code =
    (body as { error?: { code?: string } })?.error?.code ?? `HTTP_${statusCode}`;
  throw new Error(`${method} ${pathOnly} -> ${statusCode} ${code}`);
}
