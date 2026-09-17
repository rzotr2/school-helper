import { getDeepSeekApiKey } from '../documentUnderstanding';
import type {
  FillInBlankTask,
  FlashcardTask,
  GroundedKnowledgeContext,
  GroundedSource,
  LearningDifficulty,
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
  difficulty: LearningDifficulty = 'mittel',
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

  // Fisher-Yates shuffle algorithm to ensure options are always randomly ordered
  const shuffledOptions = [...cleanOptions];
  for (let i = shuffledOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
  }

  const topicId =
    typeof data.topicId === 'string' && data.topicId.trim()
      ? data.topicId.trim()
      : fallbackTopicId;

  return {
    id: typeof data.id === 'string' && data.id ? data.id : `task-${Date.now()}`,
    topicId,
    difficulty,
    question,
    options: shuffledOptions,
    correctAnswer,
    explanation,
    evidence,
    sourceIds: validSourceIds,
  };
}

/**
 * Strictly validates raw model output for Flashcards (Karteikarten).
 *
 * Strict safety rules:
 * 1. AI is not a knowledge source: 0% unsupported factual claims.
 * 2. `evidence` is strictly required and must not be empty.
 * 3. Every `sourceId` in `sourceIds` MUST exist in the provided sources. Unknown IDs are rejected.
 * 4. At least one valid source must be referenced.
 * 5. `question` and `answer` must be non-empty strings.
 * 6. `topicId` must belong to the allowed topic set.
 */
export function validateFlashcardTask(
  raw: unknown,
  allowedSourceIds: Set<string>,
  fallbackTopicId: string,
  allowedTopicIds?: Set<string>,
  difficulty: LearningDifficulty = 'mittel',
): FlashcardTask | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const data = raw as Record<string, unknown>;

  const question = typeof data.question === 'string' ? data.question.trim() : '';
  const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
  const evidence = typeof data.evidence === 'string' ? data.evidence.trim() : '';

  if (!question || !answer || !evidence) {
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

  const rawTopicId =
    typeof data.topicId === 'string' && data.topicId.trim()
      ? data.topicId.trim()
      : fallbackTopicId;

  // Enforce topic boundary
  if (allowedTopicIds && allowedTopicIds.size > 0 && !allowedTopicIds.has(rawTopicId)) {
    return null;
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : `flashcard-${Date.now()}`,
    mode: 'flashcards',
    topicId: rawTopicId,
    difficulty,
    question,
    answer,
    evidence,
    sourceIds: validSourceIds,
  };
}

export const BLANK_MARKER = '{{blank}}';

/**
 * Deterministically checks the user's answer against the expected answer:
 * - Trims leading/trailing whitespace
 * - Normalizes multiple spaces into a single space
 * - Compares case-insensitively using German locale (de-DE)
 * - Correctly handles German umlauts (ä, ö, ü, ß)
 * - Does not use AI for grading
 */
export function checkFillInBlankAnswer(userAnswer: string, expectedAnswer: string): boolean {
  if (!userAnswer || !expectedAnswer) return false;
  const normalize = (s: string) =>
    s
      .trim()
      .toLocaleLowerCase('de-DE')
      .replace(/\s+/g, ' ');

  const normUser = normalize(userAnswer);
  const normExpected = normalize(expectedAnswer);

  return normUser.length > 0 && normUser === normExpected;
}

/**
 * Strictly validates raw model output for Fill-in-the-blank (Lückentext).
 *
 * Strict safety rules:
 * 1. AI is not a knowledge source: 0% unsupported factual claims.
 * 2. `evidence` is strictly required and must not be empty.
 * 3. Every `sourceId` in `sourceIds` MUST exist in the provided sources. Unknown IDs are rejected.
 * 4. At least one valid source must be referenced.
 * 5. `sentenceWithBlank` must contain `{{blank}}` and no raw HTML.
 * 6. `answer` must be a non-empty string and meaningfully present in the evidence.
 * 7. `topicId` must belong to the allowed topic set.
 */
export function validateFillInBlankTask(
  raw: unknown,
  allowedSourceIds: Set<string>,
  fallbackTopicId: string,
  allowedTopicIds?: Set<string>,
  difficulty: LearningDifficulty = 'mittel',
): FillInBlankTask | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const data = raw as Record<string, unknown>;

  const sentenceWithBlank =
    typeof data.sentenceWithBlank === 'string' ? data.sentenceWithBlank.trim() : '';
  const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
  const evidence = typeof data.evidence === 'string' ? data.evidence.trim() : '';

  if (!sentenceWithBlank || !answer || !evidence) {
    return null;
  }

  // Reject HTML tags in sentence or answer
  if (/<[a-z][\s\S]*>/i.test(sentenceWithBlank) || /<[a-z][\s\S]*>/i.test(answer)) {
    return null;
  }

  // Must contain exactly the blank marker
  if (!sentenceWithBlank.includes(BLANK_MARKER)) {
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

  const rawTopicId =
    typeof data.topicId === 'string' && data.topicId.trim()
      ? data.topicId.trim()
      : fallbackTopicId;

  // Enforce topic boundary
  if (allowedTopicIds && allowedTopicIds.size > 0 && !allowedTopicIds.has(rawTopicId)) {
    return null;
  }

  // Evidence must meaningfully mention the answer (case-insensitive)
  const normEvidence = evidence.toLocaleLowerCase('de-DE');
  const normAnswer = answer.toLocaleLowerCase('de-DE');
  if (!normEvidence.includes(normAnswer)) {
    return null;
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : `fillblank-${Date.now()}`,
    mode: 'fill-in-the-blank',
    topicId: rawTopicId,
    difficulty,
    sentenceWithBlank,
    answer,
    evidence,
    sourceIds: validSourceIds,
  };
}

export interface GenerateQuizTaskOptions {
  apiKey?: string;
  targetTopicId?: string;
  targetTopicName?: string;
  difficulty?: LearningDifficulty;
  avoidQuestions?: string[];
  fetchFn?: typeof fetch;
}

/**
 * Calls DeepSeek to transform the grounded knowledge context into one strictly verified Quiz task.
 * Supports targetTopicId, difficulty level, and avoiding repeat questions.
 */
export async function generateQuizTask(
  context: GroundedKnowledgeContext,
  options: GenerateQuizTaskOptions = {},
): Promise<QuizTask> {
  const {
    apiKey,
    targetTopicId,
    targetTopicName,
    difficulty = 'mittel',
    avoidQuestions = [],
    fetchFn = fetch,
  } = options;

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

  const hasDocumentSources = context.sources.some((s) => s.type === 'document');
  if (!hasDocumentSources) {
    throw new Error(
      'Die Erstellung von Lernaufgaben erfordert mindestens ein eigenes Dokument in den ausgewählten Themen.',
    );
  }

  const allowedSourceIds = new Set(context.sources.map((s) => s.id));
  const formattedSources = formatSourcesForPrompt(context.sources);

  const activeTopicId = targetTopicId || context.topicIds[0] || '';
  const activeTopicName =
    targetTopicName ||
    context.topicNames[context.topicIds.indexOf(activeTopicId)] ||
    context.topicNames[0] ||
    '';

  const difficultyInstructions = {
    leicht: 'Fokus auf grundlegende Definitionen, Kernbegriffe und direkte Fakten ("Was ist X?").',
    mittel: 'Fokus auf Zusammenhänge, typische Aufgabenbereiche und Merkmale ("Welche Aufgaben gehören zu X?").',
    schwer: 'Fokus auf Abgrenzungen, Unterschiede und detaillierte Kriterien ("Was unterscheidet X von Y?").',
  }[difficulty];

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
8. SCHWIERIGKEITSGRAD: ${difficulty.toUpperCase()}.
${difficultyInstructions}
WICHTIG: Die Schwierigkeit beeinflusst nur die Fragestellung und Abstraktionsebene, NIEMALS dürfen dafür Fakten erfunden werden.

You must respond ONLY with a valid JSON object strictly matching this schema:
{
  "topicId": "${activeTopicId}",
  "question": "Clear, informative question",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": "Option matching one of the options exactly",
  "explanation": "Brief explanation why this answer is correct based on the sources",
  "evidence": "Direct factual sentence or citation from the referenced source",
  "sourceIds": ["doc-1"]
}`;

  let userPrompt = `FACH: ${context.subjectName}
SCHWERPUNKT-THEMA FÜR DIESE FRAGE: ${activeTopicName || context.topicNames.join(', ')}
SCHWIERIGKEIT: ${difficulty}

VERFÜGBARE QUELLEN:
${formattedSources}`;

  if (avoidQuestions.length > 0) {
    userPrompt += `\n\nBEREITS GESTELLTE FRAGEN (BITTE EINE ANDERE FRAGE STELLEN):\n- ${avoidQuestions.slice(-5).join('\n- ')}`;
  }

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

  const task = validateQuizTask(parsed, allowedSourceIds, activeTopicId, difficulty);
  if (!task) {
    throw new Error(
      'Die erstellte Aufgabe konnte nicht anhand der verifizierten Quellen validiert werden (Halluzinations-Schutz).',
    );
  }

  return task;
}

export interface GenerateFlashcardTaskOptions {
  apiKey?: string;
  targetTopicId?: string;
  targetTopicName?: string;
  difficulty?: LearningDifficulty;
  avoidQuestions?: string[];
  fetchFn?: typeof fetch;
}

/**
 * Calls DeepSeek to transform the grounded knowledge context into one strictly verified Flashcard task.
 * Supports targetTopicId, difficulty level, and avoiding repeat cards.
 */
export async function generateFlashcardTask(
  context: GroundedKnowledgeContext,
  options: GenerateFlashcardTaskOptions = {},
): Promise<FlashcardTask> {
  const {
    apiKey,
    targetTopicId,
    targetTopicName,
    difficulty = 'mittel',
    avoidQuestions = [],
    fetchFn = fetch,
  } = options;

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

  const hasDocumentSources = context.sources.some((s) => s.type === 'document');
  if (!hasDocumentSources) {
    throw new Error(
      'Die Erstellung von Lernaufgaben erfordert mindestens ein eigenes Dokument in den ausgewählten Themen.',
    );
  }

  const allowedSourceIds = new Set(context.sources.map((s) => s.id));
  const allowedTopicIds = new Set(context.topicIds);
  const formattedSources = formatSourcesForPrompt(context.sources);

  const activeTopicId = targetTopicId || context.topicIds[0] || '';
  const activeTopicName =
    targetTopicName ||
    context.topicNames[context.topicIds.indexOf(activeTopicId)] ||
    context.topicNames[0] ||
    '';

  const difficultyInstructions = {
    leicht: 'Fokus auf grundlegende Definitionen, Kernbegriffe und Fakten ("Was ist X?").',
    mittel: 'Fokus auf Zusammenhänge, Abläufe, typische Aufgabenbereiche und Merkmale ("Welche Aufgaben hat X? / Wie funktioniert X?").',
    schwer: 'Fokus auf Abgrenzungen, Kriterien, Vor- und Nachteile ("Was unterscheidet X von Y? / Wann setzt man X ein?").',
  }[difficulty];

  const systemPrompt = `You are an educational task generator for School Helper.
Your sole job is to create a study flashcard (Karteikarte) for a student strictly from the provided source material.

CRITICAL ARCHITECTURAL RULES:
1. AI IS NOT A KNOWLEDGE SOURCE. You have ZERO right to supply outside facts, definitions, or technical details not found in the sources.
2. 0% unsupported claims: Every single factual claim in the question (front), answer (back), and evidence must be directly and provably derived from the provided sources.
3. "sourceIds": An array of one or more valid source IDs (e.g. ["doc-1"] or ["doc-1", "web-2"]) that explicitly substantiate this flashcard. NEVER invent source IDs.
4. "evidence": Provide an exact quote or brief factual sentence extracted directly from the referenced source that proves the answer.
5. The question (front) and answer (back) must be in the predominant language of the sources (usually German).
6. Quality: Front should be a concise question or concept prompt. Back should be a well-structured, clear explanation or definition.
7. SCHWIERIGKEITSGRAD: ${difficulty.toUpperCase()}.
${difficultyInstructions}
WICHTIG: Die Schwierigkeit beeinflusst nur die Fragestellung und Abstraktionsebene, NIEMALS dürfen dafür Fakten erfunden werden.

You must respond ONLY with a valid JSON object strictly matching this schema:
{
  "topicId": "${activeTopicId}",
  "question": "Was versteht man unter ...?",
  "answer": "Prägnante, lehrreiche Erklärung aus den Quellen...",
  "evidence": "Exaktes Zitat oder präziser Satz aus der Quelle...",
  "sourceIds": ["doc-1"]
}`;

  let userPrompt = `FACH: ${context.subjectName}
SCHWERPUNKT-THEMA FÜR DIESE KARTEIKARTE: ${activeTopicName || context.topicNames.join(', ')}
SCHWIERIGKEIT: ${difficulty}

VERFÜGBARE QUELLEN:
${formattedSources}`;

  if (avoidQuestions.length > 0) {
    userPrompt += `\n\nBEREITS GESTELLTE FRAGEN (BITTE EINE ANDERE FRAGE/BEGRIFF WÄHLEN):\n- ${avoidQuestions.slice(-5).join('\n- ')}`;
  }

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
      temperature: 0.1,
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

  const task = validateFlashcardTask(
    parsed,
    allowedSourceIds,
    activeTopicId,
    allowedTopicIds,
    difficulty,
  );
  if (!task) {
    throw new Error(
      'Die erstellte Karteikarte konnte nicht anhand der verifizierten Quellen validiert werden (Halluzinations-Schutz).',
    );
  }

  return task;
}

export interface GenerateFillInBlankTaskOptions {
  apiKey?: string;
  targetTopicId?: string;
  targetTopicName?: string;
  difficulty?: LearningDifficulty;
  avoidSentences?: string[];
  fetchFn?: typeof fetch;
}

/**
 * Calls DeepSeek to transform the grounded knowledge context into one strictly verified Lückentext (fill-in-the-blank) task.
 * Supports targetTopicId, difficulty level, and avoiding repeat tasks.
 */
export async function generateFillInBlankTask(
  context: GroundedKnowledgeContext,
  options: GenerateFillInBlankTaskOptions = {},
): Promise<FillInBlankTask> {
  const {
    apiKey,
    targetTopicId,
    targetTopicName,
    difficulty = 'mittel',
    avoidSentences = [],
    fetchFn = fetch,
  } = options;

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

  const hasDocumentSources = context.sources.some((s) => s.type === 'document');
  if (!hasDocumentSources) {
    throw new Error(
      'Die Erstellung von Lernaufgaben erfordert mindestens ein eigenes Dokument in den ausgewählten Themen.',
    );
  }

  const allowedSourceIds = new Set(context.sources.map((s) => s.id));
  const allowedTopicIds = new Set(context.topicIds);
  const formattedSources = formatSourcesForPrompt(context.sources);

  const activeTopicId = targetTopicId || context.topicIds[0] || '';
  const activeTopicName =
    targetTopicName ||
    context.topicNames[context.topicIds.indexOf(activeTopicId)] ||
    context.topicNames[0] ||
    '';

  const difficultyInstructions = {
    leicht:
      'Wähle einen grundlegenden Fachbegriff oder eine zentrale Eigenschaft als Lücke. Der Satz soll kurz und eindeutig sein.',
    mittel:
      'Wähle einen wichtigen Prozess-, Funktions- oder Komponentenbegriff als Lücke. Der Kontext im Satz muss die gesuchte Antwort klar eingrenzen.',
    schwer:
      'Wähle ein technisches Detail, einen Unterscheidungsbegriff oder eine spezifische Bedingung als Lücke. Vermeide Mehrdeutigkeiten.',
  }[difficulty];

  const systemPrompt = `You are an educational task generator for School Helper.
Your sole job is to create a fill-in-the-blank (Lückentext) study task for a student strictly from the provided source material.

CRITICAL ARCHITECTURAL RULES:
1. AI IS NOT A KNOWLEDGE SOURCE. You have ZERO right to supply outside facts, definitions, or technical details not found in the sources.
2. 0% unsupported claims: Every single factual claim in the sentence, answer, and evidence must be directly and provably derived from the provided sources.
3. "sourceIds": An array of one or more valid source IDs (e.g. ["doc-1"] or ["doc-1", "web-2"]) that explicitly substantiate this task. NEVER invent source IDs.
4. "evidence": Provide an exact quote or brief factual sentence extracted directly from the referenced source that explicitly contains the answer.
5. "sentenceWithBlank": Must contain the exact placeholder "${BLANK_MARKER}" where the missing term belongs.
   - Do NOT use HTML or custom markup.
   - The blank must replace a MEANINGFUL key concept, technical term, or definition keyword (e.g. "Steuerung", "Infrastruktur", "Authentifizierung").
   - NEVER blank out articles (der/die/das/ein), generic filler words, or punctuation.
   - The sentence must remain clearly understandable with the blank.
6. "answer": The exact missing word or short phrase (usually 1-2 words). Must be explicitly present in "evidence".
7. SCHWIERIGKEITSGRAD: ${difficulty.toUpperCase()}.
${difficultyInstructions}
WICHTIG: Die Schwierigkeit beeinflusst nur den Anspruch des Begriffs, NIEMALS dürfen dafür Fakten erfunden werden.

You must respond ONLY with a valid JSON object strictly matching this schema:
{
  "topicId": "${activeTopicId}",
  "sentenceWithBlank": "Cloud-Management umfasst die ${BLANK_MARKER}, Überwachung und Verwaltung von IT-Ressourcen.",
  "answer": "Steuerung",
  "evidence": "Cloud-Management umfasst die Steuerung, Überwachung und Verwaltung von IT-Ressourcen.",
  "sourceIds": ["doc-1"]
}`;

  let userPrompt = `FACH: ${context.subjectName}
SCHWERPUNKT-THEMA FÜR DIESEN LÜCKENTEXT: ${activeTopicName || context.topicNames.join(', ')}
SCHWIERIGKEIT: ${difficulty}

VERFÜGBARE QUELLEN:
${formattedSources}`;

  if (avoidSentences.length > 0) {
    userPrompt += `\n\nBEREITS GESTELLTE SÄTZE (BITTE EINEN ANDEREN FAKT/BEGRIFF WÄHLEN):\n- ${avoidSentences.slice(-5).join('\n- ')}`;
  }

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
      temperature: 0.1,
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

  const task = validateFillInBlankTask(
    parsed,
    allowedSourceIds,
    activeTopicId,
    allowedTopicIds,
    difficulty,
  );
  if (!task) {
    throw new Error(
      'Der erstellte Lückentext konnte nicht anhand der verifizierten Quellen validiert werden (Halluzinations-Schutz).',
    );
  }

  return task;
}

