/**
 * Domain & Application models for the Learn feature.
 *
 * Core rule: AI is not a knowledge source. All learning tasks must be strictly
 * grounded in retrieved sources (user documents + verified web sources).
 */

export type LearningMode = 'quiz' | 'flashcards' | 'fill-in-the-blank';

export interface GroundedSource {
  /** Stable identifier passed to the AI model, e.g. 'doc-1', 'web-1' */
  id: string;
  type: 'document' | 'web';
  title: string;
  url?: string;
  domain?: string;
  documentId?: string;
  documentName?: string;
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
  topicId: string;
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
