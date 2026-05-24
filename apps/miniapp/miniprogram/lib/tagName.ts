/**
 * Mirror of `apps/api/src/services/tags.ts#normalizeTagName`.
 *
 * Used by the rename page to predict a merge collision client-side before
 * submitting PATCH /api/tags/:name. Keep in lockstep with the api copy — if
 * the api ever changes its normalisation (e.g., Unicode NFC, dedup spaces),
 * update this and the test.
 */
export function normalizeTagName(input: string): string {
  return input.trim().toLocaleLowerCase();
}
