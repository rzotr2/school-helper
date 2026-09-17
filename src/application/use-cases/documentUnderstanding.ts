import { supabase } from '../../infrastructure/supabase/client';
import type { Json } from '../../infrastructure/supabase/database.types';
import type { DocumentContent, PageContent } from './documentContent';

/**
 * Standard classification types for school/study materials.
 */
export type DocumentType =
  | 'worksheet'
  | 'script'
  | 'summary'
  | 'exam'
  | 'presentation'
  | 'notes'
  | 'other';

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'worksheet',
  'script',
  'summary',
  'exam',
  'presentation',
  'notes',
  'other',
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  worksheet: 'Arbeitsblatt',
  script: 'Skript',
  summary: 'Zusammenfassung',
  exam: 'Klausur / Test',
  presentation: 'Präsentation',
  notes: 'Notizen',
  other: 'Dokument',
};

/**
 * Lightweight semantic metadata layer persisted in documents.understanding.
 */
export interface DocumentUnderstanding {
  /** Concise, clean semantic title of the document (max 100 chars). */
  title: string | null;
  /** Primary classification of the document type. */
  documentType: DocumentType;
  /** Identified academic or school subject (e.g. "Informatik", "Mathematik", "Geschichte"). */
  subject: string | null;
  /** Concise high-level description/summary (1–3 sentences, max 400 chars). */
  summary: string;
  /** 3 to 10 core concepts or key topics covered in the document. */
  keyTopics: string[];
  /** ISO timestamp when understanding was analyzed. */
  analyzedAt: string;
}

/**
 * Prepares deterministic text input from DocumentContent for semantic understanding.
 *
 * Rules:
 * 1. Iterates over pages in DocumentContent.
 * 2. Prioritizes deterministic structural `blocks`:
 *    - 'heading': formatted with markdown '#' or '##'
 *    - 'list': formatted with '-'
 *    - 'paragraph': regular text
 * 3. Falls back to `nativeText` when blocks are absent/empty.
 * 4. Uses `ocrText` only if native text is unusable or empty.
 * 5. Formats clear page demarcations (`--- Seite X ---`).
 * 6. Caps total characters at `maxChars` (default 60,000) deterministically.
 */
export function prepareUnderstandingInput(
  content: DocumentContent | null,
  maxChars = 60000,
): string {
  if (!content || !Array.isArray(content.pages) || content.pages.length === 0) {
    return '';
  }

  const pageSections: string[] = [];
  let currentTotalChars = 0;
  let truncated = false;

  for (const page of content.pages) {
    const pageText = extractPageTextForUnderstanding(page).trim();
    if (!pageText) continue;

    const pageHeader = `--- Seite ${page.pageNumber} ---\n`;
    const section = `${pageHeader}${pageText}\n\n`;

    if (currentTotalChars + section.length > maxChars) {
      const remainingAllowed = maxChars - currentTotalChars - pageHeader.length - 25; // allowance for footer
      if (remainingAllowed > 50) {
        const partial = pageText.slice(0, remainingAllowed).trim();
        pageSections.push(`${pageHeader}${partial}\n\n[Inhalt gekürzt]`);
      } else {
        pageSections.push('[Inhalt gekürzt]');
      }
      truncated = true;
      break;
    }

    pageSections.push(section);
    currentTotalChars += section.length;
  }

  const result = pageSections.join('').trim();
  return result;
}

function extractPageTextForUnderstanding(page: PageContent): string {
  // 1. Prefer structural blocks if available and non-empty
  if (page.blocks && page.blocks.length > 0) {
    const blockTexts = page.blocks
      .map((block) => {
        const text = block.text.trim();
        if (!text) return '';
        if (block.type === 'heading') return `## ${text}`;
        if (block.type === 'list') return `- ${text}`;
        return text;
      })
      .filter(Boolean);

    if (blockTexts.length > 0) {
      return blockTexts.join('\n\n');
    }
  }

  // 2. Fall back to native text if usable
  if (page.quality.usable && page.nativeText.trim()) {
    return page.nativeText.trim();
  }

  // 3. Fall back to OCR text
  if (page.ocrText && page.ocrText.trim()) {
    return page.ocrText.trim();
  }

  // 4. If native text exists even if marked unusable, return it rather than nothing
  if (page.nativeText.trim()) {
    return page.nativeText.trim();
  }

  return '';
}

/**
 * Defensive runtime validation for DocumentUnderstanding JSON.
 * Normalizes invalid types, clamps arrays, trims strings, and returns null
 * if essential fields are missing or corrupt.
 */
export function validateDocumentUnderstanding(raw: unknown): DocumentUnderstanding | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const data = raw as Record<string, unknown>;

  // Title: optional string, max 100 chars
  let title: string | null = null;
  if (typeof data.title === 'string') {
    const trimmed = data.title.trim();
    if (trimmed) {
      title = trimmed.length > 100 ? trimmed.slice(0, 97) + '...' : trimmed;
    }
  }

  // DocumentType: must be one of DOCUMENT_TYPES, default to 'other'
  let documentType: DocumentType = 'other';
  if (typeof data.documentType === 'string') {
    const candidate = data.documentType.toLowerCase().trim() as DocumentType;
    if (DOCUMENT_TYPES.includes(candidate)) {
      documentType = candidate;
    }
  }

  // Subject: optional string, max 80 chars
  let subject: string | null = null;
  if (typeof data.subject === 'string') {
    const trimmed = data.subject.trim();
    if (trimmed) {
      subject = trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed;
    }
  }

  // Summary: required non-empty string, max 400 chars
  if (typeof data.summary !== 'string' || !data.summary.trim()) {
    return null;
  }
  let summary = data.summary.trim();
  if (summary.length > 400) {
    summary = summary.slice(0, 397) + '...';
  }

  // KeyTopics: array of 3 to 10 strings
  let keyTopics: string[] = [];
  if (Array.isArray(data.keyTopics)) {
    const uniqueTopics = new Set<string>();
    for (const item of data.keyTopics) {
      if (typeof item === 'string') {
        const clean = item.trim().replace(/^[-*•\d.)\s]+/, '');
        if (clean && clean.length <= 60) {
          uniqueTopics.add(clean);
        }
      }
    }
    keyTopics = Array.from(uniqueTopics);
  }

  // Ensure between 3 and 10 topics if possible
  if (keyTopics.length > 10) {
    keyTopics = keyTopics.slice(0, 10);
  }

  // AnalyzedAt: valid ISO timestamp or default to now
  let analyzedAt: string;
  if (typeof data.analyzedAt === 'string' && !Number.isNaN(Date.parse(data.analyzedAt))) {
    analyzedAt = data.analyzedAt;
  } else {
    analyzedAt = new Date().toISOString();
  }

  return {
    title,
    documentType,
    subject,
    summary,
    keyTopics,
    analyzedAt,
  };
}

import { parseDocumentContent } from './documentContent';

/**
 * DeepSeek chat completions endpoint.
 * In browser development (Vite dev server), uses local proxy '/api/deepseek/chat/completions'
 * to avoid CORS restrictions. In production or non-browser, calls 'https://api.deepseek.com/chat/completions'.
 */
const DEEPSEEK_ENDPOINT =
  typeof window !== 'undefined' && window.location.origin.includes('localhost')
    ? '/api/deepseek/chat/completions'
    : 'https://api.deepseek.com/chat/completions';

export function getDeepSeekApiKey(): string {
  const envKey = (import.meta as any).env?.VITE_DEEPSEEK_API_KEY;
  if (typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return '';
}

/**
 * Calls DeepSeek Chat Completions API with the prepared text to extract
 * semantic document understanding metadata.
 */
export async function analyzeDocumentWithDeepSeek(
  originalName: string,
  preparedText: string,
  apiKey?: string,
): Promise<DocumentUnderstanding> {
  const key = apiKey || getDeepSeekApiKey();
  if (!key) {
    throw new Error(
      'DeepSeek API Key fehlt. Bitte trage VITE_DEEPSEEK_API_KEY in deiner .env Datei ein.',
    );
  }

  const systemPrompt = `You are an educational assistant analyzing a student's study document.
Analyze the provided document text and extract lightweight, clean semantic metadata.

You must respond ONLY with a valid JSON object adhering strictly to this schema:
{
  "title": string or null (max 100 chars, concise semantic title of the document, clean of file extensions),
  "documentType": "worksheet" | "script" | "summary" | "exam" | "presentation" | "notes" | "other",
  "subject": string or null (e.g. "Informatik", "Mathematik", "Geschichte", "Biologie", "Deutsch", "Englisch"),
  "summary": string (1 to 3 concise sentences summarizing what this document is about, max 350 chars),
  "keyTopics": string[] (3 to 8 key concepts, topics or vocabulary items covered in the document)
}

Important:
- Use the language of the document (predominantly German, Ukrainian, or English).
- Do not output markdown code blocks or backticks, just the raw JSON object.
- Keep summary clear and informative for a student.`;

  const userPrompt = `Dateiname: ${originalName}\n\nDokumententext:\n${preparedText}`;

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `DeepSeek API Fehler (${response.status}): ${errorText || response.statusText}`,
    );
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Keine Antwort von DeepSeek erhalten');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error('Ungültiges JSON-Format von DeepSeek empfangen');
  }

  const validated = validateDocumentUnderstanding(parsed);
  if (!validated) {
    throw new Error('Die von DeepSeek empfangenen Daten entsprechen nicht dem Schema');
  }

  return validated;
}

/**
 * In-flight document analysis promises to prevent duplicate runs in the same browser session.
 */
const activeUnderstandingRuns = new Map<string, Promise<DocumentUnderstanding>>();

export interface UnderstandDocumentOptions {
  /** If true, re-analyzes the document even if understanding already exists. */
  force?: boolean;
  /** Optional API key override. */
  apiKey?: string;
}

/**
 * Generates semantic metadata for a document via DeepSeek API
 * and persists the result to public.documents.understanding.
 */
export async function understandDocument(
  userId: string,
  documentId: string,
  options: UnderstandDocumentOptions = {},
): Promise<DocumentUnderstanding> {
  if (!userId) throw new Error('User must be authenticated');
  if (!documentId) throw new Error('Document ID is required');

  const active = activeUnderstandingRuns.get(documentId);
  if (active !== undefined) return active;

  const run = runUnderstandDocument(userId, documentId, options);
  activeUnderstandingRuns.set(documentId, run);
  run.then(
    () => activeUnderstandingRuns.delete(documentId),
    () => activeUnderstandingRuns.delete(documentId),
  );

  return run;
}

async function runUnderstandDocument(
  userId: string,
  documentId: string,
  options: UnderstandDocumentOptions,
): Promise<DocumentUnderstanding> {
  // 1. Fetch document row to inspect existing understanding and content
  const { data: docRow, error: fetchError } = await supabase
    .from('documents')
    .select('id, owner_id, original_name, content, understanding')
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!docRow) throw new Error('Dokument nicht gefunden');
  if (docRow.owner_id !== userId) throw new Error('Unauthorized');

  // 2. If understanding already exists and not forced, return it immediately
  if (!options.force && docRow.understanding) {
    const existing = validateDocumentUnderstanding(docRow.understanding);
    if (existing) {
      return existing;
    }
  }

  // 3. Prepare text input deterministically from persisted content
  const parsedContent = parseDocumentContent(docRow.content);
  const preparedText = prepareUnderstandingInput(parsedContent);
  if (!preparedText.trim()) {
    throw new Error('Das Dokument hat keinen extrahierten Text für eine semantische Analyse');
  }

  // 4. Call DeepSeek API
  const validated = await analyzeDocumentWithDeepSeek(
    docRow.original_name,
    preparedText,
    options.apiKey,
  );

  // 5. Update the document row with the validated understanding
  const { error: updateError } = await supabase
    .from('documents')
    .update({
      understanding: validated as unknown as Json,
    })
    .eq('id', documentId);

  if (updateError) {
    throw new Error(`Fehler beim Speichern der Analyse: ${updateError.message}`);
  }

  return validated;
}
