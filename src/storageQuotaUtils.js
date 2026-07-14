export const MAX_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ASSIGNMENT = 10;
export const MAX_ATTACHMENT_BYTES_PER_ASSIGNMENT = 50 * 1024 * 1024;
export const STORAGE_WARNING_RATIO = 0.8;
export const STORAGE_BLOCK_RATIO = 0.95;

export function formatStorageBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function getStorageQuotaStatus(usage = 0, quota = 0) {
  const safeUsage = Math.max(0, Number(usage) || 0);
  const safeQuota = Math.max(0, Number(quota) || 0);
  const ratio = safeQuota > 0 ? safeUsage / safeQuota : 0;
  return {
    usage: safeUsage,
    quota: safeQuota,
    ratio,
    percent: safeQuota > 0 ? Math.min(100, Math.round(ratio * 100)) : 0,
    level: ratio >= STORAGE_BLOCK_RATIO ? "critical" : ratio >= STORAGE_WARNING_RATIO ? "warning" : "ok",
  };
}

export function evaluateAttachmentSelection(currentFiles = [], selectedFiles = [], estimate = {}) {
  const accepted = [];
  const rejected = [];
  let count = currentFiles.length;
  let assignmentBytes = currentFiles.reduce((total, file) => total + (Number(file?.size) || 0), 0);
  let projectedUsage = Math.max(0, Number(estimate.usage) || 0);
  const quota = Math.max(0, Number(estimate.quota) || 0);

  for (const file of selectedFiles) {
    const size = Math.max(0, Number(file?.size) || 0);
    let reason = "";
    if (size > MAX_ATTACHMENT_FILE_BYTES) reason = `${file.name || "A file"} is larger than 10 MB.`;
    else if (count >= MAX_ATTACHMENTS_PER_ASSIGNMENT) reason = `An assignment can have up to ${MAX_ATTACHMENTS_PER_ASSIGNMENT} files.`;
    else if (assignmentBytes + size > MAX_ATTACHMENT_BYTES_PER_ASSIGNMENT) reason = "Attachments for one assignment can use up to 50 MB.";
    else if (quota > 0 && projectedUsage + size > quota * STORAGE_BLOCK_RATIO) reason = "This file would leave browser storage critically full.";

    if (reason) {
      rejected.push({ file, reason });
      continue;
    }
    accepted.push(file);
    count += 1;
    assignmentBytes += size;
    projectedUsage += size;
  }

  const projectedStatus = getStorageQuotaStatus(projectedUsage, quota);
  return { accepted, rejected, assignmentBytes, projectedStatus };
}
