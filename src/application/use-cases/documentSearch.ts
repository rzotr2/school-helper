import type { Document } from './documents';
import { getDocumentPageText } from './documentContent';

export interface DocumentSearchResult {
  documentId: string;
  documentName: string;
  topicId: string;
  pageNumber: number;
  source: 'native' | 'ocr';
  snippet: string;
  matchIndex?: number;
}

const LOOKALIKE_FOLD_MAP: Record<string, string> = {
  '\u0430': 'a', // Cyrillic а -> Latin a
  '\u0441': 'c', // Cyrillic с -> Latin c
  '\u0435': 'e', // Cyrillic е -> Latin e
  '\u0454': 'e', // Cyrillic є -> Latin e
  '\u0456': 'i', // Cyrillic і -> Latin i
  '\u0457': 'i', // Cyrillic ї -> Latin i
  '\u0458': 'j', // Cyrillic ј -> Latin j
  '\u043e': 'o', // Cyrillic о -> Latin o
  '\u0440': 'p', // Cyrillic р -> Latin p
  '\u0455': 's', // Cyrillic ѕ -> Latin s
  '\u0445': 'x', // Cyrillic х -> Latin x
  '\u0443': 'y', // Cyrillic у -> Latin y
  '\u0442': 't', // Cyrillic т -> Latin t
  '\u043a': 'k', // Cyrillic к -> Latin k
  '\u043c': 'm', // Cyrillic м -> Latin m
  '\u043d': 'n', // Cyrillic н -> Latin n
  '\u0432': 'b', // Cyrillic в -> Latin b
};

/**
 * Normalizes common visually identical Latin and Cyrillic glyphs to a common base.
 * Solves the common OCR issue where multilingual models (e.g. ukr+deu+eng)
 * recognize Ukrainian letters like 'і', 'а', 'о' as Latin 'i', 'a', 'o'.
 */
export function foldLookalikes(str: string): string {
  return str.toLowerCase().replace(/[\u0430\u0441\u0435\u0454\u0456\u0457\u0458\u043e\u0440\u0455\u0445\u0443\u0442\u043a\u043c\u043d\u0432]/gu, (ch) => LOOKALIKE_FOLD_MAP[ch] ?? ch);
}

/**
 * Computes Levenshtein distance between two strings with early exit for large differences.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  if (Math.abs(aLen - bLen) > 3) return 999;

  let prevRow = Array.from({ length: bLen + 1 }, (_, i) => i);
  const currRow = new Array<number>(bLen + 1);

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    const aChar = a[i - 1];
    for (let j = 1; j <= bLen; j++) {
      const cost = aChar === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost,
      );
    }
    for (let k = 0; k <= bLen; k++) {
      prevRow[k] = currRow[k];
    }
  }
  return prevRow[bLen];
}

/**
 * Cleans soft hyphens, zero-width characters, and unifies hyphenated word wraps.
 */
export function cleanSearchText(text: string): string {
  return text
    .replace(/[\u00AD\u200B]/g, '')
    .replace(/(\p{L})-\s*[\r\n]+\s*(\p{L})/gu, '$1$2');
}

/**
 * Finds the starting index and matched character length of query in text.
 * Returns null if no match is found.
 */
export function findMatchIndex(text: string, query: string): { index: number; length: number } | null {
  const trimmed = query.trim();
  if (!trimmed || !text) return null;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();

  // 1. Direct exact match
  const directIndex = lowerText.indexOf(lowerQuery);
  if (directIndex !== -1) {
    return { index: directIndex, length: trimmed.length };
  }

  // 2. Homoglyph-folded representations (Latin / Cyrillic lookalikes)
  const foldedText = foldLookalikes(lowerText);
  const foldedQuery = foldLookalikes(lowerQuery);

  const foldedIndex = foldedText.indexOf(foldedQuery);
  if (foldedIndex !== -1) {
    return { index: foldedIndex, length: trimmed.length };
  }

  // 3. Tolerant token match for OCR noise (e.g. "анотація" vs Tesseract OCR "анотаціхія")
  // Only for queries of sufficient length (>= 4 chars) to avoid false positives on short words.
  const queryWords = foldedQuery.split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return null;

  if (queryWords.length === 1) {
    const qWord = queryWords[0];
    const qLen = qWord.length;
    if (qLen < 4) return null;
    const maxDist = qLen >= 7 ? 2 : 1;

    const tokenRegex = /[^\s,.:;!?"'()\[\]{}«»„“”\n\r\t]+/gu;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      const rawToken = match[0];
      const foldedToken = foldLookalikes(rawToken.toLowerCase());
      if (Math.abs(foldedToken.length - qLen) <= maxDist) {
        if (levenshteinDistance(foldedToken, qWord) <= maxDist) {
          return { index: match.index, length: rawToken.length };
        }
      }
    }
  } else {
    // Multi-word query: match if first query word is found with tolerance
    const firstWord = queryWords[0];
    const firstLen = firstWord.length;
    const maxDist = firstLen >= 7 ? 2 : 1;
    const tokenRegex = /[^\s,.:;!?"'()\[\]{}«»„“”\n\r\t]+/gu;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      const rawToken = match[0];
      const foldedToken = foldLookalikes(rawToken.toLowerCase());
      if (Math.abs(foldedToken.length - firstLen) <= maxDist) {
        if (levenshteinDistance(foldedToken, firstWord) <= maxDist) {
          return { index: match.index, length: rawToken.length };
        }
      }
    }
  }

  return null;
}

/**
 * Normalizes text and generates a readable snippet around the first match.
 * Collapses whitespace, extracts surrounding context, and adds ellipses
 * when text is truncated. Snaps to word boundaries when feasible.
 */
export function generateSnippet(
  text: string,
  query: string,
  contextChars: number = 40,
): string {
  const cleaned = cleanSearchText(text);
  const normalizedText = cleaned.replace(/\s+/g, ' ').trim();
  const trimmedQuery = query.trim();
  if (!trimmedQuery || !normalizedText) return '';

  const match = findMatchIndex(normalizedText, trimmedQuery);
  if (!match) return '';

  const index = match.index;
  const matchLength = match.length;

  const rawStart = Math.max(0, index - contextChars);
  const rawEnd = Math.min(normalizedText.length, index + matchLength + contextChars);

  let start = rawStart;
  if (start > 0) {
    // Try to snap forward to the nearest space before the match
    const nextSpace = normalizedText.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace < index) {
      start = nextSpace + 1;
    }
  }

  let end = rawEnd;
  if (end < normalizedText.length) {
    // Try to snap backward to the nearest space after the match
    const matchEnd = index + matchLength;
    const prevSpace = normalizedText.lastIndexOf(' ', end);
    if (prevSpace !== -1 && prevSpace > matchEnd) {
      end = prevSpace;
    }
  }

  const snippetPart = normalizedText.slice(start, end).trim();
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedText.length ? '...' : '';

  return `${prefix}${snippetPart}${suffix}`;
}

/**
 * Searches a collection of documents for the given query.
 *
 * Rules:
 * - Only documents with `processingStatus === 'completed'` and non-null `content` are searched.
 * - Empty or whitespace-only queries return an empty array `[]`.
 * - Per-page text is retrieved via `getDocumentPageText`.
 * - `nativeText` and `ocrText` are searched independently.
 * - If a query matches both native and OCR text on the same page, exactly ONE
 *   result is returned for that page (with source `'native'`).
 * - Multiple matching pages produce separate results.
 * - Document content is never mutated.
 */
export function searchDocuments(
  documents: readonly Document[],
  query: string,
): DocumentSearchResult[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const results: DocumentSearchResult[] = [];

  for (const doc of documents) {
    if (doc.processingStatus !== 'completed' || doc.content === null) {
      continue;
    }

    for (const page of doc.content.pages) {
      const pageText = getDocumentPageText(doc.content, page.pageNumber);
      if (!pageText) continue;

      const cleanedNative = cleanSearchText(pageText.nativeText);
      const nativeMatch = findMatchIndex(cleanedNative, trimmedQuery);
      if (nativeMatch !== null) {
        results.push({
          documentId: doc.id,
          documentName: doc.originalName,
          topicId: doc.topicId,
          pageNumber: page.pageNumber,
          source: 'native',
          snippet: generateSnippet(pageText.nativeText, trimmedQuery),
          matchIndex: nativeMatch.index,
        });
        // Deduplicated: one result per page (native takes precedence)
        continue;
      }

      if (pageText.ocrText !== null) {
        const cleanedOcr = cleanSearchText(pageText.ocrText);
        const ocrMatch = findMatchIndex(cleanedOcr, trimmedQuery);
        if (ocrMatch !== null) {
          results.push({
            documentId: doc.id,
            documentName: doc.originalName,
            topicId: doc.topicId,
            pageNumber: page.pageNumber,
            source: 'ocr',
            snippet: generateSnippet(pageText.ocrText, trimmedQuery),
            matchIndex: ocrMatch.index,
          });
        }
      }
    }
  }

  return results;
}
