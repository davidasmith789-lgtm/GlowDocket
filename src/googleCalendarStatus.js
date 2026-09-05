export const GOOGLE_SYNC_STATUS_POLL_MS = 2000;

export function isStaleGoogleSyncInProgressNotice(notice) {
  return /google calendar synchronization is already running for this account/i.test(String(notice || ""));
}

export function reconcileGoogleSyncStatus(result, currentBusy, currentNotice) {
  const syncActive = result?.syncActive === true;
  return {
    busy: syncActive ? "sync" : (currentBusy === "sync" ? "" : currentBusy),
    notice: !syncActive && isStaleGoogleSyncInProgressNotice(currentNotice) ? "" : currentNotice,
  };
}
