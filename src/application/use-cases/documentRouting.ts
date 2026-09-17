import { supabase } from '../../infrastructure/supabase/client';
import { Subject, getSubjects } from './subjects';
import { Topic, getAllTopics, createTopic } from './topics';
import { moveDocument } from './documents';
import { parseDocumentContent } from './documentContent';
import {
  prepareUnderstandingInput,
  understandDocument,
  getDeepSeekApiKey,
  type DocumentUnderstanding,
} from './documentUnderstanding';

export interface UserTaxonomyTopic {
  id: string;
  name: string;
}

export interface UserTaxonomySubject {
  id: string;
  name: string;
  topics: UserTaxonomyTopic[];
}

export interface TopicRecommendation {
  topicId: string;
  reason: string;
}

export interface NewTopicSuggestion {
  subjectId: string;
  name: string;
  reason: string;
}

export interface DocumentRoutingRecommendation {
  /** The matching subject ID from the user's taxonomy, or null if no subject fits. */
  subjectId: string | null;
  /** Ordered list of up to 3 topic recommendations belonging to subjectId. */
  topicRecommendations: TopicRecommendation[];
  /** Optional suggestion for a new topic if subject fits but no existing topic matches. */
  newTopicSuggestion: NewTopicSuggestion | null;
}

/**
 * Builds a clean taxonomy hierarchy of the user's subjects and topics.
 */
export function buildUserTaxonomy(
  subjects: Subject[],
  topics: Topic[],
): UserTaxonomySubject[] {
  return subjects.map((subject) => {
    const subjectTopics = topics
      .filter((topic) => topic.subjectId === subject.id)
      .map((topic) => ({ id: topic.id, name: topic.name }));
    return {
      id: subject.id,
      name: subject.name,
      topics: subjectTopics,
    };
  });
}

/**
 * Validates AI output against the user's actual taxonomy.
 * - Subject ID must exist in taxonomy.
 * - Every topicId in recommendations must exist under that subject.
 * - Max 3 recommendations kept.
 * - Duplicates filtered.
 * - If newTopicSuggestion is given, subjectId must match and name must not duplicate an existing topic.
 */
export function validateRoutingResponse(
  raw: unknown,
  taxonomy: UserTaxonomySubject[],
): DocumentRoutingRecommendation {
  const fallback: DocumentRoutingRecommendation = {
    subjectId: null,
    topicRecommendations: [],
    newTopicSuggestion: null,
  };

  if (typeof raw !== 'object' || raw === null) {
    return fallback;
  }

  const data = raw as Record<string, unknown>;

  // 1. Validate subjectId
  let resolvedSubject: UserTaxonomySubject | null = null;
  if (typeof data.subjectId === 'string' && data.subjectId.trim()) {
    const candidateId = data.subjectId.trim();
    resolvedSubject = taxonomy.find((s) => s.id === candidateId) ?? null;
  }

  if (!resolvedSubject) {
    return fallback;
  }

  const subjectId = resolvedSubject.id;
  const validTopicMap = new Map(resolvedSubject.topics.map((t) => [t.id, t.name]));

  // 2. Validate topicRecommendations
  const topicRecommendations: TopicRecommendation[] = [];
  const seenTopicIds = new Set<string>();

  if (Array.isArray(data.topicRecommendations)) {
    for (const rec of data.topicRecommendations) {
      if (typeof rec === 'object' && rec !== null) {
        const item = rec as Record<string, unknown>;
        const tId = typeof item.topicId === 'string' ? item.topicId.trim() : '';
        const reason = typeof item.reason === 'string' ? item.reason.trim() : '';

        if (tId && validTopicMap.has(tId) && !seenTopicIds.has(tId)) {
          seenTopicIds.add(tId);
          topicRecommendations.push({
            topicId: tId,
            reason: reason ? (reason.length > 250 ? reason.slice(0, 247) + '...' : reason) : '',
          });
          if (topicRecommendations.length >= 3) break;
        }
      }
    }
  }

  // 3. Validate newTopicSuggestion
  let newTopicSuggestion: NewTopicSuggestion | null = null;
  if (typeof data.newTopicSuggestion === 'object' && data.newTopicSuggestion !== null) {
    const sug = data.newTopicSuggestion as Record<string, unknown>;
    const sugSubjectId = typeof sug.subjectId === 'string' ? sug.subjectId.trim() : '';
    const sugName = typeof sug.name === 'string' ? sug.name.trim() : '';
    const sugReason = typeof sug.reason === 'string' ? sug.reason.trim() : '';

    if (sugSubjectId === subjectId && sugName) {
      const normalizedName = sugName.slice(0, 100);
      const isDuplicate = Array.from(validTopicMap.values()).some(
        (existingName) => existingName.toLowerCase() === normalizedName.toLowerCase(),
      );

      if (!isDuplicate) {
        newTopicSuggestion = {
          subjectId,
          name: normalizedName,
          reason: sugReason ? (sugReason.length > 250 ? sugReason.slice(0, 247) + '...' : sugReason) : '',
        };
      }
    }
  }

  return {
    subjectId,
    topicRecommendations,
    newTopicSuggestion,
  };
}

const DEEPSEEK_ENDPOINT =
  typeof window !== 'undefined' && window.location.origin.includes('localhost')
    ? '/api/deepseek/chat/completions'
    : 'https://api.deepseek.com/chat/completions';

/**
 * Calls DeepSeek Chat Completions API to recommend a subject and topics.
 */
export async function callDeepSeekRouting(
  taxonomy: UserTaxonomySubject[],
  originalName: string,
  understanding: DocumentUnderstanding | null,
  preparedText: string,
  apiKey?: string,
): Promise<DocumentRoutingRecommendation> {
  const key = apiKey || getDeepSeekApiKey();
  if (!key) {
    throw new Error(
      'DeepSeek API Key fehlt. Bitte trage VITE_DEEPSEEK_API_KEY in deiner .env Datei ein.',
    );
  }

  const systemPrompt = `You are an educational assistant classifying a student's document into their existing subject and topic taxonomy.
You may ONLY select subject and topic IDs from the supplied taxonomy.
Never invent subject IDs or topic IDs.
Never rename or modify existing subjects or topics.
If an existing subject is clearly relevant but none of its existing topics sufficiently match the document, return that subjectId and provide a suggested new topic name in "newTopicSuggestion".
If no existing subject is sufficiently relevant, return "subjectId": null.
Do not force a classification.
Return recommendations, not a final assignment.
Do not return confidence scores or percentages.

Output strictly valid JSON with this schema:
{
  "subjectId": string or null,
  "topicRecommendations": [
    { "topicId": string, "reason": string }
  ],
  "newTopicSuggestion": {
    "subjectId": string,
    "name": string,
    "reason": string
  } or null
}`;

  const taxonomyJson = JSON.stringify(taxonomy, null, 2);
  const userPrompt = `Verfügbare Fächer und Themen des Benutzers (Taxonomie):
${taxonomyJson}

Dokumentname: ${originalName}
${understanding ? `Titel: ${understanding.title ?? '-'}\nFachgebiet: ${understanding.subject ?? '-'}\nTyp: ${understanding.documentType}\nZusammenfassung: ${understanding.summary}\nSchlüsselbegriffe: ${understanding.keyTopics.join(', ')}` : ''}

Auszug aus dem Dokumententext:
${preparedText.slice(0, 15000)}`;

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
      temperature: 0.1,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`DeepSeek API Fehler (${response.status}): ${errText || response.statusText}`);
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

  return validateRoutingResponse(parsed, taxonomy);
}

export interface GetDocumentRoutingOptions {
  apiKey?: string;
}

/**
 * Generates routing recommendations for a processed document against the user's current taxonomy.
 * This is recommendation-only and DOES NOT mutate the document or database.
 */
export async function getDocumentRoutingRecommendations(
  userId: string,
  documentId: string,
  options: GetDocumentRoutingOptions = {},
): Promise<DocumentRoutingRecommendation> {
  if (!userId) throw new Error('User must be authenticated');
  if (!documentId) throw new Error('Document ID is required');

  // 1. Fetch document and verify ownership
  const { data: docRow, error: fetchError } = await supabase
    .from('documents')
    .select('id, owner_id, original_name, content, processing_status, understanding')
    .eq('id', documentId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!docRow) throw new Error('Dokument nicht gefunden');
  if (docRow.owner_id !== userId) throw new Error('Unauthorized');

  if (docRow.processing_status !== 'completed') {
    throw new Error('Dokumentverarbeitung ist noch nicht abgeschlossen');
  }

  // 2. Load user's subjects and topics
  const [subjects, topics] = await Promise.all([
    getSubjects(userId),
    getAllTopics(userId),
  ]);

  const taxonomy = buildUserTaxonomy(subjects, topics);
  if (taxonomy.length === 0) {
    return {
      subjectId: null,
      topicRecommendations: [],
      newTopicSuggestion: null,
    };
  }

  // 3. Load or generate understanding if needed
  let understanding: DocumentUnderstanding | null = null;
  try {
    understanding = await understandDocument(userId, documentId);
  } catch (e) {
    console.warn('[Routing] Understanding failed or skipped, proceeding with raw text:', e);
  }

  // 4. Prepare text input
  const parsedContent = parseDocumentContent(docRow.content);
  const preparedText = prepareUnderstandingInput(parsedContent);

  // 5. Call AI routing
  return await callDeepSeekRouting(
    taxonomy,
    docRow.original_name,
    understanding,
    preparedText,
    options.apiKey,
  );
}

/**
 * Assigns a document to a topic after explicit user confirmation.
 */
export async function assignDocumentToTopic(
  userId: string,
  documentId: string,
  topicId: string,
) {
  return await moveDocument(userId, documentId, topicId);
}
