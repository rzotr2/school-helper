import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import type { AnnotationLayerParameters } from 'pdfjs-dist/types/src/display/annotation_layer.js';
import type { PDFLinkService } from 'pdfjs-dist/types/web/pdf_link_service.js';

/**
 * pdf.js annotation layer integration for the viewer.
 *
 * Presents the raw annotation objects of one page as DOM elements via
 * the pdf.js AnnotationLayer: links with real targets, icon hotspots
 * for Text annotations, popup containers — the interactive
 * representation the canvas alone cannot provide.
 *
 * The canvas keeps painting annotation appearances (annotationMode:
 * ENABLE, the default render path); the layer only adds structure and
 * interaction, never painted visuals, so nothing is drawn twice. pdf.js
 * guarantees this by construction: FreeText gets DOM text only when it
 * has no appearance stream (the canvas paints nothing for those), Ink
 * strokes are transparent hit geometry, and Highlight/Stamp render as
 * empty hotspots over the canvas-painted appearance. Popup content
 * bubbles are the one thing the component API does not support: filling
 * them needs the full viewer app's comment manager, which the legacy
 * viewer bundle does not export.
 *
 * Node-safe: everything imported at runtime comes from the core legacy
 * build. The link service is passed in by the caller and typed via
 * type-only imports that are erased at runtime, so Node test suites can
 * import this module.
 */

/**
 * URLs of the pdf.js annotation icon SVGs (annotation-note.svg, …).
 * Vite emits the files and the imports resolve to their URLs; the layer
 * composes icon sources as `${imageResourcesPath}annotation-${name}.svg`,
 * so the shared directory prefix is what it needs. All icons are
 * imported eagerly so every icon a document can reference is emitted as
 * an asset.
 */
const annotationIconUrls = import.meta.glob('/pdfjs-dist/web/images/annotation-*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

function annotationIconResourcesPath(): string | undefined {
  let prefix: string | undefined;
  for (const url of Object.values(annotationIconUrls)) {
    if (typeof url !== 'string') {
      return undefined;
    }
    const slash = url.lastIndexOf('/');
    const candidate = slash >= 0 ? url.slice(0, slash + 1) : '';
    if (prefix === undefined) {
      prefix = candidate;
    } else if (prefix !== candidate) {
      // The layer assumes all icons share one directory; bail out
      // rather than render broken icon URLs.
      return undefined;
    }
  }
  return prefix;
}

export interface RenderPdfAnnotationLayerOptions {
  /** The div the annotation elements are appended to (replaced first). */
  container: HTMLDivElement;
  /** Page whose annotations to present. */
  page: PDFPageProxy;
  /**
   * The CSS viewport the caller renders the page with — the same object
   * the canvas is sized from. The layer positions every element as a
   * percentage of viewport.rawDims, so passing the canvas's viewport is
   * what keeps both aligned across page, zoom, fit and resize changes.
   */
  viewport: PageViewport;
  /** Link service resolving link targets (see pdfLinkService.ts). */
  linkService: PDFLinkService;
  /** Aborts a superseded render before it can touch the DOM. */
  signal?: AbortSignal;
}

/**
 * Renders the pdf.js annotation layer for one page into the container.
 * The container is emptied first, so re-rendering the same page (zoom,
 * fit, resize) replaces the old elements instead of stacking them.
 */
export async function renderPdfAnnotationLayer({
  container,
  page,
  viewport,
  linkService,
  signal,
}: RenderPdfAnnotationLayerOptions): Promise<void> {
  const annotations = await page.getAnnotations({ intent: 'display' });
  if (signal?.aborted) return;
  container.replaceChildren();
  // The layer writes its size and positions in raw page units and
  // resolves them at paint time through --total-scale-factor. Setting
  // --scale-factor/--user-unit per render is the standard viewer's
  // AnnotationLayerBuilder mechanism: it is what keeps the layer
  // aligned with the canvas across zoom, fit-width, fit-page and
  // resize changes without recomputing any geometry.
  container.style.setProperty('--scale-factor', String(viewport.scale));
  container.style.setProperty('--user-unit', String(viewport.userUnit));
  if (annotations.length === 0) {
    // No annotation elements: the layer still fills the page, exactly
    // like the standard viewer's AnnotationLayerBuilder.
    pdfjs.setLayerDimensions(container, viewport);
    return;
  }
  const layer = new pdfjs.AnnotationLayer({
    div: container,
    page,
    viewport,
    linkService,
    // The d.ts types these constructor parameters as required even though
    // the implementation treats them as optional. The viewer uses none of
    // them: no annotation editors, no form filling, no accessibility tree.
    accessibilityManager: undefined,
    annotationCanvasMap: undefined,
    annotationEditorUIManager: undefined,
    structTreeLayer: undefined,
    commentManager: undefined,
    annotationStorage: undefined,
  });
  const params: AnnotationLayerParameters = {
    viewport,
    div: container,
    annotations,
    page,
    linkService,
    // Annotation widgets are interactive form fields; the viewer does
    // not fill forms, matching the standard viewer's default.
    renderForms: false,
    imageResourcesPath: annotationIconResourcesPath(),
  };
  await layer.render(params);
}
