import { describe, it, expect } from 'vitest';
import { formatFileSize, formatDate } from './format';

describe('formatFileSize', () => {
  it('returns 0 B for zero and negative sizes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-5)).toBe('0 B');
  });

  it('formats byte sizes', () => {
    expect(formatFileSize(1)).toBe('1 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes with the German decimal separator', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1,5 KB');
  });

  it('formats megabytes with one decimal digit', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1,0 MB');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10,0 MB');
  });
});

describe('formatDate', () => {
  it('formats valid Date into DD.MM.YYYY in German locale', () => {
    const date = new Date(2025, 2, 15); // 15 March 2025
    expect(formatDate(date)).toBe('15.03.2025');
  });

  it('returns Unbekanntes Datum for null, undefined, or invalid dates', () => {
    expect(formatDate(null)).toBe('Unbekanntes Datum');
    expect(formatDate(undefined)).toBe('Unbekanntes Datum');
    expect(formatDate(new Date('invalid-date'))).toBe('Unbekanntes Datum');
  });
});

