import { describe, expect, it } from 'vitest';
import type { PdfInspectionResult, PdfPageInspection } from '../../infrastructure/pdf/types';
import { pagesHaveUsableText } from '../../infrastructure/pdf/types';
import { evaluateTextQuality } from '../../infrastructure/pdf/textQuality';
import {
  canOpenDocument,
  documentContentToInspection,
  inspectionToDocumentContent,
  parseDocumentContent,
  parseProcessingStatus,
  persistedPageFromOcrUpdate,
  withPageOcrUpdate,
  type DocumentContent,
  type PersistedPageContent,
} from './documentContent';

// Pure-function tests only: no Supabase client, no mocks. The critical
// behavioral invariant (OCR survives a full application reload) is the
// round-trip inspection → content → inspection, tested below.

const nativeText = 'Dies ist eine native Textzeile.';
const usableQuality = evaluateTextQuality(nativeText);
const emptyQuality = evaluateTextQuality('');

function persistedPage(overrides: Partial<PersistedPageContent> = {}): PersistedPageContent {
  return {
    pageNumber: 1,
    nativeText,
    quality: usableQuality,
    ocrText: null,
    ocrStatus: 'not-generated',
    ...overrides,
  };
}

function inspectionPage(overrides: Partial<PdfPageInspection> = {}): PdfPageInspection {
  return {
    pageNumber: 1,
    nativeText,
    quality: usableQuality,
    ocrText: null,
    ocrStatus: 'not-needed',
    ...overrides,
  };
}

function inspection(pages: PdfPageInspection[]): PdfInspectionResult {
  return {
    pageCount: pages.length,
    pages,
    annotations: [],
    hasUsableText: pagesHaveUsableText(pages),
  };
}

describe('parseProcessingStatus', () => {
  it('accepts the four persisted statuses', () => {
    for (const status of ['pending', 'processing', 'completed', 'failed'] as const) {
      expect(parseProcessingStatus(status)).toBe(status);
    }
  });

  it('rejects unknown or absent values', () => {
    expect(parseProcessingStatus('running')).toBeNull();
    expect(parseProcessingStatus(undefined)).toBeNull();
    expect(parseProcessingStatus(null)).toBeNull();
    expect(parseProcessingStatus(42)).toBeNull();
  });
});

describe('canOpenDocument', () => {
  it('only completed documents are openable', () => {
    expect(canOpenDocument('completed')).toBe(true);
    expect(canOpenDocument('pending')).toBe(false);
    expect(canOpenDocument('processing')).toBe(false);
    expect(canOpenDocument('failed')).toBe(false);
  });
});

describe('parseDocumentContent', () => {
  // Scenario: pre-migration documents (content is NULL) and documents that
  // were never inspected must load and be inspected again.
  it('returns null for a missing or NULL column value', () => {
    expect(parseDocumentContent(null)).toBeNull();
    expect(parseDocumentContent(undefined)).toBeNull();
  });

  it('returns null for malformed values', () => {
    expect(parseDocumentContent('not an object')).toBeNull();
    expect(parseDocumentContent({ pages: 'nope' })).toBeNull();
    // A page with an invalid ocrStatus invalidates the whole value.
    expect(parseDocumentContent({ pages: [{ ...persistedPage(), ocrStatus: 'processing' }] })).toBeNull();
    // A page missing required fields is malformed.
    expect(parseDocumentContent({ pages: [{ pageNumber: 1 }] })).toBeNull();
  });

  it('returns the typed content for a valid value', () => {
    const content: DocumentContent = { pages: [persistedPage()] };
    expect(parseDocumentContent(content)).toEqual(content);
  });
});

describe('inspectionToDocumentContent', () => {
  it('persists nativeText and quality from the runtime pages', () => {
    const content = inspectionToDocumentContent(inspection([inspectionPage()]));
    expect(content.pages).toHaveLength(1);
    expect(content.pages[0]).toEqual({
      pageNumber: 1,
      nativeText,
      quality: usableQuality,
      ocrText: null,
      ocrStatus: 'not-generated',
    });
  });

  it('collapses transient OCR states to not-generated', () => {
    for (const ocrStatus of ['not-needed', 'pending', 'processing'] as const) {
      const content = inspectionToDocumentContent(inspection([inspectionPage({ ocrStatus })]));
      expect(content.pages[0].ocrStatus).toBe('not-generated');
    }
  });

  it('persists a completed OCR result with its text', () => {
    const content = inspectionToDocumentContent(
      inspection([inspectionPage({ ocrStatus: 'completed', ocrText: 'OCR-Text' })]),
    );
    expect(content.pages[0].ocrStatus).toBe('completed');
    expect(content.pages[0].ocrText).toBe('OCR-Text');
  });

  it('persists a failed attempt', () => {
    const content = inspectionToDocumentContent(inspection([inspectionPage({ ocrStatus: 'failed' })]));
    expect(content.pages[0].ocrStatus).toBe('failed');
    expect(content.pages[0].ocrText).toBeNull();
  });
});

describe('documentContentToInspection', () => {
  // Scenario: persisted nativeText is reused without re-extraction.
  it('restores persisted nativeText and quality as-is', () => {
    const content: DocumentContent = { pages: [persistedPage()] };
    const restored = documentContentToInspection(content, 1);
    expect(restored.pages[0].nativeText).toBe(nativeText);
    expect(restored.pages[0].quality).toEqual(usableQuality);
    expect(restored.hasUsableText).toBe(true);
  });

  // Scenario: persisted OCR restores as completed, so the OCR tab shows the
  // result immediately and the button is not shown as if OCR were missing.
  it('restores a persisted completed OCR result immediately', () => {
    const content: DocumentContent = {
      pages: [persistedPage({ ocrStatus: 'completed', ocrText: 'OCR-Text' })],
    };
    const restored = documentContentToInspection(content, 1);
    expect(restored.pages[0].ocrStatus).toBe('completed');
    expect(restored.pages[0].ocrText).toBe('OCR-Text');
  });

  it('restores a persisted failed state as failed', () => {
    const content: DocumentContent = { pages: [persistedPage({ ocrStatus: 'failed' })] };
    const restored = documentContentToInspection(content, 1);
    expect(restored.pages[0].ocrStatus).toBe('failed');
    expect(restored.pages[0].ocrText).toBeNull();
  });

  it('restores not-generated as not-needed, never as a transient state', () => {
    const content: DocumentContent = { pages: [persistedPage({ ocrStatus: 'not-generated' })] };
    const restored = documentContentToInspection(content, 1);
    // 'pending' would lie about a processing run; restoring is not
    // re-running the auto-OCR inside inspectPdfDocument.
    expect(restored.pages[0].ocrStatus).toBe('not-needed');
  });

  it('fills pages without a persisted entry with empty defaults', () => {
    const content: DocumentContent = { pages: [persistedPage()] };
    const restored = documentContentToInspection(content, 3);
    expect(restored.pages).toHaveLength(3);
    expect(restored.pages[1]).toEqual({
      pageNumber: 2,
      nativeText: '',
      quality: emptyQuality,
      ocrText: null,
      ocrStatus: 'not-needed',
    });
    expect(restored.pages[2].pageNumber).toBe(3);
    expect(restored.hasUsableText).toBe(true);
  });

  it('drops persisted pages beyond the current page count', () => {
    const content: DocumentContent = {
      pages: [persistedPage(), persistedPage({ pageNumber: 2 }), persistedPage({ pageNumber: 3 })],
    };
    const restored = documentContentToInspection(content, 2);
    expect(restored.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
  });

  it('carries no annotations (the viewer reads them from the live pdf.js page)', () => {
    const restored = documentContentToInspection({ pages: [persistedPage()] }, 1);
    expect(restored.annotations).toEqual([]);
  });
});

describe('round-trip after a full reload', () => {
  // The critical invariant: OCR survives the application reload because
  // inspection → content → inspection reproduces the final states.
  it('reproduces a completed page exactly', () => {
    const original = inspection([inspectionPage({ ocrStatus: 'completed', ocrText: 'OCR-Text' })]);
    const restored = documentContentToInspection(
      inspectionToDocumentContent(original),
      original.pageCount,
    );
    expect(restored.pages).toEqual(original.pages);
    expect(restored.hasUsableText).toBe(original.hasUsableText);
  });

  it('reproduces a failed page exactly', () => {
    const original = inspection([inspectionPage({ ocrStatus: 'failed' })]);
    const restored = documentContentToInspection(
      inspectionToDocumentContent(original),
      original.pageCount,
    );
    expect(restored.pages).toEqual(original.pages);
  });

  it('reproduces an unprocessed page exactly', () => {
    const original = inspection([inspectionPage({ ocrStatus: 'not-needed' })]);
    const restored = documentContentToInspection(
      inspectionToDocumentContent(original),
      original.pageCount,
    );
    expect(restored.pages).toEqual(original.pages);
  });
});

describe('persistedPageFromOcrUpdate', () => {
  // Scenario: an explicit OCR run persists its result without ever
  // modifying the native text.
  it('takes nativeText and quality from the runtime page', () => {
    const page = inspectionPage();
    const persisted = persistedPageFromOcrUpdate(page, { ocrStatus: 'completed', ocrText: 'OCR-Text' });
    expect(persisted.nativeText).toBe(page.nativeText);
    expect(persisted.quality).toEqual(page.quality);
    expect(persisted.pageNumber).toBe(page.pageNumber);
  });

  it('takes the OCR fields from the update', () => {
    const persisted = persistedPageFromOcrUpdate(inspectionPage(), {
      ocrStatus: 'failed',
      ocrText: null,
    });
    expect(persisted.ocrStatus).toBe('failed');
    expect(persisted.ocrText).toBeNull();
  });
});

describe('withPageOcrUpdate', () => {
  // Scenario: an OCR run for one page must not modify any other page.
  it('writes only the updated page and leaves the others untouched', () => {
    const content: DocumentContent = {
      pages: [persistedPage(), persistedPage({ pageNumber: 2 }), persistedPage({ pageNumber: 3 })],
    };
    const merged = withPageOcrUpdate(
      content,
      persistedPage({ pageNumber: 3, ocrStatus: 'completed', ocrText: 'OCR-Seite 3' }),
    );
    expect(merged).not.toBeNull();
    expect(merged?.pages[0]).toEqual(content.pages[0]);
    expect(merged?.pages[1]).toEqual(content.pages[1]);
    expect(merged?.pages[2]).toEqual({
      pageNumber: 3,
      nativeText,
      quality: usableQuality,
      ocrText: 'OCR-Seite 3',
      ocrStatus: 'completed',
    });
  });

  // Scenario: a failed OCR attempt must not destroy an existing successful
  // result (and with it neither the native text of that page).
  it('a failed update preserves an existing successful result', () => {
    const content: DocumentContent = {
      pages: [persistedPage({ ocrStatus: 'completed', ocrText: 'OCR-Text' })],
    };
    expect(withPageOcrUpdate(content, persistedPage({ ocrStatus: 'failed', ocrText: null }))).toBeNull();
    expect(content.pages[0]).toEqual({
      pageNumber: 1,
      nativeText,
      quality: usableQuality,
      ocrText: 'OCR-Text',
      ocrStatus: 'completed',
    });
  });

  it('a failed update that still carries text is stored as completed', () => {
    // Text without a completed status would be an inconsistent persisted
    // state; the merge normalizes it.
    const merged = withPageOcrUpdate(
      null,
      persistedPage({ ocrStatus: 'failed', ocrText: 'OCR-Text' }),
    );
    expect(merged?.pages[0]).toEqual({
      pageNumber: 1,
      nativeText,
      quality: usableQuality,
      ocrText: 'OCR-Text',
      ocrStatus: 'completed',
    });
  });

  it('a failed update without text records failed when nothing existed', () => {
    const merged = withPageOcrUpdate(null, persistedPage({ ocrStatus: 'failed' }));
    expect(merged?.pages[0].ocrStatus).toBe('failed');
    expect(merged?.pages[0].ocrText).toBeNull();
  });

  it('keeps pages ordered by page number', () => {
    const content: DocumentContent = {
      pages: [persistedPage(), persistedPage({ pageNumber: 3 })],
    };
    const merged = withPageOcrUpdate(content, persistedPage({ pageNumber: 2 }));
    expect(merged?.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
  });
});
