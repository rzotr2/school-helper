import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pagesHaveUsableText } from './types';
import type { PdfInspectionProgress, PdfPageInspection, TextQuality } from './types';

// The OCR engine is mocked (see the describe below): these tests prove the
// orchestration decision — that automatic inspection hands EVERY page to
// OCR regardless of the native text quality. The real OCR pipeline is
// covered by the opt-in integration suite (PDF_VERIFY=1).
vi.mock('./ocr', () => ({
  ocrPdfPages: vi.fn(
    async (
      _doc: unknown,
      pageNumbers: readonly number[],
      options?: { onProgress?: (currentPage: number, ocrPageCount: number) => void },
    ) => {
      // Emulates the real run's progress: one event per page, in order.
      for (const pageNumber of pageNumbers) {
        options?.onProgress?.(pageNumber, pageNumbers.length);
      }
      return {
        textByPage: new Map(
          pageNumbers.map((pageNumber) => [pageNumber, { pageNumber, text: `OCR ${pageNumber}` }]),
        ),
        failedPages: new Set<number>(),
      };
    },
  ),
}));

import { inspectPdfDocument } from './inspect';
import { ocrPdfPages } from './ocr';

const usableQuality: TextQuality = {
  usable: true,
  charCount: 5,
  printableRatio: 1,
  whitespaceRatio: 0,
  alphanumericRatio: 1,
  wordCount: 1,
  replacementCharCount: 0,
  reasons: [],
};

function page(overrides: Partial<PdfPageInspection> = {}): PdfPageInspection {
  return {
    pageNumber: 1,
    nativeText: 'Hallo',
    quality: usableQuality,
    ocrText: null,
    ocrStatus: 'not-needed',
    ...overrides,
  };
}

describe('pagesHaveUsableText', () => {
  it('is true when a page has usable native text', () => {
    expect(pagesHaveUsableText([page()])).toBe(true);
  });

  it('is true when a page with unusable native text has completed OCR', () => {
    expect(
      pagesHaveUsableText([
        page({ quality: { ...usableQuality, usable: false }, ocrStatus: 'completed', ocrText: 'OCR' }),
      ]),
    ).toBe(true);
  });

  it('is false when unusable native text has only pending or failed OCR', () => {
    const unusable = { ...usableQuality, usable: false };
    expect(pagesHaveUsableText([page({ quality: unusable })])).toBe(false);
    expect(pagesHaveUsableText([page({ quality: unusable, ocrStatus: 'pending' })])).toBe(false);
    expect(pagesHaveUsableText([page({ quality: unusable, ocrStatus: 'failed' })])).toBe(false);
  });

  it('is false for an empty document', () => {
    expect(pagesHaveUsableText([])).toBe(false);
  });

  it('mixes pages across the document', () => {
    expect(
      pagesHaveUsableText([
        page({ quality: { ...usableQuality, usable: false }, ocrStatus: 'failed' }),
        page({ pageNumber: 2, ocrStatus: 'completed', ocrText: 'OCR' }),
      ]),
    ).toBe(true);
  });
});

/**
 * Minimal PDFDocumentProxy double for inspectPdfDocument's extraction
 * loop: pageCount plus per-page text content and no annotations.
 */
function fakeDocument(pageTexts: string[]): PDFDocumentProxy {
  return {
    numPages: pageTexts.length,
    getPage: async (pageNumber: number) => ({
      getTextContent: async () => ({
        items: [{ str: pageTexts[pageNumber - 1], hasEOL: false }],
      }),
      getAnnotations: async () => [],
    }),
  } as unknown as PDFDocumentProxy;
}

describe('inspectPdfDocument automatic OCR', () => {
  beforeEach(() => {
    vi.mocked(ocrPdfPages).mockClear();
  });

  it('runs OCR on a page with good native text (quality never skips OCR)', async () => {
    const result = await inspectPdfDocument(fakeDocument(['Hallo Welt!']));

    expect(ocrPdfPages).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ocrPdfPages).mock.calls[0]?.[1]).toEqual([1]);

    const page = result.pages[0];
    expect(page.quality.usable).toBe(true);
    expect(page.nativeText).toBe('Hallo Welt!');
    expect(page.ocrStatus).toBe('completed');
    expect(page.ocrText).toBe('OCR 1');
  });

  it('invokes OCR for EVERY page, usable native text or not', async () => {
    const result = await inspectPdfDocument(fakeDocument(['Seite eins', '', 'Seite drei']));

    // One OCR pass over all pages, in page order.
    expect(ocrPdfPages).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ocrPdfPages).mock.calls[0]?.[1]).toEqual([1, 2, 3]);

    expect(result.pages.map((page) => page.ocrStatus)).toEqual([
      'completed',
      'completed',
      'completed',
    ]);
    expect(result.pages.map((page) => page.ocrText)).toEqual(['OCR 1', 'OCR 2', 'OCR 3']);
    // The native representation — including the empty page — is untouched.
    expect(result.pages.map((page) => page.nativeText)).toEqual(['Seite eins', '', 'Seite drei']);
  });

  it('reports the complete work: extraction first, then OCR up to the final page', async () => {
    const seen: PdfInspectionProgress[] = [];
    await inspectPdfDocument(fakeDocument(['Eins', 'Zwei']), {
      onProgress: (progress) => seen.push(progress),
    });

    expect(seen).toEqual([
      { phase: 'text-extraction', currentPage: 1, pageCount: 2 },
      { phase: 'text-extraction', currentPage: 2, pageCount: 2 },
      { phase: 'ocr', currentPage: 1, pageCount: 2, ocrPageCount: 2 },
      { phase: 'ocr', currentPage: 2, pageCount: 2, ocrPageCount: 2 },
    ]);
    // The last reported step is the OCR of the final page: the pipeline
    // never signals completion before every page has both representations.
    expect(seen[seen.length - 1]).toEqual({
      phase: 'ocr',
      currentPage: 2,
      pageCount: 2,
      ocrPageCount: 2,
    });
  });
});
