import { describe, it, expect } from 'vitest';
import { TEXT_QUALITY_THRESHOLDS, evaluateTextQuality } from './textQuality';

describe('evaluateTextQuality', () => {
  it('marks empty text as unusable', () => {
    const quality = evaluateTextQuality('');
    expect(quality.usable).toBe(false);
    expect(quality.reasons).toEqual(['No text']);
    expect(quality.charCount).toBe(0);
    expect(quality.wordCount).toBe(0);
  });

  it('treats whitespace-only text as empty', () => {
    const quality = evaluateTextQuality(' \n\t  ');
    expect(quality.usable).toBe(false);
    expect(quality.reasons).toEqual(['No text']);
  });

  it('accepts short but valid text', () => {
    const quality = evaluateTextQuality('Hi du');
    expect(quality.usable).toBe(true);
    expect(quality.reasons).toEqual([]);
    expect(quality.charCount).toBe(5);
    expect(quality.wordCount).toBe(2);
  });

  it('accepts normal German text', () => {
    const quality = evaluateTextQuality(
      'Das ist ein Testdokument mit vielen Wörtern für die Schule. Es enthält Umlaute und ß.',
    );
    expect(quality.usable).toBe(true);
  });

  it('accepts normal English text', () => {
    const quality = evaluateTextQuality(
      'This is a normal English sentence with plenty of words and punctuation marks, for good measure.',
    );
    expect(quality.usable).toBe(true);
  });

  it('rejects mostly-whitespace text', () => {
    // Interior whitespace, so trimming cannot hide it.
    const quality = evaluateTextQuality('x   y   z');
    expect(quality.usable).toBe(false);
    expect(quality.reasons).toContain('Mostly whitespace');
    expect(quality.whitespaceRatio).toBeGreaterThan(TEXT_QUALITY_THRESHOLDS.maxWhitespaceRatio);
  });

  it('rejects text with mostly non-printable characters', () => {
    const quality = evaluateTextQuality('ab\u0001\u0002\u0003cd');
    expect(quality.usable).toBe(false);
    expect(quality.reasons).toContain('Mostly non-printable characters');
  });

  it('rejects text with corrupted encoding', () => {
    const quality = evaluateTextQuality('\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD hello world');
    expect(quality.usable).toBe(false);
    expect(quality.reasons).toContain('Corrupted encoding (replacement characters)');
    expect(quality.replacementCharCount).toBe(5);
  });

  it('rejects OCR-like noise without letters or digits', () => {
    const quality = evaluateTextQuality('|/\\|)(^%$#@!');
    expect(quality.usable).toBe(false);
    expect(quality.reasons).toContain('Too few alphanumeric characters');
    expect(quality.alphanumericRatio).toBe(0);
  });

  it('rejects text below the minimum length', () => {
    const quality = evaluateTextQuality('AB');
    expect(quality.usable).toBe(false);
    expect(quality.reasons).toContain('Too little text');
  });

  it('conservatively rejects single-word text (e.g. title pages)', () => {
    const quality = evaluateTextQuality('Inhaltsverzeichnis');
    expect(quality.usable).toBe(false);
    expect(quality.reasons).toContain('Too few words');
    expect(quality.charCount).toBe(18);
  });

  it('reports exact metrics for a known string', () => {
    const quality = evaluateTextQuality('AB cd!');
    expect(quality.charCount).toBe(6);
    expect(quality.printableRatio).toBe(1);
    expect(quality.whitespaceRatio).toBeCloseTo(1 / 6);
    expect(quality.alphanumericRatio).toBeCloseTo(4 / 6);
    expect(quality.wordCount).toBe(2);
    expect(quality.replacementCharCount).toBe(0);
  });
});
