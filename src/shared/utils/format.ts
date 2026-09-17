/**
 * Formats a byte size for display (B / KB / MB, German locale).
 * Document uploads are capped at 10 MB, so no GB tier is needed.
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 });
    return `${kb} KB`;
  }
  const mb = (bytes / (1024 * 1024)).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${mb} MB`;
}

/**
 * Formats a Date object into 'DD.MM.YYYY' (German locale).
 * Returns 'Unbekanntes Datum' for null, undefined, or invalid dates.
 */
export function formatDate(val: Date | null | undefined): string {
  if (!val || !(val instanceof Date) || Number.isNaN(val.getTime())) {
    return 'Unbekanntes Datum';
  }
  return val.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

