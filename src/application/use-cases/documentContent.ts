import { supabase } from '../../infrastructure/supabase/client';
import type {
  DocumentProcessingStatus,
  Json,
} from '../../infrastructure/supabase/database.types';

export type { DocumentProcessingStatus };
import { evaluateTextQuality } from '../../infrastructure/pdf/textQuality';
import type {
  TextBlock,
  TextBlockType,
  TextQuality,
  DocumentSection,
  PersistedAnnotation,
  StructuralItem,
} from '../../infrastructure/pdf/types';
export type {
  TextBlock,
  TextBlockType,
  DocumentSection,
  PersistedAnnotation,
  StructuralItem,
};
import { buildDocumentSections } from '../../infrastructure/pdf/textStructure';
export { buildDocumentSections };
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
 * Annotations with non-empty content are persisted per page with their normalized
 * Y-position to allow deterministic reading-order reconstruction.
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
  /**
   * Deterministic structural text blocks extracted from the native text layer.
   * Optional: absent when no structure was extracted or on legacy content.
   */
  blocks?: TextBlock[];
  /**
   * Deterministic lightweight annotations extracted from the PDF annotation layer.
   * Optional: absent when page has no text-bearing annotations or on legacy content.
   */
  annotations?: PersistedAnnotation[];
}

/** The documents.content column: all persisted pages and optional document sections. */
export interface DocumentContent {
  pages: PageContent[];
  /**
   * Deterministic document sections derived from native text blocks.
   * Optional: absent when no sections were generated or on legacy content.
   */
  sections?: DocumentSection[];
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

function normalizeTextQuality(value: unknown, nativeText: string): TextQuality | null {
  if (isTextQuality(value)) return value;
  if (typeof value !== 'object' || value === null) return null;
  const q = value as Record<string, unknown>;
  if (typeof q.usable !== 'boolean') return null;
  const fallback = evaluateTextQuality(nativeText);
  return {
    usable: q.usable,
    charCount: typeof q.charCount === 'number' ? q.charCount : fallback.charCount,
    printableRatio: typeof q.printableRatio === 'number' ? q.printableRatio : fallback.printableRatio,
    whitespaceRatio: typeof q.whitespaceRatio === 'number' ? q.whitespaceRatio : fallback.whitespaceRatio,
    alphanumericRatio: typeof q.alphanumericRatio === 'number' ? q.alphanumericRatio : fallback.alphanumericRatio,
    wordCount: typeof q.wordCount === 'number' ? q.wordCount : fallback.wordCount,
    replacementCharCount: typeof q.replacementCharCount === 'number' ? q.replacementCharCount : fallback.replacementCharCount,
    reasons: Array.isArray(q.reasons) && q.reasons.every((r) => typeof r === 'string') ? q.reasons : fallback.reasons,
  };
}

const VALID_BLOCK_TYPES: readonly TextBlockType[] = ['paragraph', 'heading', 'list'];

function isTextBlock(value: unknown): value is TextBlock {
  if (typeof value !== 'object' || value === null) return false;
  const block = value as Record<string, unknown>;
  return (
    typeof block.text === 'string' &&
    typeof block.type === 'string' &&
    VALID_BLOCK_TYPES.includes(block.type as TextBlockType) &&
    (block.y === undefined || typeof block.y === 'number')
  );
}

function parseBlocks(value: unknown): TextBlock[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const blocks: TextBlock[] = [];
  for (const item of value) {
    if (!isTextBlock(item)) return null;
    blocks.push({
      text: item.text,
      type: item.type,
      ...(typeof item.y === 'number' ? { y: item.y } : {}),
    });
  }
  return blocks;
}

function isPersistedAnnotation(value: unknown): value is PersistedAnnotation {
  if (typeof value !== 'object' || value === null) return false;
  const annotation = value as Record<string, unknown>;
  return (
    typeof annotation.content === 'string' &&
    typeof annotation.type === 'string' &&
    (annotation.y === null || typeof annotation.y === 'number')
  );
}

function parseAnnotations(value: unknown): PersistedAnnotation[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const annotations: PersistedAnnotation[] = [];
  for (const item of value) {
    if (!isPersistedAnnotation(item)) return null;
    annotations.push({
      content: item.content,
      type: item.type,
      y: item.y,
    });
  }
  return annotations;
}

function parsePersistedPage(value: unknown): PageContent | null {
  if (typeof value !== 'object' || value === null) return null;
  const page = value as Record<string, unknown>;
  if (!isPageNumber(page.pageNumber)) return null;
  if (typeof page.nativeText !== 'string') return null;

  const quality = normalizeTextQuality(page.quality, page.nativeText);
  if (quality === null) return null;

  if (page.ocrText !== null && typeof page.ocrText !== 'string') return null;

  let ocrStatus: PersistedOcrStatus;
  if (page.ocrStatus === 'completed' || page.ocrStatus === 'failed' || page.ocrStatus === 'not-generated') {
    ocrStatus = page.ocrStatus;
  } else if (page.ocrStatus === 'not-needed') {
    ocrStatus = 'not-generated';
  } else {
    return null;
  }

  const parsedBlocks = parseBlocks(page.blocks);
  if (parsedBlocks === null) return null;

  const parsedAnnotations = parseAnnotations(page.annotations);
  if (parsedAnnotations === null) return null;

  return {
    pageNumber: page.pageNumber,
    nativeText: page.nativeText,
    quality,
    ocrText: page.ocrText ?? null,
    ocrStatus,
    ...(parsedBlocks !== undefined ? { blocks: parsedBlocks } : {}),
    ...(parsedAnnotations !== undefined ? { annotations: parsedAnnotations } : {}),
  };
}

function isStructuralItem(value: unknown): value is StructuralItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'block') {
    return isTextBlock(candidate.block);
  }
  if (candidate.kind === 'annotation') {
    return isPersistedAnnotation(candidate.annotation);
  }
  return false;
}

function isDocumentSection(value: unknown): value is DocumentSection {
  if (typeof value !== 'object' || value === null) return false;
  const section = value as Record<string, unknown>;
  if (section.title !== null && typeof section.title !== 'string') return false;
  if (!isPageNumber(section.pageStart)) return false;
  if (!isPageNumber(section.pageEnd)) return false;
  if (section.pageStart > section.pageEnd) return false;
  if (!Array.isArray(section.blocks)) return false;
  if (!section.blocks.every(isTextBlock)) return false;
  if (section.items !== undefined) {
    if (!Array.isArray(section.items)) return false;
    if (!section.items.every(isStructuralItem)) return false;
  }
  return true;
}

function parseSections(value: unknown): DocumentSection[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const sections: DocumentSection[] = [];
  for (const item of value) {
    if (!isDocumentSection(item)) return null;
    sections.push({
      title: item.title,
      blocks: item.blocks.map((b) => ({
        text: b.text,
        type: b.type,
        ...(typeof b.y === 'number' ? { y: b.y } : {}),
      })),
      pageStart: item.pageStart,
      pageEnd: item.pageEnd,
      ...(item.items !== undefined
        ? {
            items: item.items.map((it) =>
              it.kind === 'block'
                ? {
                    kind: 'block' as const,
                    block: {
                      text: it.block.text,
                      type: it.block.type,
                      ...(typeof it.block.y === 'number' ? { y: it.block.y } : {}),
                    },
                  }
                : {
                    kind: 'annotation' as const,
                    annotation: {
                      content: it.annotation.content,
                      type: it.annotation.type,
                      y: it.annotation.y,
                    },
                  },
            ),
          }
        : {}),
    });
  }
  return sections;
}

/**
 * Parses the jsonb documents.content value into a typed DocumentContent.
 * The database column is untyped JSON, so the shape is validated at
 * runtime: anything malformed (or NULL/absent) yields null, which callers
 * treat as "no persisted content — inspect the PDF again".
 */
export function parseDocumentContent(value: unknown): DocumentContent | null {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const content = raw as Record<string, unknown>;
  if (!Array.isArray(content.pages)) return null;
  const parsedPages: PageContent[] = [];
  for (const pageCandidate of content.pages) {
    const parsed = parsePersistedPage(pageCandidate);
    if (parsed === null) return null;
    parsedPages.push(parsed);
  }
  // Page boundaries must stay unambiguous (search maps a match to exactly
  // one page): duplicate page numbers mean corrupt data.
  if (new Set(parsedPages.map((page) => page.pageNumber)).size !== parsedPages.length) return null;

  const parsedSections = parseSections(content.sections);
  if (parsedSections === null) return null;

  return {
    pages: parsedPages,
    ...(parsedSections !== undefined ? { sections: parsedSections } : {}),
  };
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

/**
 * The structural text blocks of one page of a document. Returns null when the
 * document has no persisted content for that page, or when no structural
 * blocks were extracted (e.g. legacy content or image-only pages).
 *
 * This is the application-level entry point for future structured text
 * consumers (summaries, quiz, RAG).
 */
export function getDocumentPageBlocks(
  content: DocumentContent | null,
  pageNumber: number,
): TextBlock[] | null {
  if (content === null) return null;
  const page = content.pages.find((candidate) => candidate.pageNumber === pageNumber);
  if (page === undefined || page.blocks === undefined) return null;
  return page.blocks;
}

/**
 * The document-level structural sections. Returns null when content is null
 * or when the document has no sections (e.g. legacy content or image-only documents).
 *
 * This is the application-level entry point for future structured document consumers.
 */
export function getDocumentSections(
  content: DocumentContent | null,
): DocumentSection[] | null {
  if (content === null || content.sections === undefined) return null;
  return content.sections;
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
 *
 * Annotations with non-empty content are mapped to lightweight PersistedAnnotations
 * attached to each page, and used by buildDocumentSections to produce reading-order items.
 */
export function inspectionToDocumentContent(inspection: PdfInspectionResult): DocumentContent {
  const annotationsByPage = new Map<number, PersistedAnnotation[]>();
  for (const ann of inspection.annotations ?? []) {
    if (typeof ann.content !== 'string' || ann.content.trim().length === 0) {
      continue;
    }
    const pageAnnotations = annotationsByPage.get(ann.pageNumber) ?? [];
    pageAnnotations.push({
      content: ann.content.trim(),
      type: ann.type,
      y: ann.rect ? ann.rect.y + ann.rect.height : null,
    });
    annotationsByPage.set(ann.pageNumber, pageAnnotations);
  }

  const pages: PageContent[] = inspection.pages.map((page) => {
    const pageAnns = annotationsByPage.get(page.pageNumber);
    return {
      pageNumber: page.pageNumber,
      nativeText: page.nativeText,
      quality: page.quality,
      ocrText: page.ocrText,
      ocrStatus: toPersistedOcrStatus(page.ocrStatus),
      ...(page.blocks !== undefined ? { blocks: page.blocks } : {}),
      ...(pageAnns && pageAnns.length > 0 ? { annotations: pageAnns } : {}),
    };
  });

  const sections = buildDocumentSections(pages);

  return {
    pages,
    ...(sections.length > 0 ? { sections } : {}),
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
      ...(persisted?.blocks !== undefined ? { blocks: persisted.blocks } : {}),
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
  existingPage?: PageContent | null,
): PageContent {
  return {
    pageNumber: page.pageNumber,
    nativeText: page.nativeText,
    quality: page.quality,
    ocrText: update.ocrText,
    ocrStatus: update.ocrStatus,
    ...(page.blocks !== undefined ? { blocks: page.blocks } : {}),
    ...(existingPage?.annotations !== undefined ? { annotations: existingPage.annotations } : {}),
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
  return {
    pages,
    ...(content?.sections !== undefined ? { sections: content.sections } : {}),
  };
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
  const basePage =
    existing?.annotations !== undefined && page.annotations === undefined
      ? { ...page, annotations: existing.annotations }
      : page;
  const persistedPage: PageContent =
    basePage.ocrStatus === 'failed' && basePage.ocrText !== null
      ? { ...basePage, ocrStatus: 'completed' }
      : basePage;
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
    .update({
      content: content as unknown as Json,
      processing_status: 'completed',
    })
    .eq('id', documentId);

  if (error) {
    console.error('[saveDocumentContent] Database error:', error);
    throw new Error(error.message);
  }

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

  if (fetchError) {
    console.error('[saveDocumentPage] Fetch error:', fetchError);
    throw new Error(fetchError.message);
  }
  if (!row) throw new Error('Document not found');

  const parsedCurrent = parseDocumentContent(row.content);
  const merged = mergePageOcrUpdate(parsedCurrent, page);
  if (merged === null) {
    return null;
  }

  const { error: updateError } = await supabase
    .from('documents')
    .update({
      content: merged as unknown as Json,
      processing_status: 'completed',
    })
    .eq('id', documentId);

  if (updateError) {
    console.error('[saveDocumentPage] DB update error:', updateError);
    throw new Error(updateError.message);
  }

  return merged;
}
