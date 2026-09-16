import type { ImageLike } from 'tesseract.js';

/**
 * Client-side PDF inspection model.
 *
 * Everything in this module runs locally: pdf.js reads the PDF in the
 * browser (or in Node for verification) and Tesseract.js OCR runs in a
 * local worker. No PDF data ever leaves the device.
 */

/** How the text of a single page was obtained. */
export type PdfPageExtractionMethod = 'native-text' | 'ocr';

/** Document-level summary of the extraction methods used. */
export type PdfExtractionMethod = 'native-text' | 'ocr' | 'mixed';

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
  /** Human-readable reasons why the text was deemed unusable (empty when usable). */
  reasons: string[];
}

/** Inspection result of one page. */
export interface PdfPageInspection {
  /** 1-based page number. */
  pageNumber: number;
  /** The text kept for this page: native text layer or OCR output. */
  text: string;
  /** The raw native text layer ('' when the PDF has none). */
  nativeText: string;
  /** Quality evaluation of `text`. */
  quality: TextQuality;
  /** How `text` was obtained. */
  extractionMethod: PdfPageExtractionMethod;
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
}

/** Full result of the inspection pipeline. */
export interface PdfInspectionResult {
  pageCount: number;
  pages: PdfPageInspection[];
  annotations: PdfAnnotation[];
  /** 'native-text' (no OCR), 'ocr' (every page OCR'd) or 'mixed'. */
  extractionMethod: PdfExtractionMethod;
  /** True when at least one page ended up with usable text. */
  hasUsableText: boolean;
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
