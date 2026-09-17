/**
 * Link service for the pdf.js annotation layer, built on the official
 * pdf.js web viewer link service.
 *
 * Browser-only: it imports pdfjs-dist's web viewer bundle, which is not
 * usable in Node (see pdfJsViewerGlobal.ts) and is never imported by the
 * Node test suites.
 *
 * The base PDFLinkService implements everything the annotation layer
 * calls (addLinkAttributes for external links, getDestinationHash for
 * internal ones, executeNamedAction for named actions). Two behaviors
 * are overridden for this viewer:
 *
 * - goToDestination resolves the destination with the same resolver the
 *   inspection pipeline uses and turns it into a viewer page change,
 *   instead of scrolling a full PdfViewer (which this app does not have).
 * - addLinkAttributes blocks non-navigation URL schemes (javascript:,
 *   data:, file: …) — the base class does no scheme sanitization, and a
 *   crafted PDF must not be able to activate such links.
 */
import { isSafeExternalLinkUrl } from './annotationOverlay';
import { resolveLinkTargetPage } from './inspect';
// Import order matters: pdfJsViewerGlobal publishes the pdf.js core on
// globalThis before the web viewer bundle (which destructures it at
// import time) evaluates.
import './pdfJsViewerGlobal';
import { EventBus, LinkTarget, PDFLinkService } from 'pdfjs-dist/legacy/web/pdf_viewer.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export class PdfViewerLinkService extends PDFLinkService {
  private readonly document: PDFDocumentProxy;
  private readonly onGoToPage: (pageNumber: number) => void;

  constructor(document: PDFDocumentProxy, onGoToPage: (pageNumber: number) => void) {
    super({
      eventBus: new EventBus(),
      // External links open in a new tab, never navigating the viewer away.
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: 'noopener noreferrer',
    });
    this.document = document;
    this.onGoToPage = onGoToPage;
    this.setDocument(document);
  }

  /**
   * Internal destinations navigate the viewer: the destination resolves
   * to a 1-based page number through the inspection pipeline's resolver
   * and the page change goes through the viewer's own state.
   */
  override async goToDestination(dest: string | unknown[]): Promise<void> {
    const pageNumber = await resolveLinkTargetPage(this.document, dest);
    if (pageNumber !== null) {
      this.onGoToPage(pageNumber);
    }
  }

  /**
   * Mirrors the base class's disabled-link pattern for URLs whose scheme
   * is not plain web navigation: the hotspot stays visible and focusable
   * but has no href and cannot activate.
   */
  override addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow = false): void {
    if (!isSafeExternalLinkUrl(url)) {
      link.href = '';
      link.title = `Blockierter Link: ${url}`;
      link.onclick = () => false;
      return;
    }
    super.addLinkAttributes(link, url, newWindow);
  }
}
