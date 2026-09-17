import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { PdfInspectionError, throwIfAborted } from './errors';
import { loadPdfDocument, releasePdfDocument } from './load';
import { ocrPdfPages } from './ocr';
import { evaluateTextQuality } from './textQuality';
import type {
  PdfAnnotation,
  PdfInspectOptions,
  PdfInspectionResult,
  PdfPageInspection,
} from './types';
import { pagesHaveUsableText } from './types';

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
  /** External URL of a link annotation (pdf.js: `url`). */
  url?: unknown;
  /**
   * Internal destination of a link annotation (pdf.js: `dest`): a
   * named-destination string or an explicit destination array.
   */
  dest?: unknown;
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
 * Resolves a link annotation's internal destination into a 1-based page
 * number. Named destinations go through the document's name tree
 * (getDestination); explicit destination arrays are used as-is. Anything
 * that cannot be resolved yields null — annotation targets are an
 * enrichment of the metadata, never a blocker for the pipeline.
 *
 * Exported for the viewer's link service (pdfLinkService.ts), which uses
 * the same resolver so internal links navigate exactly to what the
 * inspection pipeline reports.
 */
export async function resolveLinkTargetPage(
  doc: PDFDocumentProxy,
  dest: unknown,
): Promise<number | null> {
  let rawDestination: unknown = null;
  try {
    rawDestination =
      typeof dest === 'string' ? await doc.getDestination(dest) : Array.isArray(dest) ? dest : null;
  } catch {
    return null;
  }
  if (rawDestination === null || !Array.isArray(rawDestination)) return null;

  // An explicit destination starts with the page reference ({num, gen}).
  const first: unknown = rawDestination[0];
  if (typeof first !== 'object' || first === null) return null;
  const num = (first as { num?: unknown }).num;
  if (typeof num !== 'number') return null;
  const gen = (first as { gen?: unknown }).gen;

  try {
    const pageIndex = await doc.getPageIndex({ num, gen: typeof gen === 'number' ? gen : 0 });
    return Math.min(doc.numPages, Math.max(1, pageIndex + 1));
  } catch {
    return null;
  }
}

/**
 * Maps one raw pdf.js annotation. Note: pdf.js may normalize the rect (an
 * appearance-less Text annotation gets a small icon rect, highlights get
 * their QuadPoints bounding box) — the pipeline captures it as provided.
 * Link annotations additionally carry their target: the external URL as
 * given, or the internal destination resolved to a page number.
 */
async function mapAnnotation(
  doc: PDFDocumentProxy,
  pageNumber: number,
  annotation: RawPdfAnnotation,
): Promise<PdfAnnotation> {
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
  const type =
    typeof annotation.annotationType === 'number'
      ? annotationTypeName(annotation.annotationType)
      : 'UNKNOWN';
  const url = typeof annotation.url === 'string' ? annotation.url : null;
  // External links already have their URL; only internal links need page
  // resolution (and a link carrying both keeps the external URL).
  const targetPageNumber =
    type === 'LINK' && url === null ? await resolveLinkTargetPage(doc, annotation.dest) : null;
  return {
    pageNumber,
    type,
    subtype: typeof annotation.subtype === 'string' ? annotation.subtype : null,
    content: annotationContent(annotation),
    rect,
    url,
    targetPageNumber,
  };
}

/**
 * Inspects an already loaded PDF completely locally: extracts the native
 * text layer page by page, evaluates its quality with the deterministic
 * heuristic, collects per-page annotations, and OCRs every page.
 *
 * Every page carries its two text representations independently: the
 * native text layer is always preserved (even when unusable), and OCR
 * output is stored alongside it — it never overwrites nativeText, and the
 * page quality always describes nativeText. Automatic OCR runs for every
 * page regardless of the native quality, so a processed document always
 * has both representations; pages whose OCR fails keep their native text
 * and end with ocrStatus 'failed'.
 *
 * Does not own the document: the caller loads it (loadPdfDocument) and
 * releases it (releasePdfDocument), so one load can serve both the
 * inspection and page rendering.
 *
 * Rejections are always PdfInspectionError, or PdfCancellationError when
 * the signal aborts. Raw library errors are mapped to messages that are
 * safe to show.
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
      } catch {
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
      } catch {
        throw new PdfInspectionError(`Text extraction failed on page ${pageNumber}`);
      }

      try {
        const rawAnnotations = await page.getAnnotations({ intent: 'display' });
        for (const raw of rawAnnotations) {
          try {
            annotations.push(await mapAnnotation(doc, pageNumber, raw));
          } catch {
            // One bad annotation must not discard the others.
          }
        }
      } catch {
        // Annotation extraction must not block the rest of the pipeline:
        // continue without annotation data for this page.
      }

      // The native text is always kept, usable or not. The quality only
      // describes the native representation — it never decides whether OCR
      // runs: automatic processing OCRs every page, and the OCR result is
      // an additional representation, never a replacement.
      const quality = evaluateTextQuality(nativeText);
      pages.push({
        pageNumber,
        nativeText,
        quality,
        ocrText: null,
        ocrStatus: 'pending',
      });
    }

    // Every page is OCRed — usable native text or not — so the finished
    // document carries both representations for every page.
    const ocrPageNumbers = pages.map((page) => page.pageNumber);

    if (ocrPageNumbers.length > 0) {
      const ocrOutcome = await ocrPdfPages(doc, ocrPageNumbers, {
        language: options.ocrLanguage,
        signal,
        canvasFactory: options.ocrCanvasFactory,
        onProgress: (currentPage, ocrPageCount) => {
          const page = pages.find((candidate) => candidate.pageNumber === currentPage);
          if (page !== undefined) page.ocrStatus = 'processing';
          onProgress?.({ phase: 'ocr', currentPage, pageCount, ocrPageCount });
        },
      });
      for (const page of pages) {
        const ocrResult = ocrOutcome.textByPage.get(page.pageNumber);
        if (ocrResult !== undefined) {
          page.ocrText = ocrResult.text;
          page.ocrStatus = 'completed';
        } else if (ocrOutcome.failedPages.has(page.pageNumber)) {
          // The native text stays untouched; only the OCR side failed.
          page.ocrStatus = 'failed';
        }
      }
    }

    return {
      pageCount,
      pages,
      annotations,
      hasUsableText: pagesHaveUsableText(pages),
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
