import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfInspectionProgress, PdfInspectionResult } from '../../infrastructure/pdf/types';
import { evaluateTextQuality } from '../../infrastructure/pdf/textQuality';
import type { Database } from '../../infrastructure/supabase/database.types';

type DocumentRow = Database['public']['Tables']['documents']['Row'];

// The Supabase client and the inspection pipeline are mocked: the
// orchestration here is what is under test — which persisted transitions
// happen in which order, that content and 'completed' land in ONE update,
// that failures persist 'failed' and that progress is forwarded unchanged.
// The pipeline itself is covered by the PDF infrastructure tests.
const mocks = vi.hoisted(() => {
  // Payloads of every processing_status update, in call order.
  const processingUpdates: Array<{ processing_status: string; content?: unknown }> = [];
  // Queued results of downloadDocument's metadata query (shifted per call).
  const downloadRows: Array<{ data: DocumentRow | null; error: unknown }> = [];
  // The real database row shape the mock returns; hoisted because the
  // vi.mock factory (also hoisted) builds rows with it.
  const makeRow = (overrides: Partial<DocumentRow> = {}): DocumentRow => ({
    id: 'doc-1',
    owner_id: 'user-1',
    topic_id: 'topic-1',
    original_name: 'Skript.pdf',
    storage_path: 'users/user-1/documents/doc-1.pdf',
    mime_type: 'application/pdf',
    size: 1234,
    created_at: '2026-09-17T08:00:00.000Z',
    updated_at: '2026-09-17T08:00:00.000Z',
    content: null,
    processing_status: 'processing',
    ...overrides,
  });
  // Exposed so tests can mutate the query builder (e.g. simulate a
  // network failure on one specific write).
  const builder = {} as {
    update: (payload: { processing_status: string; content?: unknown }) => unknown;
  };
  return { processingUpdates, downloadRows, makeRow, builder };
});

vi.mock('../../infrastructure/supabase/client', () => {
  mocks.builder.update = (payload: { processing_status: string; content?: unknown }) => {
    mocks.processingUpdates.push({ ...payload });
    return {
      eq: () => ({
        select: () => ({
          single: async () => ({
            data: mocks.makeRow({
              content: (payload.content ?? null) as Database['public']['Tables']['documents']['Row']['content'],
              processing_status: payload.processing_status as DocumentRow['processing_status'],
            }),
            error: null,
          }),
        }),
      }),
    };
  };
  const builder = {
    select: () => ({
      eq: () => ({
        order: () => ({}),
        maybeSingle: async () => {
          const queued = mocks.downloadRows.shift();
          return queued ?? { data: mocks.makeRow({ processing_status: 'completed' }), error: null };
        },
      }),
    }),
    update: (payload: { processing_status: string; content?: unknown }) =>
      mocks.builder.update(payload),
    insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  };
  return {
    supabase: {
      from: () => builder,
      storage: {
        from: () => ({
          createSignedUrl: async () => ({
            data: { signedUrl: 'https://example.invalid/doc-1.pdf' },
            error: null,
          }),
        }),
      },
    },
  };
});

vi.mock('../../infrastructure/pdf/inspect', () => ({
  inspectPdf: vi.fn(),
}));

import { inspectPdf } from '../../infrastructure/pdf/inspect';
import { processDocument } from './documentProcessing';

function inspectionResult(texts: string[]): PdfInspectionResult {
  return {
    pageCount: texts.length,
    pages: texts.map((nativeText, index) => ({
      pageNumber: index + 1,
      nativeText,
      quality: evaluateTextQuality(nativeText),
      // Automatic processing OCRs every page; in this fixture only the
      // empty native page fails (it has nothing to render).
      ocrText: nativeText.trim() === '' ? null : `OCR ${index + 1}`,
      ocrStatus: nativeText.trim() === '' ? 'failed' : 'completed',
    })),
    annotations: [],
    hasUsableText: texts.some((text) => text.trim() !== ''),
  };
}

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['%PDF-1.4 stub']),
    })),
  );
}

beforeEach(() => {
  mocks.processingUpdates.length = 0;
  mocks.downloadRows.length = 0;
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('processDocument', () => {
  it('persists processing, then content and completed in ONE atomic update', async () => {
    vi.mocked(inspectPdf).mockResolvedValueOnce(inspectionResult(['Kapitel 1', '']));

    const document = await processDocument('user-1', 'doc-1');

    // The persisted transitions: 'processing' first, then the final write.
    expect(mocks.processingUpdates.map((update) => update.processing_status)).toEqual([
      'processing',
      'completed',
    ]);
    // Atomicity: the completed transition carries the content in the same
    // write — a document can never be openable without its extraction data.
    const final = mocks.processingUpdates[1];
    // Both representations are persisted: the page with good native text
    // still carries its automatic OCR result.
    expect(final.content).toEqual({
      pages: [
        expect.objectContaining({
          pageNumber: 1,
          nativeText: 'Kapitel 1',
          ocrText: 'OCR 1',
          ocrStatus: 'completed',
        }),
        expect.objectContaining({ pageNumber: 2, nativeText: '', ocrStatus: 'failed' }),
      ],
    });
    expect(document.processingStatus).toBe('completed');
    expect(document.content).not.toBeNull();
  });

  it('forwards inspection progress unchanged to the caller', async () => {
    vi.mocked(inspectPdf).mockImplementationOnce(async (_input, options) => {
      options?.onProgress?.({ phase: 'text-extraction', currentPage: 1, pageCount: 2 });
      options?.onProgress?.({ phase: 'ocr', currentPage: 2, pageCount: 2, ocrPageCount: 1 });
      return inspectionResult(['a', 'b']);
    });

    const seen: PdfInspectionProgress[] = [];
    await processDocument('user-1', 'doc-1', { onProgress: (progress) => seen.push(progress) });

    expect(seen).toEqual([
      { phase: 'text-extraction', currentPage: 1, pageCount: 2 },
      { phase: 'ocr', currentPage: 2, pageCount: 2, ocrPageCount: 1 },
    ]);
  });

  it('persists failed and rethrows the original error when the pipeline fails', async () => {
    vi.mocked(inspectPdf).mockRejectedValueOnce(new Error('OCR worker failed'));

    await expect(processDocument('user-1', 'doc-1')).rejects.toThrow('OCR worker failed');
    expect(mocks.processingUpdates.map((update) => update.processing_status)).toEqual([
      'processing',
      'failed',
    ]);
    // A failed run never writes content — existing persisted content
    // (or its absence) is not touched by the failure.
    expect(mocks.processingUpdates[1].content).toBeUndefined();
  });

  it('does not mask the original error when the failure write itself fails', async () => {
    vi.mocked(inspectPdf).mockRejectedValueOnce(new Error('boom'));
    // Simulate a network failure on the 'failed' write (the second update)
    // without affecting the 'processing' write before it.
    const originalUpdate = mocks.builder.update;
    let updateCalls = 0;
    mocks.builder.update = (payload) => {
      updateCalls++;
      if (updateCalls === 2) throw new Error('network down');
      return originalUpdate(payload);
    };
    try {
      await expect(processDocument('user-1', 'doc-1')).rejects.toThrow('boom');
    } finally {
      mocks.builder.update = originalUpdate;
    }
  });

  it('deduplicates concurrent runs of the same document (one pipeline run)', async () => {
    // A deferred inspection keeps the first run in flight while the second
    // call arrives — exactly the overlapping-runs situation the registry
    // exists for.
    let resolveInspection!: (result: PdfInspectionResult) => void;
    vi.mocked(inspectPdf).mockImplementationOnce(
      () => new Promise((resolve) => { resolveInspection = resolve; }),
    );

    const first = processDocument('user-1', 'doc-1');
    const second = processDocument('user-1', 'doc-1');
    // The run reaches inspectPdf only after the 'processing' write and the
    // download settle; wait until the deferred inspection is installed.
    await vi.waitFor(() => expect(inspectPdf).toHaveBeenCalledTimes(1));
    resolveInspection(inspectionResult(['Einmal']));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    // The second call joined the first run: no double download, no double
    // OCR, and both callers observe the same outcome.
    expect(inspectPdf).toHaveBeenCalledTimes(1);
    expect(secondResult).toBe(firstResult);
    expect(firstResult.processingStatus).toBe('completed');
    expect(mocks.processingUpdates.map((update) => update.processing_status)).toEqual([
      'processing',
      'completed',
    ]);
  });

  it('rejects without a user', async () => {
    await expect(processDocument('', 'doc-1')).rejects.toThrow('User must be authenticated');
    expect(inspectPdf).not.toHaveBeenCalled();
  });

  it('retry works: a failed run is followed by a completed run with fresh content', async () => {
    vi.mocked(inspectPdf)
      .mockRejectedValueOnce(new Error('first attempt failed'))
      .mockResolvedValueOnce(inspectionResult(['Wiederholt']));

    await expect(processDocument('user-1', 'doc-1')).rejects.toThrow('first attempt failed');
    const document = await processDocument('user-1', 'doc-1');

    expect(document.processingStatus).toBe('completed');
    expect(mocks.processingUpdates.map((update) => update.processing_status)).toEqual([
      'processing',
      'failed',
      'processing',
      'completed',
    ]);
    // The final write carries the fresh content of the successful run —
    // retry OCRs every page like the first attempt.
    expect(mocks.processingUpdates[3].content).toEqual({
      pages: [
        expect.objectContaining({
          pageNumber: 1,
          nativeText: 'Wiederholt',
          ocrText: 'OCR 1',
          ocrStatus: 'completed',
        }),
      ],
    });
  });
});
