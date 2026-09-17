import { inspectPdf } from '../../infrastructure/pdf/inspect';
import type { PdfInspectionProgress } from '../../infrastructure/pdf/types';
import { downloadDocument, updateDocumentProcessing, type Document } from './documents';
import { inspectionToDocumentContent } from './documentContent';

/**
 * Automatic document processing (runs in the browser, right after
 * upload or as a retry): download the stored PDF, run the full
 * inspection pipeline (native text extraction plus automatic OCR of
 * every page) and persist the result atomically with
 * the 'completed' status. On failure the document is marked 'failed'
 * and stays in the library for a retry.
 *
 * The persisted status — not React state — is the source of truth for
 * the lifecycle: a reload or another tab always sees the document as
 * 'processing' until the completion write lands.
 */

export interface ProcessDocumentOptions {
  /** Fires between pages during extraction/OCR (see PdfInspectionProgress). */
  onProgress?: (progress: PdfInspectionProgress) => void;
}

/**
 * In-flight runs by documentId. processDocument is the single entry point
 * for automatic processing (upload auto-start, list retry, viewer retry),
 * so this module-level registry is the one place where duplicate runs are
 * deduplicated: a concurrent call for the same document (e.g. the viewer's
 * retry while a list page still runs the document) joins the existing run
 * instead of downloading and OCR-ing the PDF a second time. The registry
 * is per browser session, not persisted — the persisted processing_status
 * covers reloads.
 */
const activeRuns = new Map<string, Promise<Document>>();

/**
 * Processes one document to completion. Resolves with the real database
 * row (status 'completed', content persisted); rejects after persisting
 * 'failed' best-effort. The rejection message is safe to show: it comes
 * from our own infrastructure or is a generic fallback.
 */
export async function processDocument(
  userId: string,
  documentId: string,
  options: ProcessDocumentOptions = {},
): Promise<Document> {
  if (!userId) throw new Error('User must be authenticated');

  const active = activeRuns.get(documentId);
  if (active !== undefined) return active;

  const run = runProcessDocument(userId, documentId, options);
  activeRuns.set(documentId, run);
  // Cleanup via then/catch (not finally): the derived promise must never
  // reject, otherwise a failed run would surface as an unhandled rejection.
  run.then(
    () => activeRuns.delete(documentId),
    () => activeRuns.delete(documentId),
  );
  return run;
}

async function runProcessDocument(
  userId: string,
  documentId: string,
  options: ProcessDocumentOptions,
): Promise<Document> {
  try {
    // Flip the persisted state before any local work, so the lifecycle
    // survives a reload or a tab switch mid-processing.
    await updateDocumentProcessing(userId, documentId, { processingStatus: 'processing' });

    const { blob } = await downloadDocument(userId, documentId);
    // inspectPdf loads the document, runs the pipeline and releases the
    // pdf.js resources itself (see inspect.ts).
    const inspection = await inspectPdf(blob, { onProgress: options.onProgress });
    const content = inspectionToDocumentContent(inspection);

    // Atomic: content and 'completed' land together, never apart.
    return await updateDocumentProcessing(userId, documentId, {
      processingStatus: 'completed',
      content,
    });
  } catch (err) {
    // Best-effort failure marker. If even this write fails, the document
    // stays 'processing' and the retry action recovers it.
    await updateDocumentProcessing(userId, documentId, { processingStatus: 'failed' }).catch(
      () => {},
    );
    throw err instanceof Error ? err : new Error('Processing failed');
  }
}
