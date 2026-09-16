/**
 * Loading and releasing PDF documents with pdf.js.
 *
 * One load serves both inspection and page rendering: the caller opens
 * the document once and releases it when done.
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { PdfInspectionError } from './errors';

// In the browser pdf.js requires a worker: without it getDocument()
// throws 'No "GlobalWorkerOptions.workerSrc" specified.' Vite emits the
// worker module as an asset and hands us its URL; pdf.js then creates a
// same-origin module worker. In Node the URL is left unset: pdf.js runs
// its fake worker there, and the '?url' string Vitest produces is not
// importable by Node (the fake-worker loader imports workerSrc verbatim).
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

/** A loaded PDF document and the loading task that owns its resources. */
export interface LoadedPdfDocument {
  /** pdf.js loading task: owns the worker and the document (destroy it). */
  task: PDFDocumentLoadingTask;
  /** The loaded document. */
  doc: PDFDocumentProxy;
}

/** Normalizes the accepted input types into a plain Uint8Array for pdf.js. */
export function toUint8Array(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Blob) {
    return input.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  if (input instanceof Uint8Array) {
    // pdf.js rejects Node Buffers: copy into a plain Uint8Array.
    if (typeof Buffer !== 'undefined' && input instanceof Buffer) {
      return Promise.resolve(new Uint8Array(input));
    }
    return Promise.resolve(input);
  }
  return Promise.resolve(new Uint8Array(input));
}

/**
 * Loads a PDF and resolves when the document is ready. The caller owns the
 * returned task and must release it with releasePdfDocument once done —
 * otherwise the pdf.js worker and the document stay alive.
 *
 * Rejects with PdfInspectionError when the input is not a valid PDF.
 */
export async function loadPdfDocument(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<LoadedPdfDocument> {
  const data = await toUint8Array(input);
  const task = pdfjs.getDocument({ data });

  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (err) {
    console.error('Failed to load PDF', err);
    // Release the failed task too, so an invalid PDF does not leak a worker.
    try {
      await task.destroy();
    } catch (destroyErr) {
      console.error('Failed to release the PDF document', destroyErr);
    }
    throw new PdfInspectionError('Invalid PDF file');
  }

  return { task, doc };
}

/**
 * Destroys a loaded PDF document (worker and document). Never throws: a
 * failed release is logged, because there is nothing a caller could do.
 */
export async function releasePdfDocument(task: PDFDocumentLoadingTask): Promise<void> {
  try {
    await task.destroy();
  } catch (err) {
    console.error('Failed to release the PDF document', err);
  }
}
