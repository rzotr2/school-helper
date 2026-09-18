/**
 * Domain & Application models for the Learn feature.
 *
 * Core rule: AI is not a knowledge source. All learning tasks must be strictly
 * grounded in retrieved sources (user documents + verified web sources).
 */

export type LearningMode = 'quiz' | 'flashcards' | 'fill-in-the-blank' | 'matching' | 'word-bank';

export type LearningDifficulty = 'leicht' | 'mittel' | 'schwer';

export interface GroundedSource {
  /** Stable identifier passed to the AI model, e.g. 'doc-1', 'web-1' */
  id: string;
  type: 'document' | 'web';
  title: string;
  url?: string;
  domain?: string;
  documentId?: string;
  documentName?: string;
  topicId?: string;
  pageNumber?: number;
  /** Cleaned, readable text content used as evidence */
  content: string;
  retrievedAt?: string;
}

export interface GroundedKnowledgeContext {
  subjectId: string;
  subjectName: string;
  topicIds: string[];
  topicNames: string[];
  sources: GroundedSource[];
}

export interface QuizTask {
  id: string;
  mode?: 'quiz';
  topicId: string;
  difficulty?: LearningDifficulty;
  question: string;
  /** 4 options shuffled, including correctAnswer */
  options: string[];
  correctAnswer: string;
  explanation: string;
  /** Direct quote or synthesized factual evidence extracted from the grounded sources */
  evidence: string;
  /** Verified source IDs from GroundedKnowledgeContext that back this question */
  sourceIds: string[];
}

export interface FlashcardTask {
  id: string;
  mode: 'flashcards';
  topicId: string;
  topicName?: string;
  difficulty?: LearningDifficulty;
  /** Front of the card */
  question: string;
  /** Back of the card */
  answer: string;
  /** Direct quote or factual evidence extracted from the grounded sources */
  evidence: string;
  /** Verified source IDs from GroundedKnowledgeContext that back this flashcard */
  sourceIds: string[];
}

export interface FillInBlankTask {
  id: string;
  mode: 'fill-in-the-blank';
  topicId: string;
  topicName?: string;
  difficulty?: LearningDifficulty;
  /** Complete sentence containing the {{blank}} placeholder */
  sentenceWithBlank: string;
  /** Expected missing word or term */
  answer: string;
  /** Direct quote or factual evidence extracted from the grounded sources */
  evidence: string;
  /** Verified source IDs from GroundedKnowledgeContext that back this task */
  sourceIds: string[];
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
  sourceIds: string[];
  evidence: string;
}

export interface MatchingTask {
  id: string;
  mode: 'matching';
  topicId: string;
  topicName?: string;
  difficulty?: LearningDifficulty;
  instruction: string;
  pairs: MatchingPair[];
  sourceIds: string[];
}

export interface WordBankBlank {
  /** Stable identifier referenced in the text as {{blankId}}, e.g. "blank-1" */
  id: string;
  /** The correct word or phrase that belongs in this blank */
  answer: string;
  /** Verified source IDs from GroundedKnowledgeContext that back this blank */
  sourceIds: string[];
  /** Direct quote or factual evidence proving this blank's answer */
  evidence: string;
}

export interface WordBankTask {
  id: string;
  mode: 'word-bank';
  topicId: string;
  topicName?: string;
  difficulty?: LearningDifficulty;
  instruction: string;
  /** Full educational text containing placeholders like {{blank-1}}, {{blank-2}} */
  textWithBlanks: string;
  /** Definitions and answers for each blank */
  blanks: WordBankBlank[];
  /** Shuffled word bank chips (4-8 items, containing all correct answers + grounded distractors) */
  words: string[];
  /** Combined source IDs referenced by the task */
  sourceIds: string[];
}

export type LearningTask =
  | QuizTask
  | FlashcardTask
  | FillInBlankTask
  | MatchingTask
  | WordBankTask;

export interface CompletedQuizTask {
  task: QuizTask;
  selectedAnswer: string;
  isCorrect: boolean;
  answeredAt: string;
}

export interface CompletedFlashcardTask {
  task: FlashcardTask;
  completedAt: string;
}

export interface CompletedFillInBlankTask {
  task: FillInBlankTask;
  userAnswer: string;
  isCorrect: boolean;
  completedAt: string;
}

export interface CompletedMatchingTask {
  task: MatchingTask;
  matchedPairsCount: number;
  completedAt: string;
}

export interface CompletedWordBankTask {
  task: WordBankTask;
  /** Map of blankId -> word placed by user */
  userPlacements: Record<string, string>;
  correctBlanksCount: number;
  totalBlanksCount: number;
  isFullyCorrect: boolean;
  completedAt: string;
}

export type CompletedTask =
  | CompletedQuizTask
  | CompletedFlashcardTask
  | CompletedFillInBlankTask
  | CompletedMatchingTask
  | CompletedWordBankTask;

export interface QuizSessionSummary {
  totalQuestions: number;
  correctCount: number;
  byTopic: Array<{
    topicId: string;
    topicName: string;
    total: number;
    correct: number;
  }>;
}

export interface FlashcardSessionSummary {
  totalCards: number;
  byTopic: Array<{
    topicId: string;
    topicName: string;
    total: number;
  }>;
}

export interface FillInBlankSessionSummary {
  totalTasks: number;
  correctCount: number;
  byTopic: Array<{
    topicId: string;
    topicName: string;
    total: number;
    correct: number;
  }>;
}

export interface MatchingSessionSummary {
  totalTasks: number;
  totalPairs: number;
  byTopic: Array<{
    topicId: string;
    topicName: string;
    total: number;
    pairs: number;
  }>;
}

export interface WordBankSessionSummary {
  totalTasks: number;
  totalBlanks: number;
  correctBlanks: number;
  byTopic: Array<{
    topicId: string;
    topicName: string;
    total: number;
    correct: number;
  }>;
}

