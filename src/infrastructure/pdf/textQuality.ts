import type { TextQuality } from './types';

/**
 * Conservative thresholds for deciding whether an extracted text layer is
 * usable without OCR. They err on the side of OCR: a page with borderline
 * text is OCR'd rather than kept, because a silently broken text layer is
 * worse than a redundant OCR pass.
 *
 * Accepted trade-offs of this deterministic heuristic (no AI classifier):
 * - A page with a single word (e.g. a title page) is OCR'd: at least 2
 *   words are required, because a lone word cannot be distinguished from
 *   broken fragments.
 * - Text that is mostly letters and digits but has no visible structure
 *   ("||| l l l |||") passes. Distinguishing that from short labels is not
 *   possible deterministically, and keeping it loses nothing.
 * - Text that is mostly mathematical symbols (a formula sheet) passes when
 *   it is otherwise well-formed: symbols are printable characters, and a
 *   low alphanumeric ratio is recorded as a diagnostic but does not block.
 *   Only strong corruption evidence (replacement characters, non-printable
 *   content) forces OCR, because OCR would misread the symbols the native
 *   layer already contains.
 */
export const TEXT_QUALITY_THRESHOLDS = {
  /** Minimum number of characters in the trimmed text. */
  minCharCount: 5,
  /** Minimum number of whitespace-separated tokens containing a letter or digit. */
  minWordCount: 2,
  /** Minimum ratio of printable characters. */
  minPrintableRatio: 0.7,
  /** Maximum ratio of whitespace characters. */
  maxWhitespaceRatio: 0.6,
  /** Minimum ratio of letters and digits. */
  minAlphanumericRatio: 0.4,
  /** Maximum ratio of U+FFFD replacement characters (corrupted encoding). */
  maxReplacementCharRatio: 0.05,
} as const;

const PRINTABLE_CHAR = /[\p{L}\p{N}\p{P}\p{S}\s]/u;
const WHITESPACE_CHAR = /\s/u;
const ALPHANUMERIC_CHAR = /[\p{L}\p{N}]/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;

function isPrintableChar(char: string): boolean {
  if (char === '\uFFFD') return false;
  const code = char.charCodeAt(0);
  // C0 control characters other than the common whitespace ones, and DEL.
  if ((code < 0x20 && char !== '\t' && char !== '\n' && char !== '\r') || code === 0x7f) {
    return false;
  }
  return PRINTABLE_CHAR.test(char);
}

function countChars(chars: readonly string[], predicate: (char: string) => boolean): number {
  let count = 0;
  for (const char of chars) {
    if (predicate(char)) count++;
  }
  return count;
}

function round(ratio: number): number {
  return Math.round(ratio * 1000) / 1000;
}

/**
 * Deterministic evaluation of extracted text. Pure function: the same text
 * always yields the same result.
 */
export function evaluateTextQuality(text: string): TextQuality {
  // Spread by code points so astral characters count as one char each.
  const chars = [...text.trim()];
  const charCount = chars.length;

  const printableCount = countChars(chars, isPrintableChar);
  const whitespaceCount = countChars(chars, (char) => WHITESPACE_CHAR.test(char));
  const alphanumericCount = countChars(chars, (char) => ALPHANUMERIC_CHAR.test(char));
  const replacementCharCount = countChars(chars, (char) => char === '\uFFFD');
  const wordCount = text
    .trim()
    .split(WHITESPACE_CHAR)
    .filter((token) => WORD_CHAR.test(token)).length;

  const quality: TextQuality = {
    usable: true,
    charCount,
    printableRatio: charCount === 0 ? 0 : round(printableCount / charCount),
    whitespaceRatio: charCount === 0 ? 0 : round(whitespaceCount / charCount),
    alphanumericRatio: charCount === 0 ? 0 : round(alphanumericCount / charCount),
    wordCount,
    replacementCharCount,
    reasons: [],
  };

  // Hard blockers: strong evidence that the text layer is missing or
  // corrupted. Only these make the text unusable — the quality describes
  // the native representation and never decides whether OCR runs.
  const blockers: string[] = [];

  if (charCount === 0) {
    blockers.push('No text');
  } else {
    if (charCount < TEXT_QUALITY_THRESHOLDS.minCharCount) {
      blockers.push('Too little text');
    }
    if (replacementCharCount / charCount > TEXT_QUALITY_THRESHOLDS.maxReplacementCharRatio) {
      blockers.push('Corrupted encoding (replacement characters)');
    }
    if (quality.printableRatio < TEXT_QUALITY_THRESHOLDS.minPrintableRatio) {
      blockers.push('Mostly non-printable characters');
    }
    if (quality.whitespaceRatio > TEXT_QUALITY_THRESHOLDS.maxWhitespaceRatio) {
      blockers.push('Mostly whitespace');
    }
    // Diagnostic only: symbol-heavy text (e.g. a formula sheet) is
    // well-formed, not corrupted, and OCR would misread the symbols.
    if (quality.alphanumericRatio < TEXT_QUALITY_THRESHOLDS.minAlphanumericRatio) {
      quality.reasons.push('Too few alphanumeric characters');
    }
    if (wordCount < TEXT_QUALITY_THRESHOLDS.minWordCount) {
      blockers.push('Too few words');
    }
  }

  quality.reasons.push(...blockers);
  quality.usable = blockers.length === 0;
  return quality;
}
