import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// A separate type alias: inside `declare global` the name `pdfjsLib`
// resolves to the global variable being declared (a self-reference), so
// the import's type must be captured at module scope first.
type PdfJsLibrary = typeof pdfjsLib;

/**
 * Bootstrap for the pdf.js web viewer bundle.
 *
 * pdfjs-dist ships web/pdf_viewer.mjs as a self-contained bundle whose
 * ./web/pdfjs.js module destructures `globalThis.pdfjsLib` at import
 * time — the official viewer loads pdf.mjs as a classic script first,
 * and that is what publishes the global. In a bundled app nothing sets
 * it, so importing the viewer bundle directly throws.
 *
 * Importing this module before the viewer bundle (ES module requests
 * evaluate in declaration order) publishes the already-loaded pdf.js
 * core under the exact name the viewer bundle expects.
 */
declare global {
  /** pdf.js core namespace, consumed by pdfjs-dist's web viewer bundle. */
  var pdfjsLib: PdfJsLibrary;
}

globalThis.pdfjsLib = pdfjsLib;

export {};
