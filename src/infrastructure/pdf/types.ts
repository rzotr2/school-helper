import type { ImageLike } from 'tesseract.js';

/**
 * Client-side PDF inspection model.
 *
 * Everything in this module runs locally: pdf.js reads the PDF in the
 * browser (or in Node for verification) and Tesseract.js OCR runs in a
 * local worker. No PDF data ever leaves the device.
 */

/**
 * Lifecycle of the OCR representation of one page. Native text and OCR
 * text are independent representations; this only tracks the OCR side.
 *
 * 'not-needed': no OCR output exists yet. Automatic processing always
 * OCRs every page, so fresh inspections no longer produce this state — it
 * only appears when persisted content without OCR ('not-generated', e.g.
 * legacy documents) is restored for the viewer. It does NOT mean OCR is
 * impossible — explicit OCR may still be requested. 'pending'/'processing'
 * are transient: requested, then running. Only 'completed' and 'failed'
 * are final.
 */
export type OcrStatus = 'not-needed' | 'pending' | 'processing' | 'completed' | 'failed';

/** Result of the deterministic text-quality heuristic. */
export interface TextQuality {
  /** True when the text can be used without OCR. */
  usable: boolean;
  /** Character count of the trimmed text (code points). */
  charCount: number;
  /** Ratio of printable characters (0..1). */
  printableRatio: number;
  /** Ratio of whitespace characters (0..1). */
  whitespaceRatio: number;
  /** Ratio of letters and digits (0..1). */
  alphanumericRatio: number;
  /** Approximate word count: whitespace-separated tokens containing a letter or digit. */
  wordCount: number;
  /** Count of U+FFFD replacement characters (a strong corruption signal). */
  replacementCharCount: number;
  /**
   * Human-readable quality findings. Hard blockers (which make the text
   * unusable) plus diagnostics such as a low alphanumeric ratio, which do
   * not. Empty when no finding applies.
   */
  reasons: string[];
}

/** Inspection result of one page: two independent text representations. */
export interface PdfPageInspection {
  /** 1-based page number. */
  pageNumber: number;
  /**
   * The extracted native text layer ('' when the PDF has none). Always
   * preserved, even when unusable — OCR output is stored separately and
   * never overwrites this.
   */
  nativeText: string;
  /** Quality evaluation of `nativeText` (never reassigned from OCR output). */
  quality: TextQuality;
  /** OCR output for this page; null until OCR has produced any. */
  ocrText: string | null;
  /** Lifecycle of the OCR representation (see OcrStatus). */
  ocrStatus: OcrStatus;
}

/** Position of an annotation on its page (PDF coordinates, origin bottom-left). */
export interface PdfAnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Metadata of one PDF annotation. Kept separate from page text on purpose:
 * downstream processing must be able to distinguish "from the PDF text
 * layer" from "from OCR" from "from a PDF annotation".
 */
export interface PdfAnnotation {
  /** 1-based page number. */
  pageNumber: number;
  /** pdf.js annotation type name, e.g. 'TEXT', 'HIGHLIGHT', 'LINK'. */
  type: string;
  /** PDF subtype when exposed by pdf.js, e.g. 'Text', 'Highlight', 'Widget'. */
  subtype: string | null;
  /** Annotation text/content when the PDF exposes it. */
  content: string | null;
  /** Position on the page. */
  rect: PdfAnnotationRect | null;
  /** External target of a link annotation, when the PDF exposes one. */
  url: string | null;
  /** Resolved 1-based page number of a link's internal destination, when it resolves. */
  targetPageNumber: number | null;
}

/** Full result of the inspection pipeline. */
export interface PdfInspectionResult {
  pageCount: number;
  pages: PdfPageInspection[];
  annotations: PdfAnnotation[];
  /** True when at least one page has usable native text or completed OCR. */
  hasUsableText: boolean;
}

/**
 * The document-level "usable text" rule, shared by the pipeline and the
 * UI's explicit-OCR updates: a page counts when its native text is usable
 * or its OCR representation produced output.
 */
export function pagesHaveUsableText(pages: readonly PdfPageInspection[]): boolean {
  return pages.some((page) => page.quality.usable || page.ocrStatus === 'completed');
}

export type PdfInspectionProgress =
  | { phase: 'text-extraction'; currentPage: number; pageCount: number }
  | { phase: 'ocr'; currentPage: number; pageCount: number; ocrPageCount: number };

/** Canvas adapter handed to pdf.js when rendering pages for OCR. */
export interface OcrCanvasResult {
  /** 2D context pdf.js renders into. */
  context: CanvasRenderingContext2D;
  /**
   * Produces the Tesseract.js image source. Called AFTER rendering has
   * finished, so the image reflects the rendered page (a canvas element in
   * the browser, a PNG buffer in Node). Capturing it eagerly would yield a
   * blank image.
   */
  toImage: () => ImageLike;
}

/** Creates the canvas for one OCR render. Injectable so Node callers can verify. */
export type OcrCanvasFactory = (width: number, height: number) => OcrCanvasResult;

export interface PdfInspectOptions {
  /** Tesseract language(s) as a '+' separated list, e.g. 'deu+eng'. Default 'deu+eng'. */
  ocrLanguage?: string;
  /** Cancels processing. The rejection is always a PdfCancellationError. */
  signal?: AbortSignal;
  /** Progress callback (fires between pages; never for partial failures). */
  onProgress?: (progress: PdfInspectionProgress) => void;
  /** Canvas adapter for OCR page rendering. Defaults to a browser canvas. */
  ocrCanvasFactory?: OcrCanvasFactory;
}
