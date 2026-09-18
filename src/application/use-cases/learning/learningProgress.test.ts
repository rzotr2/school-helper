import { describe, it, expect } from 'vitest';
import {
  calculateTopicProgress,
  calculateSubjectProgress,
  calculateGlobalProgress,
  getLearningState,
  groupRecentLearningHistory,
  formatLearningStateLabel,
  type LearningResult,
} from './learningProgress';

describe('learningProgress calculation module', () => {
  const dummyResult = (overrides: Partial<LearningResult> = {}): LearningResult => ({
    id: 'res-' + Math.random().toString(36).substring(2, 8),
    userId: 'user-1',
    subjectId: 'sub-1',
    topicId: 'top-1',
    sessionId: 'session-1',
    exerciseType: 'quiz',
    isCorrect: true,
    createdAt: '2026-09-18T10:00:00.000Z',
    ...overrides,
  });

  describe('Topic Progress Calculation', () => {
    it('returns unlearned state when there are no results', () => {
      const progress = calculateTopicProgress('top-1', []);
      expect(progress.completedExercises).toBe(0);
      expect(progress.correctExercises).toBe(0);
      expect(progress.incorrectExercises).toBe(0);
      expect(progress.accuracyPercentage).toBeNull();
      expect(progress.lastStudiedAt).toBeNull();
      expect(progress.learningState).toBe('unlearned');
      expect(formatLearningStateLabel(progress.learningState)).toBe('Noch nicht gelernt');
    });

    it('calculates 100% Sicher when all exercises are correct', () => {
      const results = [
        dummyResult({ topicId: 'top-1', isCorrect: true, exerciseType: 'quiz' }),
        dummyResult({ topicId: 'top-1', isCorrect: true, exerciseType: 'flashcard' }),
        dummyResult({ topicId: 'top-1', isCorrect: true, exerciseType: 'fill_in_blank' }),
        dummyResult({ topicId: 'top-1', isCorrect: true, exerciseType: 'word_bank' }),
      ];

      const progress = calculateTopicProgress('top-1', results);
      expect(progress.completedExercises).toBe(4);
      expect(progress.correctExercises).toBe(4);
      expect(progress.incorrectExercises).toBe(0);
      expect(progress.accuracyPercentage).toBe(100);
      expect(progress.learningState).toBe('sicher');
      expect(formatLearningStateLabel(progress.learningState)).toBe('Sicher');
    });

    it('calculates 0% Wiederholen when all exercises are incorrect', () => {
      const results = [
        dummyResult({ topicId: 'top-1', isCorrect: false }),
        dummyResult({ topicId: 'top-1', isCorrect: false }),
      ];

      const progress = calculateTopicProgress('top-1', results);
      expect(progress.completedExercises).toBe(2);
      expect(progress.correctExercises).toBe(0);
      expect(progress.incorrectExercises).toBe(2);
      expect(progress.accuracyPercentage).toBe(0);
      expect(progress.learningState).toBe('wiederholen');
      expect(formatLearningStateLabel(progress.learningState)).toBe('Wiederholen');
    });

    it('calculates mixed accuracy and classifies Üben for 50-79%', () => {
      // 3 correct out of 5 = 60%
      const results = [
        dummyResult({ topicId: 'top-1', isCorrect: true, exerciseType: 'quiz' }),
        dummyResult({ topicId: 'top-1', isCorrect: true, exerciseType: 'matching' }),
        dummyResult({ topicId: 'top-1', isCorrect: true, exerciseType: 'word_bank' }),
        dummyResult({ topicId: 'top-1', isCorrect: false, exerciseType: 'fill_in_blank' }),
        dummyResult({ topicId: 'top-1', isCorrect: false, exerciseType: 'quiz' }),
      ];

      const progress = calculateTopicProgress('top-1', results);
      expect(progress.completedExercises).toBe(5);
      expect(progress.correctExercises).toBe(3);
      expect(progress.incorrectExercises).toBe(2);
      expect(progress.accuracyPercentage).toBe(60);
      expect(progress.learningState).toBe('ueben');
      expect(formatLearningStateLabel(progress.learningState)).toBe('Üben');
    });

    it('tracks the latest timestamp in lastStudiedAt', () => {
      const results = [
        dummyResult({ topicId: 'top-1', createdAt: '2026-09-18T09:00:00.000Z' }),
        dummyResult({ topicId: 'top-1', createdAt: '2026-09-18T11:30:00.000Z' }),
        dummyResult({ topicId: 'top-1', createdAt: '2026-09-18T10:15:00.000Z' }),
      ];

      const progress = calculateTopicProgress('top-1', results);
      expect(progress.lastStudiedAt).toBe('2026-09-18T11:30:00.000Z');
    });

    it('filters only results matching the requested topicId', () => {
      const results = [
        dummyResult({ topicId: 'top-1', isCorrect: true }),
        dummyResult({ topicId: 'top-2', isCorrect: false }),
      ];

      const progress = calculateTopicProgress('top-1', results);
      expect(progress.completedExercises).toBe(1);
      expect(progress.correctExercises).toBe(1);
    });
  });

  describe('Subject Progress Calculation', () => {
    it('returns unlearned for subject without any activity', () => {
      const progress = calculateSubjectProgress('sub-1', ['top-1', 'top-2'], []);
      expect(progress.completedExercises).toBe(0);
      expect(progress.accuracyPercentage).toBeNull();
      expect(progress.topicsLearnedCount).toBe(0);
      expect(progress.totalTopicsCount).toBe(2);
      expect(progress.learningState).toBe('unlearned');
    });

    it('aggregates multiple topics under the subject and counts learned topics', () => {
      const results = [
        // Topic 1: 2 correct, 0 incorrect (100%)
        dummyResult({ subjectId: 'sub-1', topicId: 'top-1', isCorrect: true }),
        dummyResult({ subjectId: 'sub-1', topicId: 'top-1', isCorrect: true }),
        // Topic 2: 1 correct, 1 incorrect (50%)
        dummyResult({ subjectId: 'sub-1', topicId: 'top-2', isCorrect: true }),
        dummyResult({ subjectId: 'sub-1', topicId: 'top-2', isCorrect: false }),
        // Topic 3 has no activity
        // Unrelated subject
        dummyResult({ subjectId: 'sub-2', topicId: 'top-4', isCorrect: false }),
      ];

      const progress = calculateSubjectProgress('sub-1', ['top-1', 'top-2', 'top-3'], results);
      expect(progress.completedExercises).toBe(4);
      expect(progress.correctExercises).toBe(3);
      expect(progress.incorrectExercises).toBe(1);
      expect(progress.accuracyPercentage).toBe(75); // 3/4 = 75% -> Üben
      expect(progress.learningState).toBe('ueben');
      expect(progress.topicsLearnedCount).toBe(2);
      expect(progress.totalTopicsCount).toBe(3);
    });
  });

  describe('Global Progress Calculation', () => {
    it('returns zeroed unlearned state when user has no results', () => {
      const subjects = [{ id: 'sub-1' }, { id: 'sub-2' }];
      const topics = [{ id: 'top-1', subjectId: 'sub-1' }, { id: 'top-2', subjectId: 'sub-2' }];
      const progress = calculateGlobalProgress(subjects, topics, []);

      expect(progress.totalExercises).toBe(0);
      expect(progress.correctExercises).toBe(0);
      expect(progress.accuracyPercentage).toBeNull();
      expect(progress.subjectsLearnedCount).toBe(0);
      expect(progress.topicsLearnedCount).toBe(0);
      expect(progress.totalSubjectsCount).toBe(2);
      expect(progress.totalTopicsCount).toBe(2);
    });

    it('correctly aggregates all exercise modes across all subjects', () => {
      const subjects = [{ id: 'sub-1' }, { id: 'sub-2' }, { id: 'sub-3' }];
      const topics = [
        { id: 'top-1', subjectId: 'sub-1' },
        { id: 'top-2', subjectId: 'sub-1' },
        { id: 'top-3', subjectId: 'sub-2' },
      ];

      const results = [
        dummyResult({ subjectId: 'sub-1', topicId: 'top-1', exerciseType: 'quiz', isCorrect: true }),
        dummyResult({ subjectId: 'sub-1', topicId: 'top-1', exerciseType: 'flashcard', isCorrect: true }),
        dummyResult({ subjectId: 'sub-1', topicId: 'top-2', exerciseType: 'fill_in_blank', isCorrect: false }),
        dummyResult({ subjectId: 'sub-2', topicId: 'top-3', exerciseType: 'matching', isCorrect: true }),
        dummyResult({ subjectId: 'sub-2', topicId: 'top-3', exerciseType: 'word_bank', isCorrect: true }),
      ];

      const progress = calculateGlobalProgress(subjects, topics, results);
      expect(progress.totalExercises).toBe(5);
      expect(progress.correctExercises).toBe(4);
      expect(progress.incorrectExercises).toBe(1);
      expect(progress.accuracyPercentage).toBe(80); // 4/5 = 80%
      expect(progress.topicsLearnedCount).toBe(3);
      expect(progress.subjectsLearnedCount).toBe(2);
      expect(progress.totalSubjectsCount).toBe(3);
      expect(progress.totalTopicsCount).toBe(3);
    });
  });

  describe('Recent Learning History Grouping', () => {
    it('returns empty array when results are empty', () => {
      const history = groupRecentLearningHistory([], new Map(), new Map());
      expect(history).toEqual([]);
    });

    it('groups multiple exercise items sharing a sessionId into a single session item', () => {
      const topicsMap = new Map([['top-1', { id: 'top-1', name: 'Kaufvertragsstörungen' }]]);
      const subjectsMap = new Map([['sub-1', { id: 'sub-1', name: 'Wirtschafts- und Sozialprozesse' }]]);

      const results = [
        dummyResult({
          sessionId: 'session-A',
          exerciseType: 'quiz',
          isCorrect: true,
          createdAt: '2026-09-18T10:42:00.000Z',
        }),
        dummyResult({
          sessionId: 'session-A',
          exerciseType: 'quiz',
          isCorrect: true,
          createdAt: '2026-09-18T10:43:00.000Z',
        }),
        dummyResult({
          sessionId: 'session-A',
          exerciseType: 'quiz',
          isCorrect: false,
          createdAt: '2026-09-18T10:44:00.000Z',
        }),
      ];

      const history = groupRecentLearningHistory(results, topicsMap, subjectsMap);
      expect(history.length).toBe(1);
      expect(history[0].exerciseCount).toBe(3);
      expect(history[0].correctCount).toBe(2);
      expect(history[0].accuracyPercentage).toBe(67);
      expect(history[0].topicName).toBe('Kaufvertragsstörungen');
      expect(history[0].subjectName).toBe('Wirtschafts- und Sozialprozesse');
      expect(history[0].exerciseTypeLabel).toBe('Quiz');
    });

    it('sorts sessions chronologically descending and respects limits', () => {
      const topicsMap = new Map([
        ['top-1', { id: 'top-1', name: 'Thema 1' }],
        ['top-2', { id: 'top-2', name: 'Thema 2' }],
      ]);
      const subjectsMap = new Map([['sub-1', { id: 'sub-1', name: 'Fach 1' }]]);

      const results = [
        dummyResult({ sessionId: 'session-older', createdAt: '2026-09-17T09:00:00.000Z', topicId: 'top-1' }),
        dummyResult({ sessionId: 'session-newer', createdAt: '2026-09-18T11:00:00.000Z', topicId: 'top-2' }),
      ];

      const history = groupRecentLearningHistory(results, topicsMap, subjectsMap, 1);
      expect(history.length).toBe(1);
      expect(history[0].sessionId).toBe('session-newer');
      expect(history[0].topicName).toBe('Thema 2');
    });
  });

  describe('Learning State Classification', () => {
    it('classifies thresholds accurately', () => {
      expect(getLearningState(null, 0)).toBe('unlearned');
      expect(getLearningState(0, 0)).toBe('unlearned');
      expect(getLearningState(100, 5)).toBe('sicher');
      expect(getLearningState(80, 5)).toBe('sicher');
      expect(getLearningState(79, 5)).toBe('ueben');
      expect(getLearningState(50, 5)).toBe('ueben');
      expect(getLearningState(49, 5)).toBe('wiederholen');
      expect(getLearningState(0, 5)).toBe('wiederholen');
    });
  });
});
