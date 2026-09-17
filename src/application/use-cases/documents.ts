import { supabase } from '../../infrastructure/supabase/client';
import type {
  Database,
  DocumentProcessingStatus,
  Json,
} from '../../infrastructure/supabase/database.types';
import { parseDocumentContent, parseProcessingStatus, type DocumentContent } from './documentContent';

export interface Document {
  id: string;
  ownerId: string;
  topicId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Persisted per-page extraction data (nativeText + ocrText), null when
   * the document has none yet. Only downloadDocument selects this column;
   * the list queries (getAllDocuments/getDocumentsForTopic) omit it and
   * therefore report null here.
   */
  content: DocumentContent | null;
  /**
   * Persisted processing lifecycle (see DocumentProcessingStatus). Only
   * 'completed' documents can be opened; every other state offers a retry.
   */
  processingStatus: DocumentProcessingStatus;
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

type DocumentRow = Database['public']['Tables']['documents']['Row'];

const DOCUMENT_COLUMNS =
  'id, owner_id, topic_id, original_name, storage_path, mime_type, size, created_at, updated_at, processing_status';

/** List columns plus the (potentially large) persisted content column. */
const DOCUMENT_COLUMNS_WITH_CONTENT = `${DOCUMENT_COLUMNS}, content`;

function mapDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    ownerId: row.owner_id,
    topicId: row.topic_id,
    originalName: row.original_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    // List queries do not select `content` (undefined here) — parse
    // returns null, matching "no persisted content selected".
    content: parseDocumentContent(row.content),
    // Unknown or absent values fall back to 'pending' (the database
    // default): the document shows as unprocessed and can be retried.
    processingStatus: parseProcessingStatus(row.processing_status) ?? 'pending',
  };
}

/**
 * Returns all documents of the given user, newest first.
 */
export async function getAllDocuments(userId: string): Promise<Document[]> {
  if (!userId) throw new Error('User must be authenticated');

  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return data.map(mapDocument);
}

/**
 * Returns all documents of the given topic, newest first.
 */
export async function getDocumentsForTopic(userId: string, topicId: string): Promise<Document[]> {
  if (!userId) throw new Error('User must be authenticated');

  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('owner_id', userId)
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return data.map(mapDocument);
}

/**
 * Returns all processed ('completed') documents of the user with their
 * extracted content populated, newest first. Used by full-text search to
 * inspect page text without downloading PDF files or bloating standard list queries.
 */
export async function getCompletedDocumentsWithContent(userId: string): Promise<Document[]> {
  if (!userId) throw new Error('User must be authenticated');

  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_COLUMNS_WITH_CONTENT)
    .eq('owner_id', userId)
    .or('processing_status.eq.completed,content.not.is.null')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return data.map(mapDocument);
}

/**
 * Uploads a PDF into Storage and creates its metadata row.
 * If saving the metadata fails, the uploaded object is rolled back.
 */
export async function uploadDocument(
  userId: string,
  topicId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<Document> {
  if (!userId) throw new Error('User must be authenticated');

  // 1. Validate file
  if (!file) throw new Error('No file provided');
  if (file.type !== 'application/pdf') throw new Error('Only PDF files are supported');
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error('File exceeds the 10MB limit');
  if (!file.name.trim()) throw new Error('File name cannot be empty');

  // 2. Verify topic ownership. RLS hides rows owned by others, so absence of
  // the row means either the topic does not exist or it belongs to another user.
  const { data: topic, error: topicError } = await supabase
    .from('topics')
    .select('id')
    .eq('id', topicId)
    .maybeSingle();

  if (topicError) throw new Error(topicError.message);
  if (!topic) {
    throw new Error('Unauthorized: Topic does not exist or belong to user');
  }

  // 3. Prepare metadata and paths (client-generated id so the storage path
  // is known before the upload starts)
  const documentId = crypto.randomUUID();
  const storagePath = `users/${userId}/documents/${documentId}.pdf`;
  const originalName = file.name.trim();

  // 4. Upload bytes to Supabase Storage (no upsert: a fresh id never collides)
  onProgress?.(0);
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // 5. Create the metadata row, returning the real database row
  const { data: created, error: insertError } = await supabase
    .from('documents')
    .insert({
      id: documentId,
      owner_id: userId,
      topic_id: topicId,
      original_name: originalName,
      storage_path: storagePath,
      mime_type: file.type,
      size: file.size,
    })
    .select(DOCUMENT_COLUMNS)
    .single();

  if (insertError) {
    // Attempt rollback of storage file if metadata creation fails
    try {
      await supabase.storage.from('documents').remove([storagePath]);
    } catch (cleanupError) {
      console.error('Failed to cleanup storage after metadata creation failed', cleanupError);
    }
    throw new Error('Failed to save document metadata');
  }

  onProgress?.(100);
  return mapDocument(created);
}

/**
 * Deletes the document's storage object first, then its metadata row.
 * RLS hides rows owned by others, so absence of the row is indistinguishable
 * from "another user's document".
 */
export async function deleteDocument(userId: string, documentId: string): Promise<void> {
  if (!userId) throw new Error('User must be authenticated');

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!document) throw new Error('Document not found');

  // Delete the physical storage object first.
  // If this fails due to a network/permission error, we abort before deleting
  // metadata, preserving metadata so the user can retry and the file is not orphaned.
  const { error: removeError } = await supabase.storage
    .from('documents')
    .remove([document.storage_path]);

  // If the object is already missing in storage, treat as idempotent cleanup condition
  if (removeError && !/not found/i.test(removeError.message)) {
    throw new Error(`Failed to delete file from storage: ${removeError.message}`);
  }

  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (deleteError) throw new Error(deleteError.message);
}

/** Creates a short-lived signed URL for a document's storage object. */
async function createDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 3600);

  if (error) throw new Error(error.message);

  return data.signedUrl;
}

/**
 * Returns a short-lived signed URL for the document's storage object.
 */
export async function getDocumentDownloadUrl(userId: string, documentId: string): Promise<string> {
  if (!userId) throw new Error('User must be authenticated');

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!document) throw new Error('Document not found');

  return createDocumentSignedUrl(document.storage_path);
}

/**
 * Downloads the document's PDF bytes through its private signed URL and
 * returns them together with the document metadata.
 *
 * This is a pure application-level operation: no PDF.js, no inspection,
 * no OCR, no object URLs. The signed URL is used only here to fetch the
 * blob and never reaches the UI; the viewer renders the Blob locally.
 * Network failures and aborts propagate as raw errors for the caller to
 * map (an aborted fetch rejects with AbortError, so cancellation stays
 * distinguishable).
 */
export async function downloadDocument(
  userId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<{ document: Document; blob: Blob }> {
  if (!userId) throw new Error('User must be authenticated');

  // Ownership-safe metadata query: RLS hides rows owned by others, so
  // absence of the row is indistinguishable from "another user's document".
  // Content is selected here (and only here) so the viewer can reuse
  // persisted extraction data instead of re-inspecting the PDF.
  const { data: row, error: fetchError } = await supabase
    .from('documents')
    .select(DOCUMENT_COLUMNS_WITH_CONTENT)
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error('Document not found');

  const signedUrl = await createDocumentSignedUrl(row.storage_path);
  const response = await fetch(signedUrl, { signal });

  if (!response.ok) {
    throw new Error('Failed to download document');
  }

  return { document: mapDocument(row), blob: await response.blob() };
}

/**
 * Persists one processing lifecycle transition and returns the real
 * database row. A 'completed' transition must carry the freshly extracted
 * content — content and status are written in ONE update, so a document
 * can never be openable while its extraction data is still missing.
 *
 * RLS restricts the write to the owner's own row (the update policy's
 * topic-ownership check still passes because topic_id is not changed),
 * and documents_check_immutable does not list processing_status/content.
 */
export async function updateDocumentProcessing(
  userId: string,
  documentId: string,
  update: { processingStatus: DocumentProcessingStatus; content?: DocumentContent },
): Promise<Document> {
  if (!userId) throw new Error('User must be authenticated');

  // The content column is always selected: the row is a single document,
  // and a conditional select string would make the response type a union
  // that mapDocument cannot accept.
  const { data: row, error } = await supabase
    .from('documents')
    .update({
      processing_status: update.processingStatus,
      ...(update.content === undefined
        ? {}
        : { content: update.content as unknown as Json }),
    })
    .eq('id', documentId)
    .select(DOCUMENT_COLUMNS_WITH_CONTENT)
    .single();

  if (error) throw new Error(error.message);

  return mapDocument(row);
}

export function normalizeDocumentName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.pdf') {
    throw new Error('Dateiname darf nicht leer sein');
  }
  let normalized = trimmed;
  if (!normalized.toLowerCase().endsWith('.pdf')) {
    normalized = `${normalized}.pdf`;
  }
  if (normalized.length > 255) {
    throw new Error('Dateiname darf maximal 255 Zeichen lang sein');
  }
  return normalized;
}

/**
 * Renames the document (original_name only, storage path unchanged).
 */
export async function renameDocument(
  userId: string,
  documentId: string,
  newName: string,
): Promise<Document> {
  if (!userId) throw new Error('User must be authenticated');
  if (!documentId) throw new Error('Document ID is required');

  const sanitizedName = normalizeDocumentName(newName);

  const { data: existing, error: fetchError } = await supabase
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error('Dokument nicht gefunden');

  const { data: updated, error: updateError } = await supabase
    .from('documents')
    .update({ original_name: sanitizedName })
    .eq('id', documentId)
    .select(DOCUMENT_COLUMNS)
    .single();

  if (updateError) throw new Error(updateError.message);

  return mapDocument(updated);
}

/**
 * Moves the document into another of the user's topics (topic_id only,
 * storage path unchanged).
 */
export async function moveDocument(
  userId: string,
  documentId: string,
  targetTopicId: string,
): Promise<Document> {
  if (!userId) throw new Error('User must be authenticated');
  if (!documentId) throw new Error('Document ID is required');
  if (!targetTopicId || !targetTopicId.trim()) {
    throw new Error('Ziel-Thema ist ungültig');
  }

  // 1. Verify the target topic exists and belongs to the user
  const { data: targetTopic, error: topicError } = await supabase
    .from('topics')
    .select('id')
    .eq('id', targetTopicId)
    .maybeSingle();

  if (topicError) throw new Error(topicError.message);
  if (!targetTopic) {
    throw new Error('Unauthorized: Ziel-Thema existiert nicht oder gehört einem anderen Benutzer');
  }

  // 2. Load the existing document
  const { data: existing, error: fetchError } = await supabase
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!existing) throw new Error('Dokument nicht gefunden');

  if (existing.topic_id === targetTopicId) {
    return mapDocument(existing);
  }

  // 3. Update only topicId and updatedAt, returning the real database row
  const { data: updated, error: updateError } = await supabase
    .from('documents')
    .update({ topic_id: targetTopicId })
    .eq('id', documentId)
    .select(DOCUMENT_COLUMNS)
    .single();

  if (updateError) throw new Error(updateError.message);

  return mapDocument(updated);
}
