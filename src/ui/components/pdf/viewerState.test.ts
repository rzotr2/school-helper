import { describe, it, expect } from 'vitest';
import {
  VIEWER_ZOOM_MAX,
  VIEWER_ZOOM_MIN,
  VIEWER_ZOOM_STEP,
  clampPage,
  clampZoom,
  describeViewerError,
  fitPageZoom,
  fitWidthZoom,
  initialViewerState,
  pageExtractionLabel,
  stepZoom,
  viewerStateReducer,
} from './viewerState';
import { PdfCancellationError, PdfInspectionError } from '../../../infrastructure/pdf/errors';

describe('clampPage', () => {
  it('clamps values below the minimum to page 1', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-3, 5)).toBe(1);
  });

  it('clamps values above the maximum to totalPages', () => {
    expect(clampPage(6, 5)).toBe(5);
    expect(clampPage(99, 5)).toBe(5);
  });

  it('keeps a valid page unchanged', () => {
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(1, 5)).toBe(1);
    expect(clampPage(5, 5)).toBe(5);
  });

  it('handles single-page documents', () => {
    expect(clampPage(2, 1)).toBe(1);
    expect(clampPage(0, 1)).toBe(1);
  });

  it('handles degenerate input safely', () => {
    expect(clampPage(Number.NaN, 5)).toBe(1);
    expect(clampPage(2, 0)).toBe(1);
    expect(clampPage(2.9, 5)).toBe(2); // fractional pages truncate
  });
});

describe('zoom helpers', () => {
  it('zooms in and out by one step', () => {
    expect(stepZoom(100, 1)).toBe(110);
    expect(stepZoom(100, -1)).toBe(90);
  });

  it('clamps at the minimum boundary', () => {
    expect(stepZoom(50, -1)).toBe(VIEWER_ZOOM_MIN);
    expect(stepZoom(55, -1)).toBe(VIEWER_ZOOM_MIN); // 45 < 50
  });

  it('clamps at the maximum boundary', () => {
    expect(stepZoom(300, 1)).toBe(VIEWER_ZOOM_MAX);
    expect(stepZoom(295, 1)).toBe(VIEWER_ZOOM_MAX); // 305 > 300
  });

  it('clamps values outside the valid range', () => {
    expect(clampZoom(10)).toBe(VIEWER_ZOOM_MIN);
    expect(clampZoom(400)).toBe(VIEWER_ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(VIEWER_ZOOM_MIN);
    expect(clampZoom(200)).toBe(200);
  });

  it('exposes the configured range and step', () => {
    expect(VIEWER_ZOOM_MIN).toBe(50);
    expect(VIEWER_ZOOM_MAX).toBe(300);
    expect(VIEWER_ZOOM_STEP).toBe(10);
  });
});

describe('fit calculations', () => {
  it('fits a portrait page into the viewport width', () => {
    // A4 portrait: 595 x 842 pt.
    expect(fitWidthZoom(595, 800)).toBeCloseTo((800 / 595) * 100); // ≈134
  });

  it('fits a landscape page into the viewport width', () => {
    // A4 landscape: 842 x 595 pt.
    expect(fitWidthZoom(842, 800)).toBeCloseTo((800 / 842) * 100); // ≈95
  });

  it('clamps a very small calculated zoom to the minimum', () => {
    expect(fitWidthZoom(2000, 100)).toBe(VIEWER_ZOOM_MIN); // 5% raw
    expect(fitPageZoom(2000, 2000, 100, 100)).toBe(VIEWER_ZOOM_MIN); // 5% raw
  });

  it('clamps a very large calculated zoom to the maximum', () => {
    expect(fitWidthZoom(200, 2000)).toBe(VIEWER_ZOOM_MAX); // 1000% raw
    expect(fitPageZoom(100, 100, 2000, 2000)).toBe(VIEWER_ZOOM_MAX); // 2000% raw
  });

  it('fit page uses the tighter of the width and height fits', () => {
    // A4 portrait in an 800 x 600 viewport: the height fit (600/842 ≈ 71%)
    // is tighter than the width fit (800/595 ≈ 134%).
    expect(fitPageZoom(595, 842, 800, 600)).toBeCloseTo((600 / 842) * 100);
  });

  it('falls back to the minimum zoom for degenerate input', () => {
    expect(fitWidthZoom(0, 800)).toBe(VIEWER_ZOOM_MIN);
    expect(fitWidthZoom(595, 0)).toBe(VIEWER_ZOOM_MIN);
    expect(fitPageZoom(595, 0, 800, 600)).toBe(VIEWER_ZOOM_MIN);
    expect(fitPageZoom(595, 842, 800, Number.NaN)).toBe(VIEWER_ZOOM_MIN);
  });
});

describe('pageExtractionLabel', () => {
  it('labels native text pages', () => {
    expect(pageExtractionLabel('native-text')).toBe('Textebene');
  });

  it('labels OCR pages', () => {
    expect(pageExtractionLabel('ocr')).toBe('OCR');
  });
});

describe('describeViewerError', () => {
  it('maps cancellation to the German cancellation message', () => {
    expect(describeViewerError(new PdfCancellationError())).toBe('Verarbeitung abgebrochen.');
  });

  it('maps an aborted fetch (AbortError) to the cancellation message', () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    expect(describeViewerError(abortError)).toBe('Verarbeitung abgebrochen.');
  });

  it('maps the invalid-PDF inspection error to German', () => {
    expect(describeViewerError(new PdfInspectionError('Invalid PDF file'))).toBe(
      'Ungültige PDF-Datei.',
    );
  });

  it('keeps other inspection messages (guaranteed safe to show)', () => {
    expect(describeViewerError(new PdfInspectionError('OCR failed on page 2'))).toBe(
      'OCR failed on page 2',
    );
  });

  it('maps a missing document to German', () => {
    expect(describeViewerError(new Error('Document not found'))).toBe('Dokument wurde nicht gefunden.');
  });

  it('maps a failed download to German', () => {
    expect(describeViewerError(new Error('Failed to download document'))).toBe(
      'Das Dokument konnte nicht geladen werden. Bitte versuche es erneut.',
    );
  });

  it('falls back to the generic message for unknown errors', () => {
    expect(describeViewerError(new Error('some supabase internals'))).toBe(
      'Ein unbekannter Fehler ist aufgetreten.',
    );
    expect(describeViewerError('boom')).toBe('Ein unbekannter Fehler ist aufgetreten.');
    expect(describeViewerError(null)).toBe('Ein unbekannter Fehler ist aufgetreten.');
    expect(describeViewerError({ code: 500 })).toBe('Ein unbekannter Fehler ist aufgetreten.');
  });
});

describe('viewerStateReducer', () => {
  it('starts with a neutral initial state', () => {
    expect(initialViewerState()).toEqual({
      page: 1,
      totalPages: 0,
      zoom: 100,
      textPanelOpen: false,
      renderState: 'idle',
    });
  });

  it('SET_DOCUMENT resets the page and the render state', () => {
    const state = viewerStateReducer(
      { ...initialViewerState(), page: 4, renderState: 'ready' },
      { type: 'SET_DOCUMENT', totalPages: 8 },
    );
    expect(state.totalPages).toBe(8);
    expect(state.page).toBe(1);
    expect(state.renderState).toBe('idle');
  });

  it('SET_PAGE changes the page and clamps it', () => {
    const withDoc = viewerStateReducer(initialViewerState(), { type: 'SET_DOCUMENT', totalPages: 5 });
    expect(viewerStateReducer(withDoc, { type: 'SET_PAGE', page: 3 }).page).toBe(3);
    expect(viewerStateReducer(withDoc, { type: 'SET_PAGE', page: 9 }).page).toBe(5);
    expect(viewerStateReducer(withDoc, { type: 'SET_PAGE', page: 0 }).page).toBe(1);
  });

  it('STEP_PAGE steps within document bounds', () => {
    const withDoc = viewerStateReducer(initialViewerState(), { type: 'SET_DOCUMENT', totalPages: 3 });
    const atPage2 = viewerStateReducer(withDoc, { type: 'SET_PAGE', page: 2 });
    expect(viewerStateReducer(atPage2, { type: 'STEP_PAGE', direction: 1 }).page).toBe(3);
    expect(viewerStateReducer(atPage2, { type: 'STEP_PAGE', direction: -1 }).page).toBe(1);
    // Clamping at both ends.
    expect(viewerStateReducer(withDoc, { type: 'STEP_PAGE', direction: -1 }).page).toBe(1);
    const atPage3 = viewerStateReducer(withDoc, { type: 'SET_PAGE', page: 3 });
    expect(viewerStateReducer(atPage3, { type: 'STEP_PAGE', direction: 1 }).page).toBe(3);
  });

  it('SET_ZOOM changes the zoom and clamps it', () => {
    expect(viewerStateReducer(initialViewerState(), { type: 'SET_ZOOM', zoom: 150 }).zoom).toBe(150);
    expect(viewerStateReducer(initialViewerState(), { type: 'SET_ZOOM', zoom: 10 }).zoom).toBe(
      VIEWER_ZOOM_MIN,
    );
    expect(viewerStateReducer(initialViewerState(), { type: 'SET_ZOOM', zoom: 400 }).zoom).toBe(
      VIEWER_ZOOM_MAX,
    );
  });

  it('STEP_ZOOM steps the zoom within bounds', () => {
    const atMin = viewerStateReducer(initialViewerState(), {
      type: 'SET_ZOOM',
      zoom: VIEWER_ZOOM_MIN,
    });
    expect(viewerStateReducer(atMin, { type: 'STEP_ZOOM', direction: -1 }).zoom).toBe(VIEWER_ZOOM_MIN);
    const atMax = viewerStateReducer(initialViewerState(), {
      type: 'SET_ZOOM',
      zoom: VIEWER_ZOOM_MAX,
    });
    expect(viewerStateReducer(atMax, { type: 'STEP_ZOOM', direction: 1 }).zoom).toBe(VIEWER_ZOOM_MAX);
  });

  it('SET_TEXT_PANEL toggles the panel', () => {
    expect(
      viewerStateReducer(initialViewerState(), { type: 'SET_TEXT_PANEL', open: true }).textPanelOpen,
    ).toBe(true);
  });

  it('walks through the render lifecycle', () => {
    let state = initialViewerState();
    state = viewerStateReducer(state, { type: 'RENDER_START' });
    expect(state.renderState).toBe('rendering');
    state = viewerStateReducer(state, { type: 'RENDER_DONE' });
    expect(state.renderState).toBe('ready');
    state = viewerStateReducer(state, { type: 'RENDER_START' });
    state = viewerStateReducer(state, { type: 'RENDER_ERROR' });
    expect(state.renderState).toBe('error');
  });

  it('ABORT clears a transient render state so the viewer is not stuck loading', () => {
    let state = viewerStateReducer(initialViewerState(), { type: 'RENDER_START' });
    expect(state.renderState).toBe('rendering');
    state = viewerStateReducer(state, { type: 'ABORT' });
    expect(state.renderState).toBe('idle');
    // Page, zoom and panel state survive an abort.
    expect(state.page).toBe(1);
    expect(state.zoom).toBe(100);
    expect(state.textPanelOpen).toBe(false);
  });
});
