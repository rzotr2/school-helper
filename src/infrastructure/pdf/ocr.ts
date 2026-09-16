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

/** Default OCR language: German primary, English fallback. */
export const DEFAULT_OCR_LANGUAGE = 'deu+eng';

export interface OcrPageResult {
  pageNumber: number;
  text: string;
}

export interface OcrPagesOptions {
  /** Tesseract language(s) as a '+' separated list, e.g. 'deu+eng'. */
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
 * running recognize call.
 */
export async function ocrPdfPages(
  doc: PDFDocumentProxy,
  pageNumbers: readonly number[],
  options: OcrPagesOptions = {},
): Promise<Map<number, OcrPageResult>> {
  const {
    language = DEFAULT_OCR_LANGUAGE,
    signal,
    canvasFactory = browserCanvasFactory,
    onProgress,
  } = options;

  const results = new Map<number, OcrPageResult>();
  if (pageNumbers.length === 0) return results;

  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    try {
      // Tesseract.js v7 accepts the languages as an array.
      worker = await createWorker(language.split('+'), 1, {
        logger: () => {}, // keep progress output out of the console
      });
    } catch (err) {
      console.error('OCR worker initialization failed', err);
      throw new PdfInspectionError('OCR worker initialization failed');
    }

    for (const pageNumber of pageNumbers) {
      throwIfAborted(signal);
      onProgress?.(pageNumber, pageNumbers.length);

      let page: PDFPageProxy;
      try {
        page = await doc.getPage(pageNumber);
      } catch (err) {
        console.error(`Failed to load page ${pageNumber} for OCR`, err);
        throw new PdfInspectionError(`Failed to load page ${pageNumber} for OCR`);
      }
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const { context, toImage } = canvasFactory(
        Math.floor(viewport.width),
        Math.floor(viewport.height),
      );

      // pdf.js v6 renders through the context when canvas is null — the one
      // code path that works in the browser and in Node verification.
      const renderTask = page.render({ canvas: null, canvasContext: context, viewport });
      const cancelRender = (): void => renderTask.cancel();
      signal?.addEventListener('abort', cancelRender, { once: true });
      try {
        await renderTask.promise;
      } catch (err) {
        if (signal?.aborted) throw new PdfCancellationError();
        console.error(`Failed to render page ${pageNumber} for OCR`, err);
        throw new PdfInspectionError(`Failed to render page ${pageNumber} for OCR`);
      } finally {
        signal?.removeEventListener('abort', cancelRender);
      }

      throwIfAborted(signal);

      try {
        // Capture the image only now that the page has been rendered.
        const { data } = await worker.recognize(toImage());
        results.set(pageNumber, {
          pageNumber,
          text: typeof data?.text === 'string' ? data.text : '',
        });
      } catch (err) {
        if (signal?.aborted) throw new PdfCancellationError();
        console.error(`OCR failed on page ${pageNumber}`, err);
        throw new PdfInspectionError(`OCR failed on page ${pageNumber}`);
      }
    }

    return results;
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (err) {
        console.error('OCR worker termination failed', err);
      }
    }
  }
}
