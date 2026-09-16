/**
 * Pure state and presentation helpers for the PDF viewer.
 *
 * No React, no DOM, no pdf.js: everything here is unit-testable without a
 * browser. The PdfViewer component owns canvas elements, render tasks and
 * AbortControllers — this module only holds numbers, booleans and labels.
 */
import type { PdfPageExtractionMethod } from '../../../infrastructure/pdf/types';
import { PdfCancellationError, PdfInspectionError } from '../../../infrastructure/pdf/errors';

// ── Zoom ────────────────────────────────────────────────────────────────────

/** Zoom range and step, in percent (100 = PDF points at 1:1 CSS pixels). */
export const VIEWER_ZOOM_MIN = 50;
export const VIEWER_ZOOM_MAX = 300;
export const VIEWER_ZOOM_STEP = 10;

/**
 * Clamps a zoom percentage into the allowed range. Non-finite input falls
 * back to the minimum zoom.
 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return VIEWER_ZOOM_MIN;
  return Math.min(VIEWER_ZOOM_MAX, Math.max(VIEWER_ZOOM_MIN, zoom));
}

/** Steps the zoom by one step and clamps into the allowed range. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(zoom + direction * VIEWER_ZOOM_STEP);
}

// ── Page navigation ─────────────────────────────────────────────────────────

/**
 * Clamps a 1-based page number into [1, totalPages]. Non-finite input and
 * documents without pages fall back to page 1; fractional pages truncate.
 */
export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page) || !Number.isFinite(totalPages) || totalPages < 1) return 1;
  return Math.min(totalPages, Math.max(1, Math.trunc(page)));
}

// ── Fit calculations ────────────────────────────────────────────────────────

/**
 * Zoom percentage that fits the page width into the viewport. Inputs are
 * plain numbers (PDF points and CSS pixels); measuring the viewport is the
 * caller's job. Degenerate input falls back to the minimum zoom.
 */
export function fitWidthZoom(pageWidthPt: number, viewportWidthPx: number): number {
  if (
    !Number.isFinite(pageWidthPt) ||
    pageWidthPt <= 0 ||
    !Number.isFinite(viewportWidthPx) ||
    viewportWidthPx <= 0
  ) {
    return VIEWER_ZOOM_MIN;
  }
  return clampZoom((viewportWidthPx / pageWidthPt) * 100);
}

/**
 * Zoom percentage that fits the whole page into the viewport (the tighter
 * of the width and height fits). See fitWidthZoom for the input contract.
 */
export function fitPageZoom(
  pageWidthPt: number,
  pageHeightPt: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
): number {
  if (
    !Number.isFinite(pageWidthPt) ||
    pageWidthPt <= 0 ||
    !Number.isFinite(pageHeightPt) ||
    pageHeightPt <= 0 ||
    !Number.isFinite(viewportWidthPx) ||
    viewportWidthPx <= 0 ||
    !Number.isFinite(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return VIEWER_ZOOM_MIN;
  }
  return clampZoom(
    Math.min((viewportWidthPx / pageWidthPt) * 100, (viewportHeightPx / pageHeightPt) * 100),
  );
}

// ── Labels ──────────────────────────────────────────────────────────────────

/**
 * German UI label for how the text of one page was obtained. Page-specific
 * on purpose: mixed documents get a per-page label, never a document-level
 * "mixed" string.
 */
export function pageExtractionLabel(method: PdfPageExtractionMethod): string {
  return method === 'native-text' ? 'Textebene' : 'OCR';
}

// ── Errors ──────────────────────────────────────────────────────────────────

// These strings mirror the documented messages of our own infrastructure
// (load.ts, documents.ts), so matching them is reliable — no guessing from
// arbitrary error text.
const INVALID_PDF_MESSAGE = 'Invalid PDF file';
const DOCUMENT_NOT_FOUND_MESSAGE = 'Document not found';
const DOCUMENT_DOWNLOAD_FAILED_MESSAGE = 'Failed to download document';

const CANCELLED_MESSAGE = 'Verarbeitung abgebrochen.';
const INVALID_PDF_UI_MESSAGE = 'Ungültige PDF-Datei.';
const DOCUMENT_NOT_FOUND_UI_MESSAGE = 'Dokument wurde nicht gefunden.';
const DOCUMENT_DOWNLOAD_FAILED_UI_MESSAGE =
  'Das Dokument konnte nicht geladen werden. Bitte versuche es erneut.';
const GENERIC_UI_MESSAGE = 'Ein unbekannter Fehler ist aufgetreten.';

/**
 * Maps known errors into stable German UI messages. Unknown errors fall
 * back to a generic message — raw Supabase/PDF.js/fetch errors never reach
 * the UI. Other PdfInspectionErrors keep their own message: the
 * infrastructure guarantees it is safe to show.
 */
export function describeViewerError(error: unknown): string {
  if (error instanceof PdfCancellationError) return CANCELLED_MESSAGE;
  // An aborted fetch rejects with an AbortError DOMException.
  if (error instanceof Error && error.name === 'AbortError') return CANCELLED_MESSAGE;
  if (error instanceof PdfInspectionError) {
    if (error.message === INVALID_PDF_MESSAGE) return INVALID_PDF_UI_MESSAGE;
    return error.message;
  }
  if (error instanceof Error) {
    if (error.message === DOCUMENT_NOT_FOUND_MESSAGE) return DOCUMENT_NOT_FOUND_UI_MESSAGE;
    if (error.message === DOCUMENT_DOWNLOAD_FAILED_MESSAGE) return DOCUMENT_DOWNLOAD_FAILED_UI_MESSAGE;
  }
  return GENERIC_UI_MESSAGE;
}

// ── Reducer ─────────────────────────────────────────────────────────────────

export type ViewerRenderState = 'idle' | 'rendering' | 'ready' | 'error';

export interface ViewerState {
  /** Current 1-based page. */
  page: number;
  /** Page count of the loaded document (0 before a document is set). */
  totalPages: number;
  /** Zoom in percent, always within [VIEWER_ZOOM_MIN, VIEWER_ZOOM_MAX]. */
  zoom: number;
  /** Whether the extracted-text panel is visible. */
  textPanelOpen: boolean;
  /** Render/loading state of the current page. */
  renderState: ViewerRenderState;
}

export type ViewerAction =
  | { type: 'SET_DOCUMENT'; totalPages: number }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'STEP_PAGE'; direction: 1 | -1 }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'STEP_ZOOM'; direction: 1 | -1 }
  | { type: 'SET_TEXT_PANEL'; open: boolean }
  | { type: 'RENDER_START' }
  | { type: 'RENDER_DONE' }
  | { type: 'RENDER_ERROR' }
  | { type: 'ABORT' };

export function initialViewerState(): ViewerState {
  return { page: 1, totalPages: 0, zoom: 100, textPanelOpen: false, renderState: 'idle' };
}

/**
 * Pure reducer for the viewer's local state. No async behavior, no PDF.js
 * objects, canvases, Blobs or AbortControllers — those stay in the
 * component. Render transitions are driven by explicit RENDER_* actions;
 * ABORT clears transient render state so a cancelled render can never
 * leave the viewer stuck loading.
 */
export function viewerStateReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'SET_DOCUMENT':
      return { ...state, totalPages: action.totalPages, page: 1, renderState: 'idle' };
    case 'SET_PAGE':
      return { ...state, page: clampPage(action.page, state.totalPages) };
    case 'STEP_PAGE':
      return { ...state, page: clampPage(state.page + action.direction, state.totalPages) };
    case 'SET_ZOOM':
      return { ...state, zoom: clampZoom(action.zoom) };
    case 'STEP_ZOOM':
      return { ...state, zoom: stepZoom(state.zoom, action.direction) };
    case 'SET_TEXT_PANEL':
      return { ...state, textPanelOpen: action.open };
    case 'RENDER_START':
      return { ...state, renderState: 'rendering' };
    case 'RENDER_DONE':
      return { ...state, renderState: 'ready' };
    case 'RENDER_ERROR':
      return { ...state, renderState: 'error' };
    case 'ABORT':
      return { ...state, renderState: 'idle' };
  }
}
