/**
 * Central "content version" counter. Bumped whenever a data-mutating service
 * call succeeds (create/edit/delete/favorite). Tab pages remember the version
 * they last loaded and skip the redundant onShow refetch when nothing changed —
 * which avoids the visible flicker caused by re-signed (and thus re-loading)
 * thumbnail URLs on every list fetch.
 */
let contentVersion = 0;

export function getContentVersion(): number {
  return contentVersion;
}

export function bumpContentVersion(): void {
  contentVersion += 1;
}
