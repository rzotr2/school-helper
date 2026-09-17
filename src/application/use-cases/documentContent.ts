import { supabase } from '../../infrastructure/supabase/client';
import type {
  DocumentProcessingStatus,
  Json,
} from '../../infrastructure/supabase/database.types';

export type { DocumentProcessingStatus };
import { evaluateTextQuality } from '../../infrastructure/pdf/textQuality';
import type { TextQuality } from '../../infrastructure/pdf/types';
import {
  pagesHaveUsableText,
  type OcrStatus,
  type PdfInspectionResult,
  type PdfPageInspection,
} from '../../infrastructure/pdf/types';

/**
 * Persisted per-page extraction data of a document: the dual text
 * representations (nativeText + ocrText) plus processing metadata, stored
 * in the documents.content jsonb column.
 *
 * The persisted model is deliberately smaller than the runtime inspection
 * model: transient states ('pending'/'processing') are never stored, and
 * annotations/rendering data stay out — only serializable text data is
 * persisted. The original PDF in Storage remains the visual source of
 * truth and the input for any future re-processing.
 */

/**
 * Persisted OCR lifecycle. Unlike the runtime OcrStatus, only final
 * states exist: 'not-generated' (no OCR output was ever produced — only
 * legacy content from before always-OCR processing carries it),
 * 'completed' (a successful result exists), 'failed' (the last attempt
 * failed and no successful result exists).
 */
export type PersistedOcrStatus = 'not-generated' | 'completed' | 'failed';

/** Persisted representation of one page's dual text data. */
export interface PageContent {
  /** 1-based page number. */
  pageNumber: number;
  /** The extracted native text layer ('' when the PDF has none). */
  nativeText: string;
  /** Quality evaluation of `nativeText`. */
  quality: TextQuality;
  /** OCR output for this page; null when no successful OCR exists. */
  ocrText: string | null;
  /** Persisted OCR lifecycle (see PersistedOcrStatus). */
  ocrStatus: PersistedOcrStatus;
}

/** The documents.content column: all persisted pages. */
export interface DocumentContent {
  pages: PageContent[];
}

const PERSISTED_OCR_STATUSES: readonly PersistedOcrStatus[] = [
  'not-generated',
  'completed',
  'failed',
];

// ── Validation ───────────────────────────────────────────────────────────────

function isTextQuality(value: unknown): value is TextQuality {
  if (typeof value !== 'object' || value === null) return false;
  const quality = value as Record<string, unknown>;
  return (
    typeof quality.usable === 'boolean' &&
    typeof quality.charCount === 'number' &&
    typeof quality.printableRatio === 'number' &&
    typeof quality.whitespaceRatio === 'number' &&
    typeof quality.alphanumericRatio === 'number' &&
    typeof quality.wordCount === 'number' &&
    typeof quality.replacementCharCount === 'number' &&
    Array.isArray(quality.reasons) &&
    quality.reasons.every((reason) => typeof reason === 'string')
  );
}

/** Page numbers are 1-based integers: anything else is corrupt data. */
function isPageNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isPersistedPage(value: unknown): value is PageContent {
  if (typeof value !== 'object' || value === null) return false;
  const page = value as Record<string, unknown>;
  return (
    isPageNumber(page.pageNumber) &&
    typeof page.nativeText === 'string' &&
    isTextQuality(page.quality) &&
    (page.ocrText === null || typeof page.ocrText === 'string') &&
    typeof page.ocrStatus === 'string' &&
    PERSISTED_OCR_STATUSES.includes(page.ocrStatus as PersistedOcrStatus)
  );
}

/**
 * Parses the jsonb documents.content value into a typed DocumentContent.
 * The database column is untyped JSON, so the shape is validated at
 * runtime: anything malformed (or NULL/absent) yields null, which callers
 * treat as "no persisted content — inspect the PDF again".
 */
export function parseDocumentContent(value: unknown): DocumentContent | null {
  if (typeof value !== 'object' || value === null) return null;
  const content = value as Record<string, unknown>;
  if (!Array.isArray(content.pages)) return null;
  if (!content.pages.every(isPersistedPage)) return null;
  const pages = content.pages as PageContent[];
  // Page boundaries must stay unambiguous (search maps a match to exactly
  // one page): duplicate page numbers mean corrupt data.
  if (new Set(pages.map((page) => page.pageNumber)).size !== pages.length) return null;
  return { pages };
}

// ── Text access ──────────────────────────────────────────────────────────────

/**
 * The text of one page of a document, as the two independent
 * representations: nativeText (the PDF text layer) and ocrText (the OCR
 * output). Returns null when the document has no persisted content for
 * that page — content null (legacy documents) or the page absent — which
 * callers treat as "no persisted text available".
 *
 * This is the application-level entry point for future text-consuming
 * features (search, summaries, RAG): callers get the typed page text
 * without knowing the persisted JSONB structure, and the representations
 * are never merged or replaced — no "winner" is chosen.
 */
export function getDocumentPageText(
  content: DocumentContent | null,
  pageNumber: number,
): { nativeText: string; ocrText: string | null } | null {
  if (content === null) return null;
  const page = content.pages.find((candidate) => candidate.pageNumber === pageNumber);
  if (page === undefined) return null;
  return { nativeText: page.nativeText, ocrText: page.ocrText };
}

// ── Document processing lifecycle ────────────────────────────────────────────

const PROCESSING_STATUSES: readonly DocumentProcessingStatus[] = [
  'pending',
  'processing',
  'completed',
  'failed',
];

/**
 * Validates a documents.processing_status value. Anything unknown or
 * absent yields null; callers treat that as 'pending' (the database
 * default: not processed yet, retry available).
 */
export function parseProcessingStatus(value: unknown): DocumentProcessingStatus | null {
  return typeof value === 'string' && PROCESSING_STATUSES.includes(value as DocumentProcessingStatus)
    ? (value as DocumentProcessingStatus)
    : null;
}

/**
 * Only 'completed' documents can be opened as processed documents:
 * 'pending'/'processing' are still running (or waiting for a retry) and
 * 'failed' needs a retry first.
 */
export function canOpenDocument(status: DocumentProcessingStatus): boolean {
  return status === 'completed';
}

// ── Runtime ↔ persisted mapping ──────────────────────────────────────────────

/** Maps a runtime OcrStatus to its persisted equivalent. */
function toPersistedOcrStatus(status: OcrStatus): PersistedOcrStatus {
  return status === 'completed' || status === 'failed' ? status : 'not-generated';
}

/**
 * The persisted snapshot of a full inspection result. Transient states
 * collapse to 'not-generated'; only final OCR outcomes are stored.
 */
export function inspectionToDocumentContent(inspection: PdfInspectionResult): DocumentContent {
  return {
    pages: inspection.pages.map((page) => ({
      pageNumber: page.pageNumber,
      nativeText: page.nativeText,
      quality: page.quality,
      ocrText: page.ocrText,
      ocrStatus: toPersistedOcrStatus(page.ocrStatus),
    })),
  };
}

/**
 * Restores an inspection result from persisted content, sized to the
 * current page count of the PDF. Pages without a persisted entry get an
 * empty default ('' native text, unusable, no OCR) — inspection data can
 * lag the PDF, never lead it. 'not-generated' restores as 'not-needed':
 * restoring 'pending' would lie (nothing is being processed) and the
 * auto-OCR inside inspectPdfDocument is deliberately not re-run.
 */
export function documentContentToInspection(
  content: DocumentContent,
  pageCount: number,
): PdfInspectionResult {
  const persistedByNumber = new Map(
    content.pages.map((page) => [page.pageNumber, page]),
  );
  const pages: PdfPageInspection[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const persisted = persistedByNumber.get(pageNumber);
    pages.push({
      pageNumber,
      nativeText: persisted?.nativeText ?? '',
      quality: persisted?.quality ?? evaluateTextQuality(''),
      ocrText: persisted?.ocrText ?? null,
      ocrStatus: persisted?.ocrStatus === 'completed' || persisted?.ocrStatus === 'failed'
        ? persisted.ocrStatus
        : 'not-needed',
    });
  }
  return {
    pageCount,
    pages,
    // The viewer never reads annotations from the restored result; the
    // annotation layer fetches them from the live pdf.js page object.
    annotations: [],
    hasUsableText: pagesHaveUsableText(pages),
  };
}

// ── Page updates ─────────────────────────────────────────────────────────────

/**
 * Builds the persisted page for an OCR update: the runtime page's
 * nativeText/quality plus the new OCR fields. nativeText is always taken
 * from the runtime page — OCR must never overwrite it.
 */
export function persistedPageFromOcrUpdate(
  page: PdfPageInspection,
  update: { ocrText: string | null; ocrStatus: PersistedOcrStatus },
): PageContent {
  return {
    pageNumber: page.pageNumber,
    nativeText: page.nativeText,
    quality: page.quality,
    ocrText: update.ocrText,
    ocrStatus: update.ocrStatus,
  };
}

/** Inserts or replaces one page, keeping the pages ordered by page number. */
function withPageContent(
  content: DocumentContent | null,
  page: PageContent,
): DocumentContent {
  const pages = (content?.pages ?? []).filter(
    (candidate) => candidate.pageNumber !== page.pageNumber,
  );
  pages.push(page);
  pages.sort((left, right) => left.pageNumber - right.pageNumber);
  return { pages };
}

/**
 * Merges one page's OCR update into the current persisted content.
 * Returns null when nothing should be written.
 *
 * Rules (a failed attempt must never destroy a successful result):
 * - a successful update always replaces that page's OCR fields;
 * - a failed update leaves an existing completed page untouched;
 * - a failed update that still carries text (the runtime page kept its
 *   previous result) is recorded as completed — text without a completed
 *   status would be an inconsistent persisted state;
 * - a failed update without any text records 'failed'.
 * Other pages are never modified: an OCR run for page N cannot touch
 * page M, and nativeText/quality always come from the page being written.
 */
export function mergePageOcrUpdate(
  content: DocumentContent | null,
  page: PageContent,
): DocumentContent | null {
  const existing = content?.pages.find((candidate) => candidate.pageNumber === page.pageNumber);
  if (page.ocrStatus === 'failed' && (existing?.ocrText ?? null) !== null) {
    return null;
  }
  const persistedPage: PageContent =
    page.ocrStatus === 'failed' && page.ocrText !== null
      ? { ...page, ocrStatus: 'completed' }
      : page;
  return withPageContent(content, persistedPage);
}

// ── Persistence ──────────────────────────────────────────────────────────────

/**
 * Blindly replaces the whole persisted content of a document. Only used
 * for the first persistence right after inspection (the caller observed
 * content === null at download time, so nothing to merge with); per-page
 * OCR updates go through saveDocumentPage. RLS restricts the write to the
 * owner's own row; the update policy's topic-ownership check still passes
 * because topic_id is not changed.
 */
export async function saveDocumentContent(
  userId: string,
  documentId: string,
  content: DocumentContent,
): Promise<DocumentContent> {
  if (!userId) throw new Error('User must be authenticated');

  // DocumentContent is JSON-serializable by construction (the persisted
  // shape is validated by parseDocumentContent); interfaces lack implicit
  // index signatures, hence the assertion to Json.
  const { error } = await supabase
    .from('documents')
    .update({ content: content as unknown as Json })
    .eq('id', documentId);

  if (error) throw new Error(error.message);

  return content;
}

/**
 * Persists one page's OCR update. The current persisted content is
 * re-read first, so this never clobbers pages updated meanwhile (e.g.
 * by another tab) — the merge in mergePageOcrUpdate applies on top of the
 * freshest data. Returns the new persisted content, or null when the
 * merge decided nothing should be written.
 */
export async function saveDocumentPage(
  userId: string,
  documentId: string,
  page: PageContent,
): Promise<DocumentContent | null> {
  if (!userId) throw new Error('User must be authenticated');

  const { data: row, error: fetchError } = await supabase
    .from('documents')
    .select('content')
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('Document not found');

  const merged = mergePageOcrUpdate(parseDocumentContent(row.content), page);
  if (merged === null) return null;

  const { error: updateError } = await supabase
    .from('documents')
    .update({ content: merged as unknown as Json })
    .eq('id', documentId);

  if (updateError) throw new Error(updateError.message);

  return merged;
}
