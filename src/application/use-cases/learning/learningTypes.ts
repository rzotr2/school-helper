/**
 * Domain & Application models for the Learn feature.
 *
 * Core rule: AI is not a knowledge source. All learning tasks must be strictly
 * grounded in retrieved sources (user documents + verified web sources).
 */

export type LearningMode = 'quiz' | 'flashcards' | 'fill-in-the-blank';

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

export type LearningTask = QuizTask | FlashcardTask | FillInBlankTask;

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

export type CompletedTask = CompletedQuizTask | CompletedFlashcardTask | CompletedFillInBlankTask;

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
