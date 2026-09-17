import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { processDocument } from '../../application/use-cases/documentProcessing';
import type { Document } from '../../application/use-cases/documents';
import type { PdfInspectionProgress } from '../../infrastructure/pdf/types';

/**
 * German progress line for automatic processing, mirroring the strings
 * the viewer shows while inspecting a document on open.
 */
export function describeProcessingProgress(progress: PdfInspectionProgress): string {
  return progress.phase === 'ocr'
    ? `OCR läuft: Seite ${progress.currentPage} von ${progress.ocrPageCount} (${progress.pageCount} Seiten insgesamt)`
    : `Text wird gelesen: Seite ${progress.currentPage} von ${progress.pageCount}`;
}

/**
 * Automatic processing state for the document list pages (Home,
 * TopicPage). The hook tracks which documents this session is
 * processing (documentId → progress line) and updates the page's
 * document list through its own setDocuments.
 *
 * The persisted processing status is the durable source of truth: after
 * a reload, rows come back from Supabase as 'pending'/'processing'/
 * 'failed' and offer the same retry action, whether or not this session
 * started the run.
 */
export function useDocumentProcessing(
  userId: string | undefined,
  setDocuments: Dispatch<SetStateAction<Document[]>>,
) {
  // documentId → German progress line ('' until the first progress event).
  const [processingProgress, setProcessingProgress] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  // Documents this session is processing. The ref is the duplicate guard:
  // it is checked and updated synchronously, so two rapid startProcessing
  // calls (e.g. upload auto-start plus a click on the retry button before
  // React re-renders) cannot start two runs of the same document. The
  // processingProgress state above stays purely presentational.
  const inFlightRef = useRef<Set<string>>(new Set());

  const startProcessing = useCallback(
    async (documentId: string) => {
      if (!userId) return;
      if (inFlightRef.current.has(documentId)) return; // one run per document
      inFlightRef.current.add(documentId);

      // Reflect the run immediately; the persisted state flips inside
      // processDocument.
      setProcessingProgress((previous) => new Map(previous).set(documentId, ''));
      setDocuments((previous) =>
        previous.map((doc) =>
          doc.id === documentId ? { ...doc, processingStatus: 'processing' } : doc,
        ),
      );

      try {
        const updated = await processDocument(userId, documentId, {
          onProgress: (progress) =>
            setProcessingProgress((previous) =>
              new Map(previous).set(documentId, describeProcessingProgress(progress)),
            ),
        });
        setDocuments((previous) =>
          previous.map((doc) => (doc.id === documentId ? updated : doc)),
        );
      } catch {
        // processDocument already persisted 'failed' best-effort; mirror
        // it locally. The row offers retry from this state.
        setDocuments((previous) =>
          previous.map((doc) =>
            doc.id === documentId ? { ...doc, processingStatus: 'failed' } : doc,
          ),
        );
      } finally {
        inFlightRef.current.delete(documentId);
        setProcessingProgress((previous) => {
          const next = new Map(previous);
          next.delete(documentId);
          return next;
        });
      }
    },
    [userId, setDocuments],
  );

  return { processingProgress, startProcessing };
}
