import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { PdfInspectionError, throwIfAborted } from './errors';
import { loadPdfDocument, releasePdfDocument } from './load';
import { ocrPdfPages } from './ocr';
import { evaluateTextQuality } from './textQuality';
import type {
  PdfAnnotation,
  PdfExtractionMethod,
  PdfInspectOptions,
  PdfInspectionResult,
  PdfPageExtractionMethod,
  PdfPageInspection,
} from './types';

/**
 * The fields of a pdf.js annotation object that inspection keeps. The
 * library types getAnnotations() as Array<any>, so every field is guarded
 * at runtime in mapAnnotation.
 */
interface RawPdfAnnotation {
  annotationType?: number;
  subtype?: unknown;
  contents?: unknown;
  /** pdf.js v6 exposes the contents as { str, dir } under contentsObj. */
  contentsObj?: unknown;
  rect?: unknown;
}

/** Numeric pdf.js annotation type -> name, via its AnnotationType table. */
function annotationTypeName(type: number): string {
  for (const [name, value] of Object.entries(pdfjs.AnnotationType)) {
    if (typeof value === 'number' && value === type) return name;
  }
  return 'UNKNOWN';
}

function annotationContent(annotation: RawPdfAnnotation): string | null {
  if (typeof annotation.contents === 'string') return annotation.contents;
  const contentsObj = annotation.contentsObj;
  if (
    contentsObj !== null &&
    typeof contentsObj === 'object' &&
    'str' in contentsObj &&
    typeof contentsObj.str === 'string'
  ) {
    return contentsObj.str;
  }
  return null;
}

/**
 * Maps one raw pdf.js annotation. Note: pdf.js may normalize the rect (an
 * appearance-less Text annotation gets a small icon rect, highlights get
 * their QuadPoints bounding box) — the pipeline captures it as provided.
 */
function mapAnnotation(pageNumber: number, annotation: RawPdfAnnotation): PdfAnnotation {
  const rect =
    Array.isArray(annotation.rect) &&
    annotation.rect.length === 4 &&
    annotation.rect.every((value) => typeof value === 'number')
      ? {
          x: annotation.rect[0],
          y: annotation.rect[1],
          width: annotation.rect[2] - annotation.rect[0],
          height: annotation.rect[3] - annotation.rect[1],
        }
      : null;
  return {
    pageNumber,
    type:
      typeof annotation.annotationType === 'number'
        ? annotationTypeName(annotation.annotationType)
        : 'UNKNOWN',
    subtype: typeof annotation.subtype === 'string' ? annotation.subtype : null,
    content: annotationContent(annotation),
    rect,
  };
}

/**
 * Document-level extraction method from the per-page methods.
 * Pure helper, exported for tests.
 */
export function deriveExtractionMethod(
  methods: readonly PdfPageExtractionMethod[],
): PdfExtractionMethod {
  const hasNativeText = methods.some((method) => method === 'native-text');
  const hasOcr = methods.some((method) => method === 'ocr');
  if (hasNativeText && hasOcr) return 'mixed';
  if (hasOcr) return 'ocr';
  return 'native-text';
}

/**
 * Inspects an already loaded PDF completely locally: extracts the native
 * text layer page by page, evaluates its quality with the deterministic
 * heuristic, collects per-page annotations, and OCRs the pages whose
 * native text is unusable.
 *
 * Does not own the document: the caller loads it (loadPdfDocument) and
 * releases it (releasePdfDocument), so one load can serve both the
 * inspection and page rendering.
 *
 * Rejections are always PdfInspectionError, or PdfCancellationError when
 * the signal aborts. Raw library errors are logged and mapped to messages
 * that are safe to show.
 */
export async function inspectPdfDocument(
  doc: PDFDocumentProxy,
  options: PdfInspectOptions = {},
): Promise<PdfInspectionResult> {
  const { signal, onProgress } = options;

  const pageCount = doc.numPages;
    const pages: PdfPageInspection[] = [];
    const annotations: PdfAnnotation[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      throwIfAborted(signal);
      onProgress?.({ phase: 'text-extraction', currentPage: pageNumber, pageCount });

      let page: PDFPageProxy;
      try {
        page = await doc.getPage(pageNumber);
      } catch (err) {
        console.error(`Failed to read page ${pageNumber}`, err);
        throw new PdfInspectionError(`Failed to read page ${pageNumber}`);
      }

      let nativeText = '';
      try {
        const content = await page.getTextContent();
        // Text items carry the actual text; marked-content items don't.
        for (const item of content.items) {
          if (!('str' in item)) continue;
          nativeText += item.str;
          if (item.hasEOL) nativeText += '\n';
        }
      } catch (err) {
        console.error(`Text extraction failed on page ${pageNumber}`, err);
        throw new PdfInspectionError(`Text extraction failed on page ${pageNumber}`);
      }

      try {
        const rawAnnotations = await page.getAnnotations({ intent: 'display' });
        for (const raw of rawAnnotations) {
          annotations.push(mapAnnotation(pageNumber, raw));
        }
      } catch (err) {
        // Annotation extraction must not block the rest of the pipeline:
        // log and continue without annotation data for this page.
        console.error(`Annotation extraction failed on page ${pageNumber}`, err);
      }

      const quality = evaluateTextQuality(nativeText);
      pages.push(
        quality.usable
          ? { pageNumber, text: nativeText, nativeText, quality, extractionMethod: 'native-text' }
          : { pageNumber, text: '', nativeText, quality, extractionMethod: 'ocr' },
      );
    }

    const ocrPageNumbers = pages
      .filter((page) => page.extractionMethod === 'ocr')
      .map((page) => page.pageNumber);

    if (ocrPageNumbers.length > 0) {
      const ocrResults = await ocrPdfPages(doc, ocrPageNumbers, {
        language: options.ocrLanguage,
        signal,
        canvasFactory: options.ocrCanvasFactory,
        onProgress: (currentPage, ocrPageCount) =>
          onProgress?.({ phase: 'ocr', currentPage, pageCount, ocrPageCount }),
      });
      for (const page of pages) {
        const ocrResult = ocrResults.get(page.pageNumber);
        if (ocrResult !== undefined) {
          page.text = ocrResult.text;
          page.quality = evaluateTextQuality(ocrResult.text);
        }
      }
    }

    return {
      pageCount,
      pages,
      annotations,
      extractionMethod: deriveExtractionMethod(pages.map((page) => page.extractionMethod)),
      hasUsableText: pages.some((page) => page.quality.usable),
    };
}

/**
 * Loads and inspects a PDF completely locally (see inspectPdfDocument).
 * The document is released when the inspection finishes, succeeds or fails.
 */
export async function inspectPdf(
  input: Blob | ArrayBuffer | Uint8Array,
  options: PdfInspectOptions = {},
): Promise<PdfInspectionResult> {
  const { signal } = options;
  throwIfAborted(signal);

  const { task, doc } = await loadPdfDocument(input);
  try {
    throwIfAborted(signal);
    return await inspectPdfDocument(doc, options);
  } finally {
    // In pdf.js v6 the loading task owns the worker and the document.
    await releasePdfDocument(task);
  }
}
