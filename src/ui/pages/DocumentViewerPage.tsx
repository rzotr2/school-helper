/**
 * Production PDF document viewer for a stored document
 * (route /document/:documentId).
 *
 * Lifecycle: download the private Blob → load the PDF.js document exactly
 * once → inspect that same document → render it with PdfViewer. The page
 * owns the PDFDocumentProxy (via the loading task) and releases it with
 * releasePdfDocument; PdfViewer only renders and never destroys it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { downloadDocument } from '../../application/use-cases/documents';
import type { Document } from '../../application/use-cases/documents';
import { processDocument } from '../../application/use-cases/documentProcessing';
import { understandDocument } from '../../application/use-cases/documentUnderstanding';
import {
  canOpenDocument,
  documentContentToInspection,
  inspectionToDocumentContent,
  persistedPageFromOcrUpdate,
  saveDocumentContent,
  saveDocumentPage,
  type DocumentProcessingStatus,
  type PersistedOcrStatus,
} from '../../application/use-cases/documentContent';
import { describeProcessingProgress } from '../hooks/useDocumentProcessing';
import { loadPdfDocument, releasePdfDocument } from '../../infrastructure/pdf/load';
import type { LoadedPdfDocument } from '../../infrastructure/pdf/load';
import { PdfCancellationError } from '../../infrastructure/pdf/errors';
import { inspectPdfDocument } from '../../infrastructure/pdf/inspect';
import { ocrPdfPages } from '../../infrastructure/pdf/ocr';
import type {
  OcrStatus,
  PdfInspectionProgress,
  PdfInspectionResult,
  PdfPageInspection,
} from '../../infrastructure/pdf/types';
import { Button } from '../components/Button';
import { PdfViewer } from '../components/pdf/PdfViewer';
import { describeViewerError, withPageOcrUpdate } from '../components/pdf/viewerState';

interface ViewerSession {
  document: Document;
  blob: Blob;
  loaded: LoadedPdfDocument;
  inspection: PdfInspectionResult;
}

export function DocumentViewerPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id;

  const pageParam = searchParams.get('page');
  const targetPage = pageParam ? parseInt(pageParam, 10) : undefined;
  const initialPage = targetPage !== undefined && Number.isInteger(targetPage) && targetPage > 0 ? targetPage : 1;

  const [session, setSession] = useState<ViewerSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  // The document's processing status when the viewer is blocked (the
  // document is not 'completed' yet). Changing retryToken re-runs the
  // open flow after a successful in-viewer retry.
  const [processingStatus, setProcessingStatus] = useState<DocumentProcessingStatus | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  // Whether an in-viewer retry run is currently in flight (disables the
  // retry button; the run is the same processDocument the list pages use).
  const [retryRunning, setRetryRunning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Explicit OCR lifecycle. The OCR operation is owned here: a new run or
  // a document change aborts the previous one, and the generation counter
  // makes superseded runs unable to touch the session (stale protection).
  const ocrControllerRef = useRef<AbortController | null>(null);
  const ocrGenerationRef = useRef(0);

  useEffect(() => {
    if (!userId || !documentId) return;

    // Operation-local lifecycle: every successful load has exactly one
    // matching release, and a stale operation can never release the active
    // document of a newer operation (each operation has its own `loaded`).
    const controller = new AbortController();
    const { signal } = controller;
    let loaded: LoadedPdfDocument | null = null;

    // A document change supersedes any explicit OCR run of the old one.
    ocrControllerRef.current?.abort();
    ocrGenerationRef.current++;

    setSession(null);
    setErrorMessage(null);
    setProgressText(null);
    setProcessingStatus(null);

    void (async () => {
      try {
        const { document, blob } = await downloadDocument(userId, documentId, signal);
        if (signal.aborted) return;

        // Only 'completed' documents can be opened. Everything else shows
        // the blocked screen (spinner or failed + retry); no PDF resources
        // are loaded for blocked documents.
        if (!canOpenDocument(document.processingStatus)) {
          setProcessingStatus(document.processingStatus);
          return;
        }

        loaded = await loadPdfDocument(blob);
        if (signal.aborted) return;

        // Inspection runs against the SAME document the viewer will render.
        // inspectPdf() is deliberately not used: it would load and destroy
        // a second PDF document. Persisted extraction data is reused as-is:
        // no re-extraction, no re-OCR, no waiting for pages that were
        // already processed.
        let documentWithContent = document;
        let inspection: PdfInspectionResult;
        if (document.content !== null) {
          inspection = documentContentToInspection(document.content, loaded.doc.numPages);
        } else {
          inspection = await inspectPdfDocument(loaded.doc, {
            signal,
            onProgress: (progress: PdfInspectionProgress) => {
              if (signal.aborted) return;
              setProgressText(describeProcessingProgress(progress));
            },
          });
          if (signal.aborted) return;

          // Persist the fresh extraction (native text plus any auto-OCR
          // results) so the next open skips inspection entirely.
          // Best-effort: a failed write keeps this session working with
          // in-memory data, and the next open simply inspects again.
          const content = inspectionToDocumentContent(inspection);
          try {
            await saveDocumentContent(userId, documentId, content);
            documentWithContent = { ...document, content };
          } catch (err) {
            console.error('[Viewer] Failed to save document content to database', err);
            // Persistence failure must not block viewing the document.
          }
        }
        if (signal.aborted) return;

        setProgressText(null);
        setSession({ document: documentWithContent, blob, loaded, inspection });
      } catch (err) {
        // Aborted by unmount or a document change: no visible error.
        if (signal.aborted) return;
        // The download or the inspection failed while the page stays alive:
        // release the document this operation owns instead of leaking it
        // until unmount.
        const toRelease = loaded;
        loaded = null;
        if (toRelease !== null) void releasePdfDocument(toRelease.task);
        setErrorMessage(describeViewerError(err));
      }
    })();

    return () => {
      controller.abort();
      // Releases whichever document this operation loaded. A failed load
      // already cleaned up its own task (load.ts), so this only fires for
      // documents the operation actually owns.
      if (loaded !== null) void releasePdfDocument(loaded.task);
    };
  }, [userId, documentId, retryToken]);

  // Aborts an in-flight explicit OCR run when the page unmounts.
  useEffect(() => () => ocrControllerRef.current?.abort(), []);

  /**
   * Re-runs the complete processing pipeline from the blocked screen.
   * processDocument persists the transitions itself ('processing' first,
   * then either content + 'completed' in one write, or 'failed'), so a
   * successful retry only bumps retryToken and lets the load effect above
   * open the now-completed document. A failed retry stays on the blocked
   * screen with the persisted 'failed' state.
   */
  const handleRetry = useCallback(async () => {
    if (!userId || !documentId || retryRunning) return;
    setRetryRunning(true);
    setErrorMessage(null);
    setProgressText(null);
    try {
      await processDocument(userId, documentId, {
        onProgress: (progress) => setProgressText(describeProcessingProgress(progress)),
      });
      // Success: re-run the load effect, which re-downloads the (small)
      // PDF, sees 'completed' and opens the viewer with persisted content.
      setRetryToken((token) => token + 1);
    } catch (err) {
      // The persisted status is now 'failed' best-effort; mirror it locally
      // so the blocked failed screen (with its retry button) stays visible
      // even if the failure write itself failed (the DB may still say
      // 'processing' — retry is the recovery path either way).
      setProcessingStatus('failed');
      setErrorMessage(err instanceof Error ? err.message : 'Verarbeitung fehlgeschlagen');
    } finally {
      setRetryRunning(false);
    }
  }, [userId, documentId, retryRunning]);

  /**
   * Runs explicit OCR for one page (triggered from the viewer's text
   * panel). The run works on the SAME document the viewer renders and
   * updates the inspection immutably: pending → processing → completed or
   * failed. The native text and its quality are never touched — OCR is an
   * additional representation. Cancellation restores the previous status;
   * a genuine failure marks the page failed and keeps the native text.
   */
  const runOcrForPage = useCallback(
    async (pageNumber: number) => {
      const current = session;
      if (current === null) return;
      const page = current.inspection.pages.find(
        (candidate) => candidate.pageNumber === pageNumber,
      );
      if (page === undefined) return;
      // One OCR run per page at a time.
      if (page.ocrStatus === 'pending' || page.ocrStatus === 'processing') return;

      ocrControllerRef.current?.abort();
      const controller = new AbortController();
      ocrControllerRef.current = controller;
      const generation = ++ocrGenerationRef.current;
      const { signal } = controller;
      const previousStatus = page.ocrStatus;

      // Generation-guarded session updates: a superseded run (a newer run
      // started, or the document changed) can never touch the session.
      const applyUpdate = (ocrStatus: OcrStatus, ocrText?: string | null): void => {
        if (generation !== ocrGenerationRef.current) return;
        setSession((previous) =>
          previous === null
            ? previous
            : {
                ...previous,
                inspection: withPageOcrUpdate(
                  previous.inspection,
                  pageNumber,
                  ocrText === undefined ? { ocrStatus } : { ocrStatus, ocrText },
                ),
              },
        );
      };

      // Persists one page's OCR update. saveDocumentPage merges against
      // the freshest persisted content, so a stale or superseded run can
      // never destroy newer persisted results or other pages' data.
      // Best-effort: a failed write leaves this session's result visible.
      const persistOcrUpdate = async (
        page: PdfPageInspection,
        ocrStatus: PersistedOcrStatus,
        ocrText: string | null,
      ): Promise<void> => {
        if (userId === undefined || !documentId) return;
        try {
          const persisted = await saveDocumentPage(
            userId,
            documentId,
            persistedPageFromOcrUpdate(page, { ocrStatus, ocrText }),
          );
          if (persisted === null || generation !== ocrGenerationRef.current) return;
          setSession((previous) =>
            previous === null
              ? previous
              : { ...previous, document: { ...previous.document, content: persisted } },
          );
        } catch (err) {
          console.error('[Viewer OCR] Failed to persist page OCR update to database', err);
          // Persistence failure must not change the displayed OCR state.
        }
      };

      applyUpdate('pending');
      try {
        const outcome = await ocrPdfPages(current.loaded.doc, [pageNumber], {
          signal,
          onProgress: () => applyUpdate('processing'),
        });
        if (signal.aborted) return;
        const ocrResult = outcome.textByPage.get(pageNumber);
        if (ocrResult !== undefined) {
          applyUpdate('completed', ocrResult.text);
          if (generation === ocrGenerationRef.current) {
            await persistOcrUpdate(page, 'completed', ocrResult.text);
          }
        } else {
          applyUpdate('failed');
          if (generation === ocrGenerationRef.current) {
            // `page` still carries a previous successful result if one
            // exists; the merge preserves it (see withPageOcrUpdate).
            await persistOcrUpdate(page, 'failed', page.ocrText);
          }
        }
      } catch (err) {
        if (signal.aborted || err instanceof PdfCancellationError) {
          // Cancelled: back to the state before the request; OCR stays
          // available to be run again.
          applyUpdate(previousStatus);
          return;
        }
        applyUpdate('failed');
        if (generation === ocrGenerationRef.current) {
          await persistOcrUpdate(page, 'failed', page.ocrText);
        }
      } finally {
        if (ocrControllerRef.current === controller) ocrControllerRef.current = null;
      }
    },
    [session],
  );

  const handleClose = () => {
    // location.key === 'default' means this route is the browser's first
    // history entry (e.g. after a refresh), so there is nothing to go back to.
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  };

  const handleAnalyze = async () => {
    if (!userId || !session || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const result = await understandDocument(userId, session.document.id, { force: true });
      setSession(prev => prev ? {
        ...prev,
        document: { ...prev.document, understanding: result },
      } : null);
    } catch (err) {
      console.error('[DocumentViewerPage] Analysis failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (session !== null) {
    return (
      // Fills the space below the header and main padding:
      // Mobile: h-14 header (3.5rem) + p-4 top/bottom (2rem) = 5.5rem.
      // Tablet: p-6 top/bottom (3rem) = 6.5rem.
      // Desktop: p-8 top/bottom (4rem) = 7.5rem.
      <div className="h-[calc(100vh-5.5rem)] sm:h-[calc(100vh-6.5rem)] md:h-[calc(100vh-7.5rem)]">
        <PdfViewer
          pdfDocument={session.loaded.doc}
          inspection={session.inspection}
          downloadName={session.document.originalName}
          downloadSource={session.blob}
          initialPage={initialPage}
          content={session.document.content}
          documentId={session.document.id}
          understanding={session.document.understanding}
          isAnalyzing={isAnalyzing}
          onAnalyze={() => void handleAnalyze()}
          onRunOcr={(pageNumber) => void runOcrForPage(pageNumber)}
          onClose={handleClose}
        />
      </div>
    );
  }

  // Blocked: the document exists but is not 'completed'. No PDF resources
  // were loaded for it (the load effect returns right after the gate), so
  // nothing leaks while the blocked screen is shown. This branch comes
  // before the generic error UI: a failed in-viewer retry sets both
  // processingStatus ('failed') and errorMessage (the reason), and the
  // blocked failed screen keeps its retry button.
  if (processingStatus !== null) {
    if (processingStatus === 'failed') {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="max-w-md w-full space-y-4">
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {errorMessage ?? 'Die Verarbeitung dieses Dokuments ist fehlgeschlagen.'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                disabled={retryRunning}
                onClick={() => void handleRetry()}
              >
                {retryRunning ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Wird verarbeitet…
                  </span>
                ) : (
                  'Verarbeitung wiederholen'
                )}
              </Button>
              <Button variant="secondary" onClick={handleClose}>
                Zurück
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // 'pending' or 'processing': processing has not completed. The spinner
    // and progress line only show while a retry run of THIS session is
    // active; otherwise the previous browser run is gone (reload, another
    // tab) and the retry button is the safe recovery path — the persisted
    // state is shown as it is, not as if the job were still running.
    const retryActive = retryRunning || progressText !== null;
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="max-w-md w-full space-y-4">
          <div className="flex items-center gap-2.5 text-slate-500">
            {retryActive ? (
              <>
                <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                <span className="text-sm">{progressText ?? 'Wird verarbeitet…'}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="text-sm">
                  Die Verarbeitung dieses Dokuments ist noch nicht abgeschlossen.
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              disabled={retryRunning}
              onClick={() => void handleRetry()}
            >
              {retryRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wird verarbeitet…
                </span>
              ) : (
                'Verarbeitung wiederholen'
              )}
            </Button>
            <Button variant="secondary" onClick={handleClose}>
              Zurück
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // A completed document failed to download or load (the blocked branch
  // above owns failures of the processing pipeline itself).
  if (errorMessage !== null) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {errorMessage}
        </div>
        <Button variant="secondary" onClick={handleClose}>
          Zurück
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">{progressText ?? 'Dokument wird geladen …'}</span>
      </div>
    </div>
  );
}
