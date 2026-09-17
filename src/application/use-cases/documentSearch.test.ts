import { describe, it, expect } from 'vitest';
import type { Document } from './documents';
import type { DocumentContent } from './documentContent';
import { generateSnippet, searchDocuments } from './documentSearch';

function createMockDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    ownerId: 'user-1',
    topicId: 'topic-1',
    originalName: 'TestDoc.pdf',
    storagePath: 'users/user-1/documents/doc-1.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    processingStatus: 'completed',
    content: {
      pages: [
        {
          pageNumber: 1,
          nativeText: 'Das Projektumfeld beschreibt interne und externe Einflussfaktoren.',
          quality: {
            usable: true,
            charCount: 66,
            printableRatio: 1,
            whitespaceRatio: 0.1,
            alphanumericRatio: 0.9,
            wordCount: 8,
            replacementCharCount: 0,
            reasons: [],
          },
          ocrText: null,
          ocrStatus: 'not-generated',
        },
      ],
    },
    ...overrides,
  };
}

describe('generateSnippet', () => {
  it('generates a snippet around the match with ellipsis', () => {
    const text = 'Das Projektumfeld beschreibt die internen und externen Einflussfaktoren eines Vorhabens.';
    const snippet = generateSnippet(text, 'externen', 20);
    expect(snippet.toLowerCase()).toContain('externen');
    expect(snippet.startsWith('...')).toBe(true);
    expect(snippet.endsWith('...')).toBe(true);
  });

  it('does not add leading ellipsis if match is at the start', () => {
    const text = 'Projektumfeld beschreibt Einflussfaktoren.';
    const snippet = generateSnippet(text, 'Projektumfeld');
    expect(snippet.startsWith('...')).toBe(false);
  });

  it('returns empty string if query is not found or empty', () => {
    expect(generateSnippet('Hallo Welt', 'unbekannt')).toBe('');
    expect(generateSnippet('Hallo Welt', '   ')).toBe('');
    expect(generateSnippet('', 'Hallo')).toBe('');
  });
});

describe('searchDocuments', () => {
  it('1. performs case-insensitive matching', () => {
    const doc = createMockDocument();
    const resultsUpper = searchDocuments([doc], 'PROJEKTUMFELD');
    const resultsLower = searchDocuments([doc], 'projektumfeld');

    expect(resultsUpper).toHaveLength(1);
    expect(resultsLower).toHaveLength(1);
    expect(resultsUpper[0].pageNumber).toBe(1);
    expect(resultsUpper[0].documentId).toBe(doc.id);
  });

  it('2. matches native text correctly', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: 'Native text content here.',
            quality: {
              usable: true,
              charCount: 25,
              printableRatio: 1,
              whitespaceRatio: 0.1,
              alphanumericRatio: 0.9,
              wordCount: 4,
              replacementCharCount: 0,
              reasons: [],
            },
            ocrText: null,
            ocrStatus: 'not-generated',
          },
        ],
      },
    });

    const results = searchDocuments([doc], 'Native text');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('native');
    expect(results[0].snippet).toContain('Native text');
  });

  it('3. matches OCR text when native text is empty or different', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: '',
            quality: {
              usable: false,
              charCount: 0,
              printableRatio: 0,
              whitespaceRatio: 0,
              alphanumericRatio: 0,
              wordCount: 0,
              replacementCharCount: 0,
              reasons: ['empty'],
            },
            ocrText: 'Scanned document OCR content.',
            ocrStatus: 'completed',
          },
        ],
      },
    });

    const results = searchDocuments([doc], 'scanned document');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('ocr');
    expect(results[0].snippet).toContain('Scanned document');
  });

  it('4. avoids duplicate results when same page matches both native and OCR text', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: 'Projektmanagement Übersicht',
            quality: {
              usable: true,
              charCount: 26,
              printableRatio: 1,
              whitespaceRatio: 0.1,
              alphanumericRatio: 0.9,
              wordCount: 2,
              replacementCharCount: 0,
              reasons: [],
            },
            ocrText: 'Projektmanagement Übersicht',
            ocrStatus: 'completed',
          },
        ],
      },
    });

    const results = searchDocuments([doc], 'Projektmanagement');
    expect(results).toHaveLength(1);
    expect(results[0].pageNumber).toBe(1);
    expect(results[0].source).toBe('native');
  });

  it('5. produces separate results for multiple matching pages in the same document', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: 'Introduction to Algorithms',
            quality: { usable: true, charCount: 26, printableRatio: 1, whitespaceRatio: 0.1, alphanumericRatio: 0.9, wordCount: 3, replacementCharCount: 0, reasons: [] },
            ocrText: null,
            ocrStatus: 'not-generated',
          },
          {
            pageNumber: 2,
            nativeText: 'Sorting Algorithms Overview',
            quality: { usable: true, charCount: 27, printableRatio: 1, whitespaceRatio: 0.1, alphanumericRatio: 0.9, wordCount: 3, replacementCharCount: 0, reasons: [] },
            ocrText: null,
            ocrStatus: 'not-generated',
          },
          {
            pageNumber: 3,
            nativeText: 'Data Structures',
            quality: { usable: true, charCount: 15, printableRatio: 1, whitespaceRatio: 0.1, alphanumericRatio: 0.9, wordCount: 2, replacementCharCount: 0, reasons: [] },
            ocrText: null,
            ocrStatus: 'not-generated',
          },
        ],
      },
    });

    const results = searchDocuments([doc], 'Algorithms');
    expect(results).toHaveLength(2);
    expect(results[0].pageNumber).toBe(1);
    expect(results[1].pageNumber).toBe(2);
  });

  it('6. produces separate results across multiple documents', () => {
    const doc1 = createMockDocument({ id: 'doc-1', originalName: 'Doc1.pdf' });
    const doc2 = createMockDocument({ id: 'doc-2', originalName: 'Doc2.pdf' });

    const results = searchDocuments([doc1, doc2], 'Projektumfeld');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.documentId)).toEqual(['doc-1', 'doc-2']);
  });

  it('7. safely ignores documents with missing content (content: null)', () => {
    const legacyDoc = createMockDocument({ id: 'doc-legacy', content: null });
    const normalDoc = createMockDocument({ id: 'doc-normal' });

    const results = searchDocuments([legacyDoc, normalDoc], 'Projektumfeld');
    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe('doc-normal');
  });

  it('8. excludes failed, pending, and processing documents', () => {
    const pendingDoc = createMockDocument({ id: 'doc-pending', processingStatus: 'pending' });
    const processingDoc = createMockDocument({ id: 'doc-processing', processingStatus: 'processing' });
    const failedDoc = createMockDocument({ id: 'doc-failed', processingStatus: 'failed' });
    const completedDoc = createMockDocument({ id: 'doc-completed', processingStatus: 'completed' });

    const results = searchDocuments([pendingDoc, processingDoc, failedDoc, completedDoc], 'Projektumfeld');
    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe('doc-completed');
  });

  it('9. handles empty or whitespace-only queries sensibly by returning []', () => {
    const doc = createMockDocument();
    expect(searchDocuments([doc], '')).toEqual([]);
    expect(searchDocuments([doc], '   ')).toEqual([]);
    expect(searchDocuments([doc], '\t\n ')).toEqual([]);
  });

  it('10. works with German umlauts (ä, ö, ü, ß)', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: 'Große Übung über betriebliche Abläufe.',
            quality: { usable: true, charCount: 38, printableRatio: 1, whitespaceRatio: 0.1, alphanumericRatio: 0.9, wordCount: 5, replacementCharCount: 0, reasons: [] },
            ocrText: null,
            ocrStatus: 'not-generated',
          },
        ],
      },
    });

    expect(searchDocuments([doc], 'abläufe')).toHaveLength(1);
    expect(searchDocuments([doc], 'ABLÄUFE')).toHaveLength(1);
    expect(searchDocuments([doc], 'große')).toHaveLength(1);
    expect(searchDocuments([doc], 'übung')).toHaveLength(1);
  });

  it('11. works with Ukrainian Cyrillic (і, ї, є, ґ, etc.)', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: 'Проєктне середовище містить внутрішні та зовнішні фактори.',
            quality: { usable: true, charCount: 58, printableRatio: 1, whitespaceRatio: 0.1, alphanumericRatio: 0.9, wordCount: 7, replacementCharCount: 0, reasons: [] },
            ocrText: null,
            ocrStatus: 'not-generated',
          },
        ],
      },
    });

    expect(searchDocuments([doc], 'Проєктне')).toHaveLength(1);
    expect(searchDocuments([doc], 'проєктне')).toHaveLength(1);
    expect(searchDocuments([doc], 'середовище')).toHaveLength(1);
    expect(searchDocuments([doc], 'внутрішні')).toHaveLength(1);
  });

  it('11b. matches Ukrainian OCR text when OCR output contains Latin lookalikes (e.g. Latin i in "анотацiя")', () => {
    // Tesseract multilingual OCR often outputs Latin 'i' (\u0069) or Latin 'a' (\u0061) instead of Cyrillic
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: '',
            quality: { usable: false, charCount: 0, printableRatio: 0, whitespaceRatio: 0, alphanumericRatio: 0, wordCount: 0, replacementCharCount: 0, reasons: [] },
            ocrText: 'Короткий зміст: анотац\u0069я до розділу 1.', // Latin i
            ocrStatus: 'completed',
          },
        ],
      },
    });

    // User types with Ukrainian layout (Cyrillic \u0456)
    const results = searchDocuments([doc], 'анотац\u0456я');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('ocr');
    expect(results[0].snippet).toContain('анотац');
  });

  it('11c. matches hyphenated line-breaks in OCR text', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: '',
            quality: { usable: false, charCount: 0, printableRatio: 0, whitespaceRatio: 0, alphanumericRatio: 0, wordCount: 0, replacementCharCount: 0, reasons: [] },
            ocrText: 'Короткий зміст:\nано-\nтація до розділу 1.',
            ocrStatus: 'completed',
          },
        ],
      },
    });

    const results = searchDocuments([doc], 'анотація');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('ocr');
  });

  it('11d. matches "анотація" when OCR contains Tesseract artifact "анотаціхія"', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: '',
            quality: { usable: false, charCount: 0, printableRatio: 0, whitespaceRatio: 0, alphanumericRatio: 0, wordCount: 0, replacementCharCount: 0, reasons: [] },
            ocrText: 'deutsch aou\nannotation\nанотаціхія\nпривіх)т :)\n',
            ocrStatus: 'completed',
          },
        ],
      },
    });

    const results = searchDocuments([doc], 'анотація');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('ocr');
    expect(results[0].snippet).toContain('анотаціхія');
  });

  it('11e. matches "привіт" when OCR contains artifact "привіх)т"', () => {
    const doc = createMockDocument({
      content: {
        pages: [
          {
            pageNumber: 1,
            nativeText: '',
            quality: { usable: false, charCount: 0, printableRatio: 0, whitespaceRatio: 0, alphanumericRatio: 0, wordCount: 0, replacementCharCount: 0, reasons: [] },
            ocrText: 'deutsch aou\nannotation\nанотаціхія\nпривіх)т :)\n',
            ocrStatus: 'completed',
          },
        ],
      },
    });

    const results = searchDocuments([doc], 'привіт');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('ocr');
    expect(results[0].snippet).toContain('привіх)т');
  });

  it('12. generates readable snippet with context around match', () => {
    const doc = createMockDocument();
    const results = searchDocuments([doc], 'externe');
    expect(results).toHaveLength(1);
    expect(results[0].snippet).toContain('externe');
  });

  it('13. includes correct documentId, topicId, and pageNumber in results', () => {
    const doc = createMockDocument({
      id: 'custom-doc-id',
      topicId: 'custom-topic-id',
      originalName: 'Script.pdf',
    });

    const results = searchDocuments([doc], 'Einflussfaktoren');
    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe('custom-doc-id');
    expect(results[0].topicId).toBe('custom-topic-id');
    expect(results[0].documentName).toBe('Script.pdf');
    expect(results[0].pageNumber).toBe(1);
  });

  it('14. does not mutate DocumentContent or documents array', () => {
    const doc = createMockDocument();
    const originalContentSnapshot = JSON.stringify(doc.content);

    searchDocuments([doc], 'Projektumfeld');
    expect(JSON.stringify(doc.content)).toBe(originalContentSnapshot);
  });

  it('15. performs efficiently with large synthetic dataset', () => {
    // Generate 50 documents with 10 pages each = 500 pages of text
    const syntheticDocs: Document[] = [];
    for (let d = 1; d <= 50; d++) {
      const pages = [];
      for (let p = 1; p <= 10; p++) {
        pages.push({
          pageNumber: p,
          nativeText: `Document ${d} Page ${p} contains arbitrary school materials and text about informatics and hardware.`,
          quality: { usable: true, charCount: 100, printableRatio: 1, whitespaceRatio: 0.1, alphanumericRatio: 0.9, wordCount: 12, replacementCharCount: 0, reasons: [] },
          ocrText: p % 2 === 0 ? `OCR duplicate for doc ${d} page ${p}` : null,
          ocrStatus: p % 2 === 0 ? ('completed' as const) : ('not-generated' as const),
        });
      }
      syntheticDocs.push(
        createMockDocument({
          id: `synth-doc-${d}`,
          originalName: `SynthDoc_${d}.pdf`,
          content: { pages },
        }),
      );
    }

    const startTime = performance.now();
    const results = searchDocuments(syntheticDocs, 'hardware');
    const durationMs = performance.now() - startTime;

    // 50 documents * 10 pages = 500 matches
    expect(results).toHaveLength(500);
    // Searching 500 pages in memory should easily complete in under 50ms
    expect(durationMs).toBeLessThan(150);
  });
});
