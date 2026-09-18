import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  LearningResult,
  TopicProgress,
  SubjectProgress,
  GlobalProgress,
  RecentLearningSession,
  getLearningResultsForUser,
  calculateTopicProgress,
  calculateSubjectProgress,
  calculateGlobalProgress,
  groupRecentLearningHistory,
  LEARNING_RESULTS_CHANGED_EVENT,
} from '../../application/use-cases/learning/learningProgress';
import type { Subject } from '../../application/use-cases/subjects';
import type { Topic } from '../../application/use-cases/topics';

export interface UseLearningProgressOptions {
  subjects?: Subject[];
  topics?: Topic[];
}

/**
 * Hook to retrieve and observe user learning progress and statistics across Materia.
 * Automatically updates when new exercise sessions are completed and recorded.
 */
export function useLearningProgress(
  userId: string | undefined,
  options?: UseLearningProgressOptions,
) {
  const [results, setResults] = useState<LearningResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subjects = options?.subjects ?? [];
  const topics = options?.topics ?? [];

  const loadResults = useCallback(async () => {
    if (!userId) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await getLearningResultsForUser(userId);
      setResults(data);
    } catch (err) {
      console.error('Failed to load learning results:', err);
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Lernfortschritts');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  useEffect(() => {
    const handleChanged = () => {
      void loadResults();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(LEARNING_RESULTS_CHANGED_EVENT, handleChanged);
      return () => {
        window.removeEventListener(LEARNING_RESULTS_CHANGED_EVENT, handleChanged);
      };
    }
  }, [loadResults]);

  // Topic progress helper
  const getTopicProgress = useCallback(
    (topicId: string): TopicProgress => {
      return calculateTopicProgress(topicId, results);
    },
    [results],
  );

  // Subject progress helper
  const getSubjectProgress = useCallback(
    (subjectId: string, topicIds?: string[]): SubjectProgress => {
      const resolvedTopicIds =
        topicIds ?? topics.filter((t) => t.subjectId === subjectId).map((t) => t.id);
      return calculateSubjectProgress(subjectId, resolvedTopicIds, results);
    },
    [results, topics],
  );

  // Global progress calculation
  const globalProgress = useMemo((): GlobalProgress => {
    return calculateGlobalProgress(
      subjects.map((s) => ({ id: s.id })),
      topics.map((t) => ({ id: t.id, subjectId: t.subjectId })),
      results,
    );
  }, [subjects, topics, results]);

  // Recent history grouped by session
  const recentHistory = useMemo((): RecentLearningSession[] => {
    const topicsMap = new Map<string, { id: string; name: string }>(
      topics.map((t) => [t.id, { id: t.id, name: t.name }]),
    );
    const subjectsMap = new Map<string, { id: string; name: string }>(
      subjects.map((s) => [s.id, { id: s.id, name: s.name }]),
    );
    return groupRecentLearningHistory(results, topicsMap, subjectsMap, 20);
  }, [results, topics, subjects]);

  return {
    results,
    isLoading,
    error,
    refresh: loadResults,
    getTopicProgress,
    getSubjectProgress,
    globalProgress,
    recentHistory,
  };
}
