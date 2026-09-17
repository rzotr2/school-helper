import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { PdfCancellationError, PdfInspectionError, throwIfAborted } from './errors';
import type { OcrCanvasFactory, OcrCanvasResult } from './types';

/**
 * Render scale for OCR page images: 2x a 72 dpi PDF page gives roughly
 * 144 dpi, which Tesseract handles well. Higher scales cost much more
 * memory for little accuracy gain.
 */
export const OCR_RENDER_SCALE = 2;

/**
 * Default OCR languages, loaded into a single Tesseract worker so one run
 * recognizes content from all of them. Resolved to 'ukr+deu+eng' for the
 * worker.
 *
 * The order is significant: with a combined model the first language
 * decides the script for ambiguous words. With deu+eng first, a printed
 * 'Анотація' comes back transliterated into Latin lookalikes ('AHoTaußa');
 * with ukr first the same worker returns genuine Cyrillic ('Анотаціхія')
 * while German and English lines stay unchanged (verified by the
 * integration comparison test).
 */
export const DEFAULT_OCR_LANGUAGES = ['ukr', 'deu', 'eng'] as const;

export interface OcrPageResult {
  pageNumber: number;
  text: string;
}

/** Outcome of an OCR run: successful pages plus the pages that failed. */
export interface OcrPagesOutcome {
  /** OCR text by page number — only pages that succeeded. */
  textByPage: Map<number, OcrPageResult>;
  /**
   * Pages whose OCR failed (page load, render or recognize error). A
   * failure is recorded and the run continues with the remaining pages;
   * the caller decides what a failed page means (inspection marks it
   * ocrStatus 'failed' and keeps the native text).
   */
  failedPages: Set<number>;
}

export interface OcrPagesOptions {
  /** Tesseract language(s) as a '+' separated list, e.g. 'ukr+deu+eng'. */
  language?: string;
  signal?: AbortSignal;
  /** Canvas adapter for page rendering (a browser canvas by default). */
  canvasFactory?: OcrCanvasFactory;
  /** Fires before each OCR'd page is processed. */
  onProgress?: (currentPage: number, ocrPageCount: number) => void;
}

/** Default canvas factory for the browser. */
function browserCanvasFactory(width: number, height: number): OcrCanvasResult {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new PdfInspectionError('Failed to create canvas for OCR');
  }
  // Tesseract.js reads the canvas's current content at recognize() time.
  return { context, toImage: () => canvas };
}

/**
 * Runs OCR over the given pages with a single Tesseract worker.
 *
 * Lifecycle: one worker is created for the whole run and terminated in
 * `finally`, so cancellation and errors always clean up. Cancellation is
 * cooperative: it is checked between pages, in-flight page rendering is
 * cancelled via RenderTask.cancel(), and terminating the worker aborts a
 * running recognize call. Cancellation aborts the WHOLE run (a
 * PdfCancellationError) — it is never a per-page failure.
 *
 * Failures are per page: a page whose load, render or recognize fails is
 * recorded in failedPages and the run continues with the next page, so one
 * bad page cannot discard the OCR of the others. Only the worker itself
 * failing to start rejects the run.
 */
export async function ocrPdfPages(
  doc: PDFDocumentProxy,
  pageNumbers: readonly number[],
  options: OcrPagesOptions = {},
): Promise<OcrPagesOutcome> {
  const {
    language = DEFAULT_OCR_LANGUAGES.join('+'),
    signal,
    canvasFactory = browserCanvasFactory,
    onProgress,
  } = options;

  const textByPage = new Map<number, OcrPageResult>();
  const failedPages = new Set<number>();
  if (pageNumbers.length === 0) return { textByPage, failedPages };

  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    try {
      // Tesseract.js v7 accepts the languages as an array. errorHandler
      // keeps a failed job from being rethrown by tesseract's message
      // handler (which would surface as an uncaught exception); the
      // rejection still reaches the catch below.
      worker = await createWorker(language.split('+'), 1, {
        logger: () => {},
        errorHandler: () => {},
      });
    } catch {
      throw new PdfInspectionError('OCR worker initialization failed');
    }

    for (const pageNumber of pageNumbers) {
      throwIfAborted(signal);
      onProgress?.(pageNumber, pageNumbers.length);

      try {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
        const { context, toImage } = canvasFactory(
          Math.floor(viewport.width),
          Math.floor(viewport.height),
        );

        // pdf.js v6 renders through the context when canvas is null — the
        // one code path that works in the browser and in Node verification.
        const renderTask = page.render({ canvas: null, canvasContext: context, viewport });
        const cancelRender = (): void => renderTask.cancel();
        signal?.addEventListener('abort', cancelRender, { once: true });
        try {
          await renderTask.promise;
        } finally {
          signal?.removeEventListener('abort', cancelRender);
        }

        throwIfAborted(signal);

        // Capture the image only now that the page has been rendered.
        const image = toImage();
        const { data } = await worker.recognize(image);
        textByPage.set(pageNumber, {
          pageNumber,
          text: typeof data?.text === 'string' ? data.text : '',
        });
      } catch {
        // Cancellation aborts the whole run; a genuine per-page failure is
        // recorded and the next page continues.
        if (signal?.aborted) throw new PdfCancellationError();
        failedPages.add(pageNumber);
      }
    }

    return { textByPage, failedPages };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // Termination is best-effort: the run result is already settled.
      }
    }
  }
}
