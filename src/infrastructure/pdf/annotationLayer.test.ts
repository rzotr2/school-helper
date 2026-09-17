/**
 * Annotation layer tests (jsdom).
 *
 * Present the pdf.js AnnotationLayer the way the viewer does — same
 * viewport as the canvas, official link service — and assert what lands
 * in the DOM: one element per annotation type, geometry derived from the
 * canvas viewport, popup containers for content-bearing annotations,
 * working link targets, and no painted visuals that would duplicate the
 * canvas.
 *
 * jsdom is the only environment where the layer's DOM can be asserted.
 * It is a devDependency of this project (see package.json).
 */
/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { PDFDocumentProxy, PageViewport } from 'pdfjs-dist';
import { renderPdfAnnotationLayer } from './annotationLayer';
import { loadPdfDocument, releasePdfDocument } from './load';
import { annotatedTypesPdf, linkedTextPdf } from './pdfFixtures';
import { PdfViewerLinkService } from './pdfLinkService';

/** Renders the annotation layer for one page exactly like the viewer does. */
async function renderLayer(
  doc: PDFDocumentProxy,
  pageNumber = 1,
  scale = 1,
): Promise<{ container: HTMLDivElement; viewport: PageViewport; linkService: PdfViewerLinkService }> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const container = document.createElement('div');
  const linkService = new PdfViewerLinkService(doc, () => {});
  await renderPdfAnnotationLayer({ container, page, viewport, linkService });
  return { container, viewport, linkService };
}

// The fixture page is US Letter: 612 x 792 raw page units.
const RAW_PAGE_WIDTH = 612;
const RAW_PAGE_HEIGHT = 792;

describe('renderPdfAnnotationLayer', () => {
  it('presents Text, Link, FreeText, Ink, Highlight and Stamp annotations as DOM elements', async () => {
    const { task, doc } = await loadPdfDocument(annotatedTypesPdf());
    try {
      const { container } = await renderLayer(doc);

      // Two link annotations: an external URI link and an internal one.
      // The pdf.js layer structure is a section.linkAnnotation wrapping
      // the anchor; internal links are marked on the section.
      const linkSections = container.querySelectorAll('section.linkAnnotation');
      expect(linkSections).toHaveLength(2);
      const external = Array.from(linkSections).find(
        (section) => !section.hasAttribute('data-internal-link'),
      );
      const internal = Array.from(linkSections).find((section) =>
        section.hasAttribute('data-internal-link'),
      );
      expect(external).toBeDefined();
      expect(internal).toBeDefined();
      const externalAnchor = external?.querySelector('a');
      expect(externalAnchor?.getAttribute('href')).toBe('https://example.com/ziel');
      expect(externalAnchor?.getAttribute('target')).toBe('_blank');
      expect(externalAnchor?.getAttribute('rel') ?? '').toContain('noopener');
      expect(internal?.querySelector('a')?.getAttribute('href') ?? '').toContain('#');

      // Text annotation: a hotspot with the pdf.js note icon.
      const textIcon = container.querySelector('.textAnnotation img');
      expect(textIcon).not.toBeNull();
      expect(textIcon?.getAttribute('src')).toMatch(/annotation-note\.svg$/);

      // Three FreeText annotations: one element each.
      expect(container.querySelectorAll('.freeTextAnnotation')).toHaveLength(3);

      // Ink: the strokes are interaction geometry, never painted (the
      // canvas paints the appearance).
      const inkGroup = container.querySelector('.inkAnnotation g');
      expect(inkGroup).not.toBeNull();
      expect(inkGroup?.getAttribute('stroke')).toBe('transparent');
      expect(inkGroup?.getAttribute('fill')).toBe('transparent');
      // One polyline per ink stroke. The strokes are created with a
      // prefixed qualified name (svg:polyline), which jsdom's selector
      // engine does not match by tag name — the points attribute does.
      expect(inkGroup?.querySelectorAll('[points]')).toHaveLength(2);

      // Highlight: an element with no painted visuals.
      const highlight = container.querySelector('.highlightAnnotation');
      expect(highlight).not.toBeNull();

      // Stamp: an image-role element.
      const stamp = container.querySelector('.stampAnnotation');
      expect(stamp).not.toBeNull();
      expect(stamp?.getAttribute('role')).toBe('img');
    } finally {
      await releasePdfDocument(task);
    }
  });

  it('positions layer elements from the same viewport the canvas uses', async () => {
    const { task, doc } = await loadPdfDocument(annotatedTypesPdf());
    try {
      // 150 % zoom: the cssViewport the viewer hands to both the canvas
      // sizing and the annotation layer.
      const { container, viewport } = await renderLayer(doc, 1, 1.5);
      expect(viewport.width).toBe(918);
      expect(viewport.height).toBe(1188);

      // The layer writes its dimensions in RAW page units and applies
      // the zoom through the CSS variable chain the official viewer
      // uses: --total-scale-factor = --scale-factor * --user-unit, set
      // per render from the viewport (the AnnotationLayerBuilder
      // mechanism). The CSS resolves the expression to 918 x 1188 at
      // 150 % — the same CSS size as the canvas.
      expect(container.style.getPropertyValue('--scale-factor')).toBe('1.5');
      expect(container.style.getPropertyValue('--user-unit')).toBe('1');
      expect(container.style.width).toBe(
        `round(down, var(--total-scale-factor) * ${RAW_PAGE_WIDTH}px, var(--scale-round-x))`,
      );
      expect(container.style.height).toBe(
        `round(down, var(--total-scale-factor) * ${RAW_PAGE_HEIGHT}px, var(--scale-round-y))`,
      );

      // The external link rect [72 700 272 730] (PDF, bottom-left
      // origin). The layer positions it as percentages of the RAW page
      // dimensions — the percentages are zoom-independent by design and
      // the zoom only scales the layer container.
      const external = Array.from(
        container.querySelectorAll<HTMLElement>('section.linkAnnotation'),
      ).find((section) => !section.hasAttribute('data-internal-link'));
      expect(external).toBeDefined();
      expect(Number.parseFloat(external?.style.left ?? '')).toBeCloseTo(
        (72 / RAW_PAGE_WIDTH) * 100,
        3,
      );
      expect(Number.parseFloat(external?.style.top ?? '')).toBeCloseTo(
        ((RAW_PAGE_HEIGHT - 730) / RAW_PAGE_HEIGHT) * 100,
        3,
      );
      expect(Number.parseFloat(external?.style.width ?? '')).toBeCloseTo(
        (200 / RAW_PAGE_WIDTH) * 100,
        3,
      );
      expect(Number.parseFloat(external?.style.height ?? '')).toBeCloseTo(
        (30 / RAW_PAGE_HEIGHT) * 100,
        3,
      );
    } finally {
      await releasePdfDocument(task);
    }
  });

  it('navigates internal links through the link service to the resolved page', async () => {
    const { task, doc } = await loadPdfDocument(linkedTextPdf());
    try {
      const visited: number[] = [];
      const { container } = await (async () => {
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const layerContainer = document.createElement('div');
        const linkService = new PdfViewerLinkService(doc, (pageNumber) =>
          visited.push(pageNumber),
        );
        await renderPdfAnnotationLayer({
          container: layerContainer,
          page,
          viewport,
          linkService,
        });
        return { container: layerContainer };
      })();

      const internalAnchor = container.querySelector(
        'section.linkAnnotation[data-internal-link] > a',
      );
      expect(internalAnchor).not.toBeNull();

      // Clicking the anchor runs the link service, which resolves the
      // destination with the inspection pipeline's resolver.
      internalAnchor?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(visited).toEqual([2]);
    } finally {
      await releasePdfDocument(task);
    }
  });

  it('never paints annotation visuals into the layer twice', async () => {
    const { task, doc } = await loadPdfDocument(annotatedTypesPdf());
    try {
      const { container } = await renderLayer(doc);

      // FreeText DOM text appears only for FreeTexts WITHOUT an
      // appearance stream (the canvas paints nothing for those, so the
      // layer is their single text copy). The fixture's third FreeText
      // ('Mit Erscheinungsbild') has a /AP the canvas paints — the
      // layer must not duplicate it.
      const freeTextContents = Array.from(
        container.querySelectorAll('.annotationTextContent'),
      ).map((element) => element.textContent ?? '');
      expect(freeTextContents).toHaveLength(2);
      expect(freeTextContents).toContain('Freitext Notiz');
      expect(freeTextContents).toContain('привіт');
      expect(freeTextContents.join(' ')).not.toContain('Mit Erscheinungsbild');

      // Ink strokes are transparent interaction geometry — the canvas
      // appearance is the single painted copy.
      for (const group of container.querySelectorAll('.inkAnnotation g')) {
        expect(group.getAttribute('stroke')).toBe('transparent');
      }

      // Highlight and Stamp: no painted visuals at all (the highlight's
      // yellow fill and the stamp's appearance live only on the canvas).
      const highlight = container.querySelector('.highlightAnnotation');
      expect(highlight?.querySelectorAll('mark, svg, img, canvas')).toHaveLength(0);
      const stamp = container.querySelector('.stampAnnotation');
      expect(stamp?.querySelectorAll('mark, svg, img, canvas')).toHaveLength(0);
    } finally {
      await releasePdfDocument(task);
    }
  });

  it('creates popup containers for content-bearing annotations and exposes contents', async () => {
    const { task, doc } = await loadPdfDocument(annotatedTypesPdf());
    try {
      const { container } = await renderLayer(doc);

      // Text, the three FreeTexts, Highlight and Stamp carry contents —
      // the Ink annotation has none. Each gets a popup container.
      const popups = container.querySelectorAll('.popupAnnotation');
      expect(popups).toHaveLength(6);
      for (const popup of popups) {
        expect(popup.getAttribute('role')).toBe('comment');
        expect(popup.hasAttribute('hidden')).toBe(true);
        expect(popup.getAttribute('aria-controls') ?? '').not.toBe('');
        // The content bubbles stay empty: filling them requires the full
        // viewer app's comment manager, which the component bundle does
        // not export. The layer's own copy of the contents (the FreeText
        // DOM text) is asserted below.
        expect(popup.textContent ?? '').toBe('');
      }

      // The annotation contents the viewer actually exposes: the two
      // appearance-less FreeTexts are selectable text in the layer.
      const texts = Array.from(container.querySelectorAll('.annotationTextContent')).map(
        (element) => element.textContent ?? '',
      );
      expect(texts).toContain('Freitext Notiz');
      expect(texts).toContain('привіт');
    } finally {
      await releasePdfDocument(task);
    }
  });

  it('renders unsafe link URLs inert (link service guard)', async () => {
    const { task, doc } = await loadPdfDocument(linkedTextPdf());
    try {
      const linkService = new PdfViewerLinkService(doc, () => {});
      const link = document.createElement('a');
      linkService.addLinkAttributes(link, 'javascript:alert(1)');

      // Mirrors pdf.js's disabled-link pattern: no href, a "blocked"
      // title, and a click handler that never activates.
      expect(link.getAttribute('href')).toBe('');
      expect(link.title).toBe('Blockierter Link: javascript:alert(1)');
      expect(typeof link.onclick).toBe('function');
      const prevented = link.onclick?.call(link, new MouseEvent('click')) ?? true;
      expect(prevented).toBe(false);

      // Safe URLs keep the standard attributes (open in a new tab).
      const safe = document.createElement('a');
      linkService.addLinkAttributes(safe, 'https://example.com/skript.pdf');
      expect(safe.getAttribute('href')).toBe('https://example.com/skript.pdf');
      expect(safe.getAttribute('target')).toBe('_blank');
    } finally {
      await releasePdfDocument(task);
    }
  });
});

// The Apple-authored document is a compatibility fixture, not a
// requirement: the layer must present whatever annotations pdf.js parses,
// independently of the authoring application.
const APPLE_PDF_PATH = path.join(homedir(), 'Downloads', 'school-helper-pdf-test.pdf');

describe.skipIf(!existsSync(APPLE_PDF_PATH))(
  'annotation layer on a real Apple-authored PDF (generic compatibility)',
  () => {
    it('presents every annotation the Apple document carries', async () => {
      const bytes = new Uint8Array(readFileSync(APPLE_PDF_PATH));
      const { task, doc } = await loadPdfDocument(bytes);
      try {
        const page = await doc.getPage(1);
        const raw = await page.getAnnotations({ intent: 'display' });
        expect(raw).toHaveLength(14);
        expect(
          raw
            .map((annotation) => annotation.subtype)
            .sort()
            .join(','),
        ).toBe(
          [...Array(10).fill('Stamp'), 'Highlight', ...Array(3).fill('FreeText')]
            .sort()
            .join(','),
        );

        // The generic layer renders all of them, authoring app unknown.
        const { container } = await renderLayer(doc);
        expect(container.querySelectorAll('.stampAnnotation')).toHaveLength(10);
        expect(container.querySelectorAll('.highlightAnnotation')).toHaveLength(1);
        expect(container.querySelectorAll('.freeTextAnnotation')).toHaveLength(3);
      } finally {
        await releasePdfDocument(task);
      }
    });
  },
);
