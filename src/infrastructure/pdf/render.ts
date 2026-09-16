import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';

/**
 * Renders one PDF page into a canvas at the given scale (CSS pixels per
 * PDF point; 1 = 72 dpi). The caller cancels the returned task when the
 * page changes or the viewer unmounts.
 *
 * The OCR path in ocr.ts keeps its own render call (canvas: null +
 * canvasContext), because it must work with non-DOM canvases in Node
 * verification. This helper serves the browser viewer with a real canvas
 * element.
 */
export function renderPdfPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): RenderTask {
  const viewport = page.getViewport({ scale });
  // pdf.js v6 does not resize a caller-provided canvas: the backing store
  // must match the render viewport, otherwise the page is clipped to the
  // canvas's previous (default 300x150) bitmap. The CSS size is separate
  // and stays the caller's job. Math.floor matches the official pdf.js
  // example and the OCR canvas in ocr.ts.
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  return page.render({ canvas, viewport });
}
