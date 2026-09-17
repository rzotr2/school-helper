import { supabase } from '../../../infrastructure/supabase/client';
import { parseDocumentContent, type PageContent } from '../documentContent';
import type { GroundedSource } from './learningTypes';

interface DocumentRetrievalRow {
  id: string;
  topic_id: string;
  original_name: string;
  content: unknown;
  processing_status: string;
  owner_id: string;
}

/**
 * Extracts readable learning text from a PageContent representation.
 * Prioritizes:
 * 1. Deterministic structural blocks (headings, lists, paragraphs).
 * 2. User/student annotations with text.
 * 3. Usable native text layer.
 * 4. OCR text layer.
 */
function extractLearningTextFromPage(page: PageContent): string {
  const parts: string[] = [];

  if (page.blocks && page.blocks.length > 0) {
    for (const block of page.blocks) {
      const trimmed = block.text.trim();
      if (!trimmed) continue;
      if (block.type === 'heading') parts.push(`### ${trimmed}`);
      else if (block.type === 'list') parts.push(`- ${trimmed}`);
      else parts.push(trimmed);
    }
  } else if (page.quality.usable && page.nativeText.trim()) {
    parts.push(page.nativeText.trim());
  } else if (page.ocrText && page.ocrText.trim()) {
    parts.push(page.ocrText.trim());
  } else if (page.nativeText.trim()) {
    parts.push(page.nativeText.trim());
  }

  // Include student/user annotations as learning context
  if (page.annotations && page.annotations.length > 0) {
    const notes = page.annotations
      .map((ann) => ann.content.trim())
      .filter(Boolean);
    if (notes.length > 0) {
      parts.push(`[Anmerkungen/Notizen: ${notes.join('; ')}]`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Retrieves completed documents for the selected topics and formats them
 * into normalized GroundedSource entries.
 *
 * Enforces ownership: only returns documents belonging to the authenticated user.
 */
export async function retrieveTopicDocuments(
  userId: string,
  topicIds: string[],
): Promise<GroundedSource[]> {
  if (!userId) {
    throw new Error('User must be authenticated');
  }
  if (!topicIds || topicIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id, topic_id, original_name, content, processing_status, owner_id')
    .eq('owner_id', userId)
    .in('topic_id', topicIds)
    .eq('processing_status', 'completed');

  if (error) {
    throw new Error(`Fehler beim Laden der Dokumente: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  const sources: GroundedSource[] = [];
  let docIndex = 1;

  for (const row of data as DocumentRetrievalRow[]) {
    const content = parseDocumentContent(row.content);
    if (!content || !Array.isArray(content.pages) || content.pages.length === 0) {
      continue;
    }

    for (const page of content.pages) {
      const pageText = extractLearningTextFromPage(page).trim();
      if (!pageText) continue;

      sources.push({
        id: `doc-${docIndex++}`,
        type: 'document',
        title: `${row.original_name} (Seite ${page.pageNumber})`,
        documentId: row.id,
        documentName: row.original_name,
        pageNumber: page.pageNumber,
        content: pageText,
      });
    }
  }

  return sources;
}
