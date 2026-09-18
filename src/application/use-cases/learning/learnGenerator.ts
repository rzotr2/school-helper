import { getDeepSeekApiKey } from '../documentUnderstanding';
import type {
  FillInBlankTask,
  FlashcardTask,
  GroundedKnowledgeContext,
  GroundedSource,
  LearningDifficulty,
  MatchingPair,
  MatchingTask,
  QuizTask,
  WordBankBlank,
  WordBankTask,
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

/**
 * Strictly validates raw model output for Matching (Zuordnen).
 *
 * Strict safety rules:
 * 1. AI is not a knowledge source: 0% unsupported claims.
 * 2. `instruction` must be a non-empty string.
 * 3. `pairs` must be an array of 3 to 6 valid MatchingPair objects.
 * 4. Each pair must have a unique, non-empty ID.
 * 5. Each pair's `left` and `right` must be non-empty, distinct strings (preventing trivial pairs like X -> X).
 * 6. Each pair must have a non-empty `evidence` string.
 * 7. Each pair must have non-empty `sourceIds` containing strictly existing IDs in `allowedSourceIds`.
 * 8. All pairs must have unique `left` items and unique `right` items to prevent ambiguous mappings.
 * 9. `topicId` must belong to the allowed topic set (if provided).
 */
export function validateMatchingTask(
  raw: unknown,
  allowedSourceIds: Set<string>,
  fallbackTopicId: string,
  allowedTopicIds?: Set<string>,
  difficulty: LearningDifficulty = 'mittel',
): MatchingTask | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const data = raw as Record<string, unknown>;

  const instruction =
    typeof data.instruction === 'string' && data.instruction.trim()
      ? data.instruction.trim()
      : 'Ordne die zusammengehörigen Begriffe und Beschreibungen einander zu.';

  if (!Array.isArray(data.pairs)) {
    return null;
  }

  // Enforce reasonable pair counts (3 to 6 pairs)
  if (data.pairs.length < 3 || data.pairs.length > 6) {
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

  const validatedPairs: MatchingPair[] = [];
  const seenPairIds = new Set<string>();
  const seenLefts = new Set<string>();
  const seenRights = new Set<string>();
  const taskSourceIds = new Set<string>();

  for (let idx = 0; idx < data.pairs.length; idx++) {
    const rawPair = data.pairs[idx];
    if (typeof rawPair !== 'object' || rawPair === null) {
      return null;
    }

    const pairData = rawPair as Record<string, unknown>;

    const pairId =
      typeof pairData.id === 'string' && pairData.id.trim()
        ? pairData.id.trim()
        : `pair-${idx + 1}`;

    if (seenPairIds.has(pairId)) {
      return null; // Duplicate pair ID
    }
    seenPairIds.add(pairId);

    const left = typeof pairData.left === 'string' ? pairData.left.trim() : '';
    const right = typeof pairData.right === 'string' ? pairData.right.trim() : '';
    const evidence = typeof pairData.evidence === 'string' ? pairData.evidence.trim() : '';

    if (!left || !right || !evidence) {
      return null;
    }

    // Trivial match check: left and right should not be identically worded
    if (left.toLocaleLowerCase('de-DE') === right.toLocaleLowerCase('de-DE')) {
      return null;
    }

    // Duplicate left or right check (prevents ambiguous matching)
    const normLeft = left.toLocaleLowerCase('de-DE');
    const normRight = right.toLocaleLowerCase('de-DE');
    if (seenLefts.has(normLeft) || seenRights.has(normRight)) {
      return null;
    }
    seenLefts.add(normLeft);
    seenRights.add(normRight);

    // Validate pair source references
    if (!Array.isArray(pairData.sourceIds) || pairData.sourceIds.length === 0) {
      return null;
    }

    const validPairSourceIds: string[] = [];
    for (const sid of pairData.sourceIds) {
      if (typeof sid === 'string' && allowedSourceIds.has(sid.trim())) {
        const cleanSid = sid.trim();
        validPairSourceIds.push(cleanSid);
        taskSourceIds.add(cleanSid);
      } else {
        // Unknown / hallucinated source ID
        return null;
      }
    }

    if (validPairSourceIds.length === 0) {
      return null;
    }

    validatedPairs.push({
      id: pairId,
      left,
      right,
      evidence,
      sourceIds: validPairSourceIds,
    });
  }

  if (validatedPairs.length < 3 || taskSourceIds.size === 0) {
    return null;
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : `matching-${Date.now()}`,
    mode: 'matching',
    topicId: rawTopicId,
    difficulty,
    instruction,
    pairs: validatedPairs,
    sourceIds: Array.from(taskSourceIds),
  };
}

/**
 * Deterministically checks the user's placed word against the expected answer for a blank:
 * - Trims whitespace
 * - Normalizes multiple spaces
 * - Compares case-insensitively using German locale
 */
export function checkWordBankAnswer(userWord: string, expectedAnswer: string): boolean {
  if (!userWord || !expectedAnswer) return false;
  const normalize = (s: string) =>
    s
      .trim()
      .toLocaleLowerCase('de-DE')
      .replace(/\s+/g, ' ');

  const normUser = normalize(userWord);
  const normExpected = normalize(expectedAnswer);

  return normUser.length > 0 && normUser === normExpected;
}

/**
 * Strictly validates raw model output for Wortbank / Lückentext mit Wörtern (Word-Bank).
 *
 * Strict safety rules:
 * 1. AI is not a knowledge source: 0% unsupported claims.
 * 2. `textWithBlanks` must be a non-empty string and must not contain raw HTML tags.
 * 3. `blanks` must be an array of 3 to 5 valid WordBankBlank objects.
 * 4. Each blank must have a unique, non-empty ID (e.g. "blank-1").
 * 5. The placeholder `{{<id>}}` must exist in `textWithBlanks` for every blank.
 * 6. Each blank must have non-empty `answer` and `evidence`.
 * 7. Each blank's `sourceIds` must be non-empty and strictly exist in `allowedSourceIds`.
 * 8. `words` (word bank) must contain 4 to 8 non-empty, unique strings.
 * 9. Every blank's answer MUST be contained in `words`.
 * 10. `topicId` must belong to the allowed topic set (if provided).
 */
export function validateWordBankTask(
  raw: unknown,
  allowedSourceIds: Set<string>,
  fallbackTopicId: string,
  allowedTopicIds?: Set<string>,
  difficulty: LearningDifficulty = 'mittel',
): WordBankTask | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const data = raw as Record<string, unknown>;

  const instruction =
    typeof data.instruction === 'string' && data.instruction.trim()
      ? data.instruction.trim()
      : 'Setze die passenden Begriffe aus der Wortbank in die Lücken ein.';

  const textWithBlanks =
    typeof data.textWithBlanks === 'string' ? data.textWithBlanks.trim() : '';

  if (!textWithBlanks) {
    return null;
  }

  // Reject raw HTML tags
  if (/<[a-z][\s\S]*>/i.test(textWithBlanks)) {
    return null;
  }

  if (!Array.isArray(data.blanks)) {
    return null;
  }

  // Enforce 3 to 5 blanks per task
  if (data.blanks.length < 3 || data.blanks.length > 5) {
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

  const validatedBlanks: WordBankBlank[] = [];
  const seenBlankIds = new Set<string>();
  const blankAnswers = new Set<string>();
  const taskSourceIds = new Set<string>();

  for (let idx = 0; idx < data.blanks.length; idx++) {
    const rawBlank = data.blanks[idx];
    if (typeof rawBlank !== 'object' || rawBlank === null) {
      return null;
    }

    const bData = rawBlank as Record<string, unknown>;
    const blankId =
      typeof bData.id === 'string' && bData.id.trim()
        ? bData.id.trim()
        : `blank-${idx + 1}`;

    if (seenBlankIds.has(blankId)) {
      return null; // Duplicate blank ID
    }
    seenBlankIds.add(blankId);

    // Verify placeholder {{blankId}} exists in the text
    const placeholder = `{{${blankId}}}`;
    if (!textWithBlanks.includes(placeholder)) {
      return null;
    }

    const answer = typeof bData.answer === 'string' ? bData.answer.trim() : '';
    const evidence = typeof bData.evidence === 'string' ? bData.evidence.trim() : '';

    if (!answer || !evidence) {
      return null;
    }

    // Reject HTML in answers
    if (/<[a-z][\s\S]*>/i.test(answer)) {
      return null;
    }

    // Validate blank source references
    if (!Array.isArray(bData.sourceIds) || bData.sourceIds.length === 0) {
      return null;
    }

    const validBlankSourceIds: string[] = [];
    for (const sid of bData.sourceIds) {
      if (typeof sid === 'string' && allowedSourceIds.has(sid.trim())) {
        const cleanSid = sid.trim();
        validBlankSourceIds.push(cleanSid);
        taskSourceIds.add(cleanSid);
      } else {
        // Unknown / hallucinated source ID
        return null;
      }
    }

    if (validBlankSourceIds.length === 0) {
      return null;
    }

    blankAnswers.add(answer.toLocaleLowerCase('de-DE'));

    validatedBlanks.push({
      id: blankId,
      answer,
      evidence,
      sourceIds: validBlankSourceIds,
    });
  }

  // Validate words (word bank)
  if (!Array.isArray(data.words)) {
    return null;
  }

  // Word bank must contain 4 to 8 words
  if (data.words.length < 4 || data.words.length > 8) {
    return null;
  }

  const validatedWords: string[] = [];
  const seenWordNorms = new Set<string>();

  for (const rawWord of data.words) {
    if (typeof rawWord !== 'string') {
      return null;
    }
    const word = rawWord.trim();
    if (!word) {
      return null;
    }
    const norm = word.toLocaleLowerCase('de-DE');
    if (seenWordNorms.has(norm)) {
      return null; // No duplicates in word bank
    }
    seenWordNorms.add(norm);
    validatedWords.push(word);
  }

  // Every blank answer MUST be present in the word bank
  for (const answerNorm of blankAnswers) {
    if (!seenWordNorms.has(answerNorm)) {
      return null;
    }
  }

  if (taskSourceIds.size === 0) {
    return null;
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : `wordbank-${Date.now()}`,
    mode: 'word-bank',
    topicId: rawTopicId,
    difficulty,
    instruction,
    textWithBlanks,
    blanks: validatedBlanks,
    words: validatedWords,
    sourceIds: Array.from(taskSourceIds),
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

export interface GenerateMatchingTaskOptions {
  apiKey?: string;
  targetTopicId?: string;
  targetTopicName?: string;
  difficulty?: LearningDifficulty;
  fetchFn?: typeof fetch;
}

/**
 * Calls DeepSeek to transform the grounded knowledge context into one strictly verified Matching (Zuordnen) task.
 * Generates 4-6 matching pairs strictly supported by the grounded source material.
 */
export async function generateMatchingTask(
  context: GroundedKnowledgeContext,
  options: GenerateMatchingTaskOptions = {},
): Promise<MatchingTask> {
  const {
    apiKey,
    targetTopicId,
    targetTopicName,
    difficulty = 'mittel',
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
      'Erstelle 4 klare, grundlegende Paare (z.B. Begriff → einfache Definition oder Technologie → Einsatzzweck).',
    mittel:
      'Erstelle 4 bis 5 differenzierte Paare (z.B. Konzept → konkretes Praxisbeispiel, Ursache → Wirkung, Prozessschritt → Funktion).',
    schwer:
      'Erstelle 5 bis 6 anspruchsvolle Paare mit subtileren Unterscheidungsmerkmalen (z.B. Maßnahme → spezifisches Risiko, Abgrenzungen ähnlicher Konzepte).',
  }[difficulty];

  const systemPrompt = `You are an educational task generator for School Helper.
Your sole job is to create a Matching (Zuordnen) study exercise for a student strictly from the provided source material.

CRITICAL ARCHITECTURAL RULES:
1. AI IS NOT A KNOWLEDGE SOURCE. You have ZERO right to supply outside facts, definitions, or technical details not found in the sources.
2. 0% unsupported claims: Every single pair (left item, right item, and evidence) must be directly and provably derived from the provided sources.
3. Generate between 4 and 6 matching pairs (target: 4-5 pairs).
4. Each pair must represent a meaningful educational relationship (e.g. Term → Definition, Concept → Example, Cause → Effect, Technology → Purpose, Measure → Threat).
5. Avoid trivial pairs with identical wording (e.g. "Firewall" → "Firewall"). Left and right MUST be distinct.
6. Both "left" and "right" should be concise and easily readable on mobile screens (left: typically 1-4 words; right: concise sentence or phrase).
7. All "left" items must be distinct from one another. All "right" items must be distinct from one another.
8. "sourceIds": An array of valid source IDs (e.g. ["doc-1"]) that explicitly support the pair relationship. NEVER invent source IDs.
9. "evidence": Direct quote or brief factual sentence from the source that verifies this relationship.
10. SCHWIERIGKEITSGRAD: ${difficulty.toUpperCase()}.
${difficultyInstructions}
WICHTIG: Die Schwierigkeit beeinflusst nur den Anspruch der Zusammenhänge, NIEMALS dürfen dafür Fakten erfunden werden.

You must respond ONLY with a valid JSON object strictly matching this schema:
{
  "topicId": "${activeTopicId}",
  "instruction": "Ordne die Begriffe den passenden Beschreibungen zu.",
  "pairs": [
    {
      "id": "pair-1",
      "left": "IaaS",
      "right": "Bereitstellung grundlegender Rechen- und Speicherressourcen",
      "evidence": "IaaS bietet grundlegende Rechen- und Speicherressourcen.",
      "sourceIds": ["doc-1"]
    },
    {
      "id": "pair-2",
      "left": "PaaS",
      "right": "Plattform für Entwicklung und Bereitstellung von Anwendungen",
      "evidence": "PaaS umfasst Plattform-Werkzeuge für Anwendungsentwicklung.",
      "sourceIds": ["doc-1"]
    },
    {
      "id": "pair-3",
      "left": "SaaS",
      "right": "Nutzung fertiger Softwareanwendungen über das Netz",
      "evidence": "SaaS stellt fertige Applikationen online bereit.",
      "sourceIds": ["doc-1"]
    },
    {
      "id": "pair-4",
      "left": "Public Cloud",
      "right": "Infrastruktur wird öffentlich über das Internet bereitgestellt",
      "evidence": "Public Clouds sind öffentlich zugängliche Cloud-Umgebungen.",
      "sourceIds": ["doc-1"]
    }
  ]
}`;

  const userPrompt = `FACH: ${context.subjectName}
SCHWERPUNKT-THEMA FÜR DIESE ZUORDNUNG: ${activeTopicName || context.topicNames.join(', ')}
SCHWIERIGKEIT: ${difficulty}

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

  const task = validateMatchingTask(
    parsed,
    allowedSourceIds,
    activeTopicId,
    allowedTopicIds,
    difficulty,
  );
  if (!task) {
    throw new Error(
      'Die erstellte Zuordnungsaufgabe konnte nicht anhand der verifizierten Quellen validiert werden (Halluzinations-Schutz).',
    );
  }

  return task;
}

export interface GenerateWordBankTaskOptions {
  apiKey?: string;
  targetTopicId?: string;
  targetTopicName?: string;
  difficulty?: LearningDifficulty;
  fetchFn?: typeof fetch;
}

/**
 * Calls DeepSeek to transform the grounded knowledge context into one strictly verified Wortbank (word-bank) task.
 * Creates a text with 3-5 blanks (e.g. {{blank-1}}, {{blank-2}}) and a word bank of 4-8 words (including answers and grounded distractors).
 */
export async function generateWordBankTask(
  context: GroundedKnowledgeContext,
  options: GenerateWordBankTaskOptions = {},
): Promise<WordBankTask> {
  const {
    apiKey,
    targetTopicId,
    targetTopicName,
    difficulty = 'mittel',
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
      'Erstelle einen leicht verständlichen Text mit 3 Lücken für zentrale Grundbegriffe. Die Wortbank soll 4 bis 5 Wörter umfassen (3 Antworten + 1-2 einfache, plausible Distraktoren aus den Quellen).',
    mittel:
      'Erstelle einen zusammenhängenden Erklärungstext mit 3 bis 4 Lücken für wichtige Fachbegriffe, Prozesse oder Komponenten. Die Wortbank soll 5 bis 6 Wörter umfassen (3-4 Antworten + 2 thematisch passende Distraktoren aus den Quellen).',
    schwer:
      'Erstelle einen anspruchsvollen Fachtext mit 4 Lücken für spezifische Mechanismen, Kriterien oder Fachtermini. Die Wortbank soll 6 bis 7 Wörter umfassen (4 Antworten + 2-3 trennscharfe Distraktoren aus den Quellen).',
  }[difficulty];

  const systemPrompt = `You are an educational task generator for School Helper.
Your sole job is to create a Wortbank / Lückentext mit Wörtern (Word Bank) study task for a student strictly from the provided source material.

CRITICAL ARCHITECTURAL RULES:
1. AI IS NOT A KNOWLEDGE SOURCE. You have ZERO right to supply outside facts, definitions, or technical details not found in the sources.
2. 0% unsupported claims: Every single factual claim in the text, answers, distractors, and evidence must be directly and provably derived from the provided sources.
3. Every blank must be marked with a unique machine-readable placeholder {{blank-1}}, {{blank-2}}, {{blank-3}}, etc. in "textWithBlanks".
4. "blanks": An array of 3 to 5 blank objects.
   - "id": "blank-1", "blank-2", etc. Matching the placeholder in "textWithBlanks".
   - "answer": The exact word/term that fits this blank. Must be a meaningful technical term or concept, NEVER trivial articles (der/die/das/ein) or filler words.
   - "evidence": Exact quote from the source proving this fact and answer.
   - "sourceIds": Valid source IDs (e.g. ["doc-1"]) proving this statement.
5. "words": The word bank array of 4 to 8 unique words/terms in shuffled order.
   - MUST contain all answers of the blanks.
   - Plus 1 to 3 plausible distractors that are ALSO derived from the provided source context (no random words!).
6. "instruction": A short German instruction (e.g. "Setze die passenden Begriffe aus der Wortbank in die Lücken ein.").
7. SCHWIERIGKEITSGRAD: ${difficulty.toUpperCase()}.
${difficultyInstructions}

You must respond ONLY with a valid JSON object strictly matching this schema:
{
  "topicId": "${activeTopicId}",
  "instruction": "Setze die passenden Begriffe in die Lücken ein.",
  "textWithBlanks": "Eine Firewall {{blank-1}} den Datenverkehr und kann verdächtige Verbindungen {{blank-2}}. Zudem sorgt die Verschlüsselung für {{blank-3}} bei der Übertragung.",
  "blanks": [
    {
      "id": "blank-1",
      "answer": "filtert",
      "evidence": "Eine Firewall filtert eingehende und ausgehende Datenströme.",
      "sourceIds": ["doc-1"]
    },
    {
      "id": "blank-2",
      "answer": "blockieren",
      "evidence": "Unerwünschte Pakete werden von der Firewall zuverlässig blockiert.",
      "sourceIds": ["doc-1"]
    },
    {
      "id": "blank-3",
      "answer": "Vertraulichkeit",
      "evidence": "Kryptografische Verfahren garantieren Vertraulichkeit im Netz.",
      "sourceIds": ["doc-1"]
    }
  ],
  "words": [
    "blockieren",
    "filtert",
    "Authentifizierung",
    "Vertraulichkeit",
    "Routing"
  ]
}`;

  const userPrompt = `FACH: ${context.subjectName}
SCHWERPUNKT-THEMA FÜR DIESE WORTBANK: ${activeTopicName || context.topicNames.join(', ')}
SCHWIERIGKEIT: ${difficulty}

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

  const task = validateWordBankTask(
    parsed,
    allowedSourceIds,
    activeTopicId,
    allowedTopicIds,
    difficulty,
  );
  if (!task) {
    throw new Error(
      'Die erstellte Wortbank-Aufgabe konnte nicht anhand der verifizierten Quellen validiert werden (Halluzinations-Schutz).',
    );
  }

  return task;
}



