import { describe, expect, it } from 'vitest';
import type { PdfInspectionResult, PdfPageInspection } from '../../infrastructure/pdf/types';
import { pagesHaveUsableText } from '../../infrastructure/pdf/types';
import { evaluateTextQuality } from '../../infrastructure/pdf/textQuality';
import {
  canOpenDocument,
  documentContentToInspection,
  getDocumentPageBlocks,
  getDocumentPageText,
  getDocumentSections,
  inspectionToDocumentContent,
  parseDocumentContent,
  parseProcessingStatus,
  persistedPageFromOcrUpdate,
  mergePageOcrUpdate,
  type DocumentContent,
  type DocumentSection,
  type PageContent,
  type TextBlock,
} from './documentContent';

// Pure-function tests only: no Supabase client, no mocks. The critical
// behavioral invariant (OCR survives a full application reload) is the
// round-trip inspection → content → inspection, tested below.

const nativeText = 'Dies ist eine native Textzeile.';
const usableQuality = evaluateTextQuality(nativeText);
const emptyQuality = evaluateTextQuality('');

function persistedPage(overrides: Partial<PageContent> = {}): PageContent {
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

  it('parses valid structural blocks correctly and preserves text and types', () => {
    const blocks: TextBlock[] = [
      { text: 'Kapitel 1: Uebersicht', type: 'heading' },
      { text: 'Dies ist der Inhalt des ersten Abschnitts.', type: 'paragraph' },
      { text: '- Erster Punkt\n- Zweiter Punkt', type: 'list' },
    ];
    const content: DocumentContent = { pages: [persistedPage({ blocks })] };
    const parsed = parseDocumentContent(content);
    expect(parsed).toEqual(content);
    expect(parsed?.pages[0].blocks).toHaveLength(3);
    expect(parsed?.pages[0].blocks?.[0].type).toBe('heading');
    expect(parsed?.pages[0].blocks?.[1].type).toBe('paragraph');
    expect(parsed?.pages[0].blocks?.[2].type).toBe('list');
  });

  it('accepts legacy content where blocks are absent', () => {
    const legacyPage = {
      pageNumber: 1,
      nativeText,
      quality: usableQuality,
      ocrText: null,
      ocrStatus: 'not-generated',
    };
    const content = { pages: [legacyPage] };
    const parsed = parseDocumentContent(content);
    expect(parsed).not.toBeNull();
    expect(parsed?.pages[0].pageNumber).toBe(1);
    expect(parsed?.pages[0].blocks).toBeUndefined();
  });

  it('rejects malformed blocks safely', () => {
    // blocks is not an array
    expect(
      parseDocumentContent({ pages: [{ ...persistedPage(), blocks: 'invalid-string' }] }),
    ).toBeNull();
    expect(
      parseDocumentContent({ pages: [{ ...persistedPage(), blocks: 123 }] }),
    ).toBeNull();
    // block is not an object
    expect(
      parseDocumentContent({ pages: [{ ...persistedPage(), blocks: [null] }] }),
    ).toBeNull();
    expect(
      parseDocumentContent({ pages: [{ ...persistedPage(), blocks: ['string-instead-of-object'] }] }),
    ).toBeNull();
    // block missing text
    expect(
      parseDocumentContent({
        pages: [{ ...persistedPage(), blocks: [{ type: 'paragraph' }] }],
      }),
    ).toBeNull();
    // block with non-string text
    expect(
      parseDocumentContent({
        pages: [{ ...persistedPage(), blocks: [{ text: 42, type: 'paragraph' }] }],
      }),
    ).toBeNull();
    // block with invalid type
    expect(
      parseDocumentContent({
        pages: [{ ...persistedPage(), blocks: [{ text: 'Text', type: 'table' }] }],
      }),
    ).toBeNull();
  });

  it('accepts valid stringified JSON content', () => {
    const content: DocumentContent = { pages: [persistedPage()] };
    expect(parseDocumentContent(JSON.stringify(content))).toEqual(content);
  });

  it('normalizes not-needed ocrStatus to not-generated', () => {
    const raw = {
      pages: [
        {
          ...persistedPage(),
          ocrStatus: 'not-needed',
        },
      ],
    };
    const parsed = parseDocumentContent(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.pages[0].ocrStatus).toBe('not-generated');
  });

  it('normalizes partial quality objects using evaluateTextQuality fallback', () => {
    const raw = {
      pages: [
        {
          pageNumber: 1,
          nativeText: 'Some native text',
          quality: { usable: true },
          ocrText: null,
          ocrStatus: 'not-generated',
        },
      ],
    };
    const parsed = parseDocumentContent(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.pages[0].quality.usable).toBe(true);
    expect(parsed?.pages[0].quality.charCount).toBe(16);
  });

  // Scenario: page boundaries must stay unambiguous for future search —
  // page numbers that cannot occur in the pipeline mean corrupt data.
  it('rejects a page number of 0', () => {
    expect(parseDocumentContent({ pages: [persistedPage({ pageNumber: 0 })] })).toBeNull();
  });

  it('rejects negative page numbers', () => {
    expect(parseDocumentContent({ pages: [persistedPage({ pageNumber: -1 })] })).toBeNull();
  });

  it('rejects fractional page numbers', () => {
    expect(parseDocumentContent({ pages: [persistedPage({ pageNumber: 1.5 })] })).toBeNull();
  });

  it('rejects duplicate page numbers', () => {
    expect(parseDocumentContent({ pages: [persistedPage(), persistedPage()] })).toBeNull();
  });
});

describe('getDocumentPageText', () => {
  // Scenario: legacy documents (content NULL) and documents without a
  // persisted entry for a page must yield null — "no persisted text".
  it('returns null when content is null', () => {
    expect(getDocumentPageText(null, 1)).toBeNull();
  });

  it('returns null when the page is missing', () => {
    const content: DocumentContent = { pages: [persistedPage({ pageNumber: 1 })] };
    expect(getDocumentPageText(content, 2)).toBeNull();
  });

  // Scenario: future text-consuming features (search, summaries) get the
  // two representations exactly as stored — never merged, no winner.
  it('returns native and OCR text exactly as stored, independently', () => {
    const content: DocumentContent = {
      pages: [persistedPage({ pageNumber: 1, ocrStatus: 'completed', ocrText: 'OCR-Text' })],
    };
    expect(getDocumentPageText(content, 1)).toEqual({
      nativeText,
      ocrText: 'OCR-Text',
    });
  });

  it('never replaces the native text with OCR output', () => {
    const content: DocumentContent = {
      pages: [
        persistedPage({
          pageNumber: 1,
          nativeText: '',
          ocrStatus: 'completed',
          ocrText: 'OCR-Text',
        }),
      ],
    };
    // An empty native text is returned as native, not substituted by OCR:
    // the result carries both fields and no winner is chosen.
    expect(getDocumentPageText(content, 1)).toEqual({ nativeText: '', ocrText: 'OCR-Text' });
  });

  it('preserves ocrText null for a page without OCR output', () => {
    const content: DocumentContent = {
      pages: [persistedPage({ pageNumber: 1, ocrStatus: 'not-generated', ocrText: null })],
    };
    expect(getDocumentPageText(content, 1)).toEqual({ nativeText, ocrText: null });
  });
});

describe('getDocumentPageBlocks', () => {
  it('returns null when content is null', () => {
    expect(getDocumentPageBlocks(null, 1)).toBeNull();
  });

  it('returns null when page does not exist', () => {
    const content: DocumentContent = { pages: [persistedPage()] };
    expect(getDocumentPageBlocks(content, 2)).toBeNull();
  });

  it('returns null when page has no blocks (legacy content)', () => {
    const content: DocumentContent = { pages: [persistedPage()] };
    expect(getDocumentPageBlocks(content, 1)).toBeNull();
  });

  it('returns the typed blocks array when page has blocks', () => {
    const blocks: TextBlock[] = [
      { text: 'Titel', type: 'heading' },
      { text: 'Absatz', type: 'paragraph' },
    ];
    const content: DocumentContent = { pages: [persistedPage({ blocks })] };
    expect(getDocumentPageBlocks(content, 1)).toEqual(blocks);
  });
});

describe('serialized content shape', () => {
  // Scenario: the persisted JSON must stay exactly { pages: [...] } with
  // the five page fields — no extra keys from the runtime inspection model.
  it('serializes to exactly the persisted JSON structure', () => {
    const content = inspectionToDocumentContent(
      inspection([inspectionPage({ ocrStatus: 'completed', ocrText: 'OCR-Text' })]),
    );
    expect(JSON.parse(JSON.stringify(content))).toEqual({
      pages: [
        {
          pageNumber: 1,
          nativeText,
          quality: usableQuality,
          ocrText: 'OCR-Text',
          ocrStatus: 'completed',
        },
      ],
    });
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

  it('persists structural blocks when present on the runtime page', () => {
    const blocks: TextBlock[] = [{ text: 'Titel', type: 'heading' }];
    const content = inspectionToDocumentContent(inspection([inspectionPage({ blocks })]));
    expect(content.pages[0].blocks).toEqual(blocks);
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

  it('restores structural blocks when present in persisted content', () => {
    const blocks: TextBlock[] = [{ text: 'Titel', type: 'heading' }];
    const content: DocumentContent = { pages: [persistedPage({ blocks })] };
    const restored = documentContentToInspection(content, 1);
    expect(restored.pages[0].blocks).toEqual(blocks);
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

  it('reproduces structural blocks through a full reload round-trip', () => {
    const blocks: TextBlock[] = [
      { text: 'Einleitung', type: 'heading' },
      { text: 'Absatz text.', type: 'paragraph' },
    ];
    const original = inspection([inspectionPage({ blocks, ocrStatus: 'completed', ocrText: 'OCR' })]);
    const restored = documentContentToInspection(
      inspectionToDocumentContent(original),
      original.pageCount,
    );
    expect(restored.pages[0].blocks).toEqual(blocks);
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

  it('preserves structural blocks from the runtime page during OCR updates', () => {
    const blocks: TextBlock[] = [{ text: 'Absatz', type: 'paragraph' }];
    const page = inspectionPage({ blocks });
    const persisted = persistedPageFromOcrUpdate(page, { ocrStatus: 'completed', ocrText: 'OCR-Text' });
    expect(persisted.blocks).toEqual(blocks);
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

describe('mergePageOcrUpdate', () => {
  // Scenario: an OCR run for one page must not modify any other page.
  it('writes only the updated page and leaves the others untouched', () => {
    const content: DocumentContent = {
      pages: [persistedPage(), persistedPage({ pageNumber: 2 }), persistedPage({ pageNumber: 3 })],
    };
    const merged = mergePageOcrUpdate(
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
    expect(mergePageOcrUpdate(content, persistedPage({ ocrStatus: 'failed', ocrText: null }))).toBeNull();
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
    const merged = mergePageOcrUpdate(
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
    const merged = mergePageOcrUpdate(null, persistedPage({ ocrStatus: 'failed' }));
    expect(merged?.pages[0].ocrStatus).toBe('failed');
    expect(merged?.pages[0].ocrText).toBeNull();
  });

  it('keeps pages ordered by page number', () => {
    const content: DocumentContent = {
      pages: [persistedPage(), persistedPage({ pageNumber: 3 })],
    };
    const merged = mergePageOcrUpdate(content, persistedPage({ pageNumber: 2 }));
    expect(merged?.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
  });

  it('preserves existing document sections when merging an OCR update', () => {
    const existingSection: DocumentSection = {
      title: 'Abschnitt 1',
      blocks: [{ type: 'heading', text: 'Abschnitt 1' }],
      pageStart: 1,
      pageEnd: 1,
    };
    const content: DocumentContent = {
      pages: [persistedPage({ pageNumber: 1 })],
      sections: [existingSection],
    };

    const merged = mergePageOcrUpdate(
      content,
      persistedPage({ pageNumber: 1, ocrStatus: 'completed', ocrText: 'OCR-Text' }),
    );
    expect(merged?.sections).toEqual([existingSection]);
  });
});

describe('DocumentSections persistence and accessors', () => {
  const validBlocks: TextBlock[] = [
    { type: 'heading', text: 'Kapitel 1' },
    { type: 'paragraph', text: 'Inhalt von Kapitel 1' },
  ];

  const validSection: DocumentSection = {
    title: 'Kapitel 1',
    blocks: validBlocks,
    pageStart: 1,
    pageEnd: 2,
  };

  it('parses valid sections correctly', () => {
    const raw = {
      pages: [persistedPage({ pageNumber: 1 }), persistedPage({ pageNumber: 2 })],
      sections: [validSection],
    };
    const parsed = parseDocumentContent(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections).toEqual([validSection]);
  });

  it('missing sections remain completely valid (backward compatibility)', () => {
    const raw = {
      pages: [persistedPage({ pageNumber: 1 })],
    };
    const parsed = parseDocumentContent(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections).toBeUndefined();
  });

  it('safely rejects malformed sections structures', () => {
    const basePages = [persistedPage({ pageNumber: 1 })];

    // sections is not an array
    expect(parseDocumentContent({ pages: basePages, sections: 'invalid' })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: 123 })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: {} })).toBeNull();

    // section item is not an object or null
    expect(parseDocumentContent({ pages: basePages, sections: [null] })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: ['string'] })).toBeNull();

    // invalid title type
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, title: 123 }] })).toBeNull();

    // invalid pageStart / pageEnd
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, pageStart: 0 }] })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, pageStart: -1 }] })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, pageStart: '1' }] })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, pageStart: 1.5 }] })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, pageEnd: 0 }] })).toBeNull();

    // pageStart > pageEnd
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, pageStart: 3, pageEnd: 2 }] })).toBeNull();

    // invalid blocks array
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, blocks: null }] })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, blocks: 'not-array' }] })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, blocks: [{ type: 'unknown', text: 't' }] }] })).toBeNull();
    expect(parseDocumentContent({ pages: basePages, sections: [{ ...validSection, blocks: [{ type: 'paragraph', text: 123 }] }] })).toBeNull();
  });

  it('inspectionToDocumentContent generates sections from inspection page blocks', () => {
    const inspectionResult: PdfInspectionResult = {
      pageCount: 2,
      annotations: [],
      hasUsableText: true,
      pages: [
        inspectionPage({
          pageNumber: 1,
          blocks: [
            { type: 'heading', text: 'Einleitung' },
            { type: 'paragraph', text: 'Start' },
          ],
        }),
        inspectionPage({
          pageNumber: 2,
          blocks: [
            { type: 'paragraph', text: 'Fortsetzung' },
          ],
        }),
      ],
    };

    const content = inspectionToDocumentContent(inspectionResult);
    expect(content.sections).toBeDefined();
    expect(content.sections).toEqual([
      {
        title: 'Einleitung',
        blocks: [
          { type: 'heading', text: 'Einleitung' },
          { type: 'paragraph', text: 'Start' },
          { type: 'paragraph', text: 'Fortsetzung' },
        ],
        pageStart: 1,
        pageEnd: 2,
      },
    ]);
  });

  it('inspectionToDocumentContent omits sections when inspection pages have no blocks', () => {
    const inspectionResult = inspection([inspectionPage({ pageNumber: 1 })]);
    const content = inspectionToDocumentContent(inspectionResult);
    expect(content.sections).toBeUndefined();
  });

  it('documentContentToInspection restores inspection seamlessly with sections present', () => {
    const content: DocumentContent = {
      pages: [persistedPage({ pageNumber: 1 })],
      sections: [validSection],
    };
    const restored = documentContentToInspection(content, 1);
    expect(restored.pageCount).toBe(1);
    expect(restored.pages[0].pageNumber).toBe(1);
  });

  it('getDocumentSections returns sections when present and null when missing or content is null', () => {
    expect(getDocumentSections(null)).toBeNull();
    expect(getDocumentSections({ pages: [persistedPage()] })).toBeNull();
    expect(getDocumentSections({ pages: [persistedPage()], sections: [validSection] })).toEqual([validSection]);
  });
});
