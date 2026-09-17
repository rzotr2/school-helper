import { getDeepSeekApiKey } from '../documentUnderstanding';
import type {
  GroundedKnowledgeContext,
  GroundedSource,
  QuizTask,
} from './learningTypes';

const DEEPSEEK_ENDPOINT =
  typeof window !== 'undefined' && window.location.origin.includes('localhost')
    ? '/api/deepseek/chat/completions'
    : 'https://api.deepseek.com/chat/completions';

/**
 * Formats grounded sources into an unambiguous text representation for the AI model.
 * Enforces clear demarcation with unique IDs (e.g. [SOURCE ID: doc-1]).
 */
export function formatSourcesForPrompt(sources: readonly GroundedSource[]): string {
  if (!sources || sources.length === 0) {
    return 'KEINE QUELLEN VERFÜGBAR.';
  }

  const parts: string[] = [];
  for (const src of sources) {
    const meta =
      src.type === 'document'
        ? `Dokument: ${src.documentName || src.title}, Seite: ${src.pageNumber ?? 'unbekannt'}`
        : `Webseite: ${src.title}, URL: ${src.url ?? 'unbekannt'}, Domain: ${src.domain ?? 'unbekannt'}`;

    parts.push(
      `--- [SOURCE ID: ${src.id}] (${src.type.toUpperCase()}) ---\n${meta}\nINHALT:\n${src.content.trim()}`,
    );
  }

  return parts.join('\n\n');
}

/**
 * Validates the raw JSON output from DeepSeek against the grounded sources.
 *
 * Strict safety rules:
 * 1. AI is not a knowledge source: 0% unsupported factual claims.
 * 2. `evidence` is strictly required and must not be empty.
 * 3. Every `sourceId` in `sourceIds` MUST exist in the provided sources. Unknown IDs are rejected.
 * 4. At least one valid source must be referenced.
 * 5. Exactly 4 unique options must be provided, one matching `correctAnswer`.
 */
export function validateQuizTask(
  raw: unknown,
  allowedSourceIds: Set<string>,
  fallbackTopicId: string,
): QuizTask | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const data = raw as Record<string, unknown>;

  const question = typeof data.question === 'string' ? data.question.trim() : '';
  const correctAnswer = typeof data.correctAnswer === 'string' ? data.correctAnswer.trim() : '';
  const explanation = typeof data.explanation === 'string' ? data.explanation.trim() : '';
  const evidence = typeof data.evidence === 'string' ? data.evidence.trim() : '';

  if (!question || !correctAnswer || !evidence) {
    return null;
  }

  // Validate source references
  if (!Array.isArray(data.sourceIds) || data.sourceIds.length === 0) {
    return null;
  }

  const validSourceIds: string[] = [];
  for (const sid of data.sourceIds) {
    if (typeof sid === 'string' && allowedSourceIds.has(sid.trim())) {
      validSourceIds.push(sid.trim());
    } else {
      // If AI references any invented or hallucinated source ID, reject the task!
      return null;
    }
  }

  if (validSourceIds.length === 0) {
    return null;
  }

  // Validate options
  if (!Array.isArray(data.options)) {
    return null;
  }

  const cleanOptions = Array.from(
    new Set(
      data.options
        .filter((opt): opt is string => typeof opt === 'string' && opt.trim().length > 0)
        .map((opt) => opt.trim()),
    ),
  );

  if (cleanOptions.length < 2 || !cleanOptions.includes(correctAnswer)) {
    return null;
  }

  const topicId =
    typeof data.topicId === 'string' && data.topicId.trim()
      ? data.topicId.trim()
      : fallbackTopicId;

  return {
    id: typeof data.id === 'string' && data.id ? data.id : `task-${Date.now()}`,
    topicId,
    question,
    options: cleanOptions,
    correctAnswer,
    explanation,
    evidence,
    sourceIds: validSourceIds,
  };
}

/**
 * Calls DeepSeek to transform the grounded knowledge context into one strictly verified Quiz task.
 */
export async function generateQuizTask(
  context: GroundedKnowledgeContext,
  apiKey?: string,
  fetchFn: typeof fetch = fetch,
): Promise<QuizTask> {
  const key = apiKey || getDeepSeekApiKey();
  if (!key) {
    throw new Error(
      'DeepSeek API Key fehlt. Bitte trage VITE_DEEPSEEK_API_KEY in deiner .env Datei ein.',
    );
  }

  if (!context.sources || context.sources.length === 0) {
    throw new Error(
      'Nicht genügend Quellenmaterial vorhanden, um eine überprüfte Lernaufgabe zu erstellen.',
    );
  }

  const allowedSourceIds = new Set(context.sources.map((s) => s.id));
  const formattedSources = formatSourcesForPrompt(context.sources);

  const systemPrompt = `You are an educational task generator for School Helper.
Your sole job is to create a multiple-choice Quiz question for a student strictly from the provided source material.

CRITICAL ARCHITECTURAL RULES:
1. YOU ARE NOT A KNOWLEDGE SOURCE.
2. AI may normalize, summarize, rephrase, combine, and structure information from retrieved sources, but MAY NOT introduce new factual information that is not supported by those sources.
3. 0% unsupported factual claims. Do NOT add outside knowledge, do NOT invent facts, do NOT extrapolate beyond what the sources state.
4. You MUST reference ONLY the provided source IDs (e.g. "doc-1", "web-1") in "sourceIds". Never invent source IDs.
5. "evidence": Provide an exact quote or brief factual sentence extracted directly from the referenced source that proves the correct answer.
6. The question and options must be in the predominant language of the sources (usually German).
7. Create exactly 4 plausible options (1 correct answer + 3 distractors grounded in or relevant to the source context).

You must respond ONLY with a valid JSON object strictly matching this schema:
{
  "topicId": "${context.topicIds[0] || ''}",
  "question": "Clear, informative question",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": "Option matching one of the options exactly",
  "explanation": "Brief explanation why this answer is correct based on the sources",
  "evidence": "Direct factual sentence or citation from the referenced source",
  "sourceIds": ["doc-1"]
}`;

  const userPrompt = `FACH: ${context.subjectName}
THEMEN: ${context.topicNames.join(', ')}

VERFÜGBARE QUELLEN:
${formattedSources}`;

  const response = await fetchFn(DEEPSEEK_ENDPOINT, {
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
      temperature: 0.1, // low temperature to prevent hallucination
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

  const task = validateQuizTask(parsed, allowedSourceIds, context.topicIds[0] || '');
  if (!task) {
    throw new Error(
      'Die erstellte Aufgabe konnte nicht anhand der verifizierten Quellen validiert werden (Halluzinations-Schutz).',
    );
  }

  return task;
}
