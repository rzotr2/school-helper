/**
 * Production PDF document viewer for a stored document
 * (route /document/:documentId).
 *
 * Lifecycle: download the private Blob → load the PDF.js document exactly
 * once → inspect that same document → render it with PdfViewer. The page
 * owns the PDFDocumentProxy (via the loading task) and releases it with
 * releasePdfDocument; PdfViewer only renders and never destroys it.
 */
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { downloadDocument } from '../../application/use-cases/documents';
import type { Document } from '../../application/use-cases/documents';
import { loadPdfDocument, releasePdfDocument } from '../../infrastructure/pdf/load';
import type { LoadedPdfDocument } from '../../infrastructure/pdf/load';
import { inspectPdfDocument } from '../../infrastructure/pdf/inspect';
import type { PdfInspectionProgress, PdfInspectionResult } from '../../infrastructure/pdf/types';
import { Button } from '../components/Button';
import { PdfViewer } from '../components/pdf/PdfViewer';
import { describeViewerError } from '../components/pdf/viewerState';

interface ViewerSession {
  document: Document;
  blob: Blob;
  loaded: LoadedPdfDocument;
  inspection: PdfInspectionResult;
}

export function DocumentViewerPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id;

  const [session, setSession] = useState<ViewerSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !documentId) return;

    // Operation-local lifecycle: every successful load has exactly one
    // matching release, and a stale operation can never release the active
    // document of a newer operation (each operation has its own `loaded`).
    const controller = new AbortController();
    const { signal } = controller;
    let loaded: LoadedPdfDocument | null = null;

    setSession(null);
    setErrorMessage(null);
    setProgressText(null);

    void (async () => {
      try {
        const { document, blob } = await downloadDocument(userId, documentId, signal);
        if (signal.aborted) return;

        loaded = await loadPdfDocument(blob);
        if (signal.aborted) return;

        // Inspection runs against the SAME document the viewer will render.
        // inspectPdf() is deliberately not used: it would load and destroy
        // a second PDF document.
        const inspection = await inspectPdfDocument(loaded.doc, {
          signal,
          onProgress: (progress: PdfInspectionProgress) => {
            if (signal.aborted) return;
            setProgressText(
              progress.phase === 'ocr'
                ? `OCR läuft: Seite ${progress.currentPage} von ${progress.ocrPageCount} (${progress.pageCount} Seiten insgesamt)`
                : `Text wird gelesen: Seite ${progress.currentPage} von ${progress.pageCount}`,
            );
          },
        });
        if (signal.aborted) return;

        setProgressText(null);
        setSession({ document, blob, loaded, inspection });
      } catch (err) {
        // Aborted by unmount or a document change: no visible error.
        if (signal.aborted) return;
        console.error('Failed to open document', err);
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
  }, [userId, documentId]);

  const handleClose = () => {
    // location.key === 'default' means this route is the browser's first
    // history entry (e.g. after a refresh), so there is nothing to go back to.
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  };

  if (session !== null) {
    return (
      // Fills the space below the header and the main padding (h-14 + p-8).
      <div className="h-[calc(100vh-5.5rem)]">
        <PdfViewer
          pdfDocument={session.loaded.doc}
          inspection={session.inspection}
          downloadName={session.document.originalName}
          downloadSource={session.blob}
          onClose={handleClose}
        />
      </div>
    );
  }

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
