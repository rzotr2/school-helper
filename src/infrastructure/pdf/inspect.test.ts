import { describe, it, expect } from 'vitest';
import { deriveExtractionMethod } from './inspect';

describe('deriveExtractionMethod', () => {
  it('returns native-text when no page needed OCR', () => {
    expect(deriveExtractionMethod([])).toBe('native-text');
    expect(deriveExtractionMethod(['native-text'])).toBe('native-text');
    expect(deriveExtractionMethod(['native-text', 'native-text'])).toBe('native-text');
  });

  it('returns ocr when every page was OCRed', () => {
    expect(deriveExtractionMethod(['ocr'])).toBe('ocr');
    expect(deriveExtractionMethod(['ocr', 'ocr'])).toBe('ocr');
  });

  it('returns mixed when methods differ across pages', () => {
    expect(deriveExtractionMethod(['native-text', 'ocr'])).toBe('mixed');
    expect(deriveExtractionMethod(['ocr', 'native-text'])).toBe('mixed');
  });
});
