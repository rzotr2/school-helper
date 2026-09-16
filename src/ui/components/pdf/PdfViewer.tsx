/**
 * Reusable PDF viewer: renders the current page of an already-loaded PDF
 * onto a single canvas and provides the viewer toolbar (navigation, zoom,
 * fit, download, text panel, close).
 *
 * Presentation component — the parent owns everything application-level:
 * downloading, signed URLs, inspection/OCR and the PDFDocumentProxy
 * lifecycle. This component neither loads nor destroys documents and
 * contains no business logic. Annotation appearance is rendered by the
 * default pdf.js path (annotationMode: ENABLE).
 */
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Maximize,
  MoveHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { renderPdfPage } from '../../../infrastructure/pdf/render';
import type { PdfInspectionResult } from '../../../infrastructure/pdf/types';
import { Button } from '../Button';
import {
  VIEWER_ZOOM_MAX,
  VIEWER_ZOOM_MIN,
  describeViewerError,
  fitPageZoom,
  fitWidthZoom,
  initialViewerState,
  pageExtractionLabel,
  viewerStateReducer,
} from './viewerState';

export interface PdfViewerProps {
  /** Already-loaded document; the viewer renders it but never owns it. */
  pdfDocument: PDFDocumentProxy;
  /** Local inspection result of the same document (text panel content). */
  inspection: PdfInspectionResult;
  /** File name used by the download action. */
  downloadName: string;
  /** PDF bytes for the download action; used only to build an object URL. */
  downloadSource: Blob | ArrayBuffer | Uint8Array;
  /** Called when the user closes the viewer; navigation is the parent's job. */
  onClose: () => void;
}

export function PdfViewer({
  pdfDocument,
  inspection,
  downloadName,
  downloadSource,
  onClose,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const renderGenerationRef = useRef(0);
  // Whether the current zoom came from a fit action; only then does a
  // container resize re-apply the fit (manual zoom steps leave fit mode).
  const fitModeRef = useRef<'width' | 'page' | null>(null);
  const pageRef = useRef(1);
  const [renderErrorMessage, setRenderErrorMessage] = useState<string | null>(null);

  const [state, dispatch] = useReducer(
    viewerStateReducer,
    pdfDocument,
    (document) => ({ ...initialViewerState(), totalPages: document.numPages }),
  );
  pageRef.current = state.page;

  // A changed document resets the page and the render state.
  useEffect(() => {
    setRenderErrorMessage(null);
    dispatch({ type: 'SET_DOCUMENT', totalPages: pdfDocument.numPages });
  }, [pdfDocument]);

  // Render the current page at the current zoom. The generation counter and
  // the cancelled flag make sure a superseded render (page/zoom/document
  // changed or unmount) can never touch the canvas or report an error.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const generation = ++renderGenerationRef.current;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const pageNumber = state.page;
    const zoom = state.zoom;
    let renderTask: RenderTask | undefined;
    let cancelled = false;

    setRenderErrorMessage(null);
    dispatch({ type: 'RENDER_START' });

    void (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled || generation !== renderGenerationRef.current) return;
        // CSS size comes from the logical viewport; pdf.js sizes the canvas
        // backing store from the render viewport (scale × devicePixelRatio).
        const cssViewport = page.getViewport({ scale: zoom / 100 });
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;
        renderTask = renderPdfPage(page, canvas, (zoom / 100) * devicePixelRatio);
        await renderTask.promise;
        if (cancelled || generation !== renderGenerationRef.current) return;
        dispatch({ type: 'RENDER_DONE' });
      } catch (err) {
        if (cancelled || generation !== renderGenerationRef.current) return;
        console.error(`Failed to render page ${pageNumber}`, err);
        setRenderErrorMessage(describeViewerError(err));
        dispatch({ type: 'RENDER_ERROR' });
      }
    })();

    return () => {
      cancelled = true;
      // Cancelling a render superseded by a page/zoom/document change is
      // normal behavior, not an error.
      renderTask?.cancel();
    };
  }, [pdfDocument, state.page, state.zoom]);

  // Fit calculations live in viewerState.ts; the component only measures
  // the available viewport.
  const applyFit = useCallback(
    async (mode: 'width' | 'page') => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const pageNumber = state.page;
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const zoom =
          mode === 'width'
            ? fitWidthZoom(viewport.width, container.clientWidth)
            : fitPageZoom(
                viewport.width,
                viewport.height,
                container.clientWidth,
                container.clientHeight,
              );
        // A stale fit (page changed while awaiting) must not change the zoom.
        if (pageRef.current !== pageNumber) return;
        dispatch({ type: 'SET_ZOOM', zoom });
      } catch (err) {
        console.error('Failed to fit page', err);
      }
    },
    [pdfDocument, state.page],
  );

  // Re-apply the active fit when the available space changes. A
  // ResizeObserver only fires on real size changes, and dispatching an
  // unchanged zoom value does not restart rendering, so this cannot loop.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (fitModeRef.current !== null) void applyFit(fitModeRef.current);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [applyFit]);

  // Keyboard navigation. Form fields and modified shortcuts are left alone.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          dispatch({ type: 'STEP_PAGE', direction: -1 });
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          dispatch({ type: 'STEP_PAGE', direction: 1 });
          break;
        case '+':
        case '=':
          event.preventDefault();
          fitModeRef.current = null;
          dispatch({ type: 'STEP_ZOOM', direction: 1 });
          break;
        case '-':
          event.preventDefault();
          fitModeRef.current = null;
          dispatch({ type: 'STEP_ZOOM', direction: -1 });
          break;
        case 'Home':
          event.preventDefault();
          dispatch({ type: 'SET_PAGE', page: 1 });
          break;
        case 'End':
          event.preventDefault();
          dispatch({ type: 'SET_PAGE', page: state.totalPages });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.totalPages]);

  const handlePrevPage = () => dispatch({ type: 'STEP_PAGE', direction: -1 });
  const handleNextPage = () => dispatch({ type: 'STEP_PAGE', direction: 1 });

  const handleZoomOut = () => {
    fitModeRef.current = null;
    dispatch({ type: 'STEP_ZOOM', direction: -1 });
  };
  const handleZoomIn = () => {
    fitModeRef.current = null;
    dispatch({ type: 'STEP_ZOOM', direction: 1 });
  };
  const handleFitWidth = () => {
    fitModeRef.current = 'width';
    void applyFit('width');
  };
  const handleFitPage = () => {
    fitModeRef.current = 'page';
    void applyFit('page');
  };
  const handleToggleTextPanel = () =>
    dispatch({ type: 'SET_TEXT_PANEL', open: !state.textPanelOpen });

  const handleDownload = () => {
    // The object URL lives only for this download action and is revoked
    // after the browser has started the download. No new tab, no fetching.
    const blob = downloadSource instanceof Blob ? downloadSource : new Blob([downloadSource]);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const currentPageInspection = inspection.pages.find((page) => page.pageNumber === state.page);
  const currentPageText =
    currentPageInspection !== undefined && currentPageInspection.text.trim() !== ''
      ? currentPageInspection.text
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="px-2"
            onClick={handlePrevPage}
            disabled={state.page <= 1}
            title="Vorherige Seite"
            aria-label="Vorherige Seite"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="min-w-24 text-center text-sm tabular-nums text-slate-700">
            Seite {state.page} von {state.totalPages}
          </span>
          <Button
            variant="ghost"
            className="px-2"
            onClick={handleNextPage}
            disabled={state.page >= state.totalPages}
            title="Nächste Seite"
            aria-label="Nächste Seite"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="px-2"
            onClick={handleZoomOut}
            disabled={state.zoom <= VIEWER_ZOOM_MIN}
            title="Verkleinern"
            aria-label="Verkleinern"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="min-w-14 text-center text-sm tabular-nums text-slate-700">
            {Math.round(state.zoom)}%
          </span>
          <Button
            variant="ghost"
            className="px-2"
            onClick={handleZoomIn}
            disabled={state.zoom >= VIEWER_ZOOM_MAX}
            title="Vergrößern"
            aria-label="Vergrößern"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="px-2"
            onClick={handleFitWidth}
            title="An Seitenbreite anpassen"
            aria-label="An Seitenbreite anpassen"
          >
            <MoveHorizontal className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            className="px-2"
            onClick={handleFitPage}
            title="Ganze Seite einpassen"
            aria-label="Ganze Seite einpassen"
          >
            <Maximize className="w-4 h-4" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            className="px-2"
            onClick={handleToggleTextPanel}
            title={state.textPanelOpen ? 'Text ausblenden' : 'Text anzeigen'}
            aria-label="Text anzeigen"
            aria-pressed={state.textPanelOpen}
          >
            <FileText className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={handleDownload}
            title={`${downloadName} herunterladen`}
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button
            variant="ghost"
            className="px-2"
            onClick={onClose}
            title="Schließen"
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={scrollContainerRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full justify-center p-4">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Seite ${state.page}`}
            className="bg-white shadow-sm"
          />
        </div>
        {state.renderState === 'rendering' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Seite wird gerendert …
            </div>
          </div>
        )}
        {state.renderState === 'error' && renderErrorMessage !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-4">
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
              {renderErrorMessage}
            </div>
          </div>
        )}
      </div>

      {/* Extracted text of the current page only */}
      {state.textPanelOpen && (
        <div className="border-t border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 px-4 pt-3">
            <span className="text-sm font-medium text-slate-900">Seite {state.page}</span>
            {currentPageInspection !== undefined && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                {pageExtractionLabel(currentPageInspection.extractionMethod)}
              </span>
            )}
          </div>
          <pre className="m-4 mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
            {currentPageText ?? 'Kein Text auf dieser Seite.'}
          </pre>
        </div>
      )}
    </div>
  );
}
