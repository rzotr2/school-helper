import { supabase } from '../../../infrastructure/supabase/client';
import type { Database } from '../../../infrastructure/supabase/database.types';
import { safeUUID } from '../../../shared/utils/uuid';

export type ExerciseType = 'quiz' | 'flashcard' | 'fill_in_blank' | 'matching' | 'word_bank';

export interface LearningResult {
  id: string;
  userId: string;
  subjectId: string;
  topicId: string;
  sessionId: string | null;
  exerciseType: ExerciseType;
  isCorrect: boolean;
  createdAt: string;
}

export type LearningState = 'sicher' | 'ueben' | 'wiederholen' | 'unlearned';

export interface TopicProgress {
  topicId: string;
  completedExercises: number;
  correctExercises: number;
  incorrectExercises: number;
  accuracyPercentage: number | null;
  lastStudiedAt: string | null;
  learningState: LearningState;
}

export interface SubjectProgress {
  subjectId: string;
  completedExercises: number;
  correctExercises: number;
  incorrectExercises: number;
  accuracyPercentage: number | null;
  lastStudiedAt: string | null;
  learningState: LearningState;
  topicsLearnedCount: number;
  totalTopicsCount: number;
}

export interface GlobalProgress {
  totalExercises: number;
  correctExercises: number;
  incorrectExercises: number;
  accuracyPercentage: number | null;
  topicsLearnedCount: number;
  subjectsLearnedCount: number;
  totalSubjectsCount: number;
  totalTopicsCount: number;
  lastStudiedAt: string | null;
}

export interface RecentLearningSession {
  sessionId: string;
  dateLabel: string;
  timeLabel: string;
  timestamp: string;
  exerciseTypeLabel: string;
  rawExerciseType: ExerciseType;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  exerciseCount: number;
  correctCount: number;
  accuracyPercentage: number;
}

export const LEARNING_RESULTS_CHANGED_EVENT = 'materia:learning-results-changed';

export function notifyLearningResultsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LEARNING_RESULTS_CHANGED_EVENT));
  }
}

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  quiz: 'Quiz',
  flashcard: 'Karteikarten',
  fill_in_blank: 'Lückentext',
  matching: 'Zuordnen',
  word_bank: 'Wortbank',
};

export function formatLearningStateLabel(state: LearningState): string {
  switch (state) {
    case 'sicher':
      return 'Sicher';
    case 'ueben':
      return 'Üben';
    case 'wiederholen':
      return 'Wiederholen';
    case 'unlearned':
    default:
      return 'Noch nicht gelernt';
  }
}

/**
 * Deterministically classifies the learning state based on accuracy percentage and completed exercises.
 * - No completed exercises -> 'unlearned' ("Noch nicht gelernt")
 * - 80-100% -> 'sicher' ("Sicher")
 * - 50-79% -> 'ueben' ("Üben")
 * - < 50% -> 'wiederholen' ("Wiederholen")
 */
export function getLearningState(accuracyPercentage: number | null, completedCount: number): LearningState {
  if (completedCount <= 0 || accuracyPercentage === null) {
    return 'unlearned';
  }
  if (accuracyPercentage >= 80) {
    return 'sicher';
  }
  if (accuracyPercentage >= 50) {
    return 'ueben';
  }
  return 'wiederholen';
}

/**
 * Calculates topic-level learning progress from raw learning results.
 */
export function calculateTopicProgress(
  topicId: string,
  results: LearningResult[],
): TopicProgress {
  const topicResults = results.filter((r) => r.topicId === topicId);
  const completed = topicResults.length;

  if (completed === 0) {
    return {
      topicId,
      completedExercises: 0,
      correctExercises: 0,
      incorrectExercises: 0,
      accuracyPercentage: null,
      lastStudiedAt: null,
      learningState: 'unlearned',
    };
  }

  let correct = 0;
  let latestTimestamp = '';

  for (const r of topicResults) {
    if (r.isCorrect) correct += 1;
    if (!latestTimestamp || new Date(r.createdAt) > new Date(latestTimestamp)) {
      latestTimestamp = r.createdAt;
    }
  }

  const incorrect = completed - correct;
  const accuracyPercentage = Math.round((correct / completed) * 100);

  return {
    topicId,
    completedExercises: completed,
    correctExercises: correct,
    incorrectExercises: incorrect,
    accuracyPercentage,
    lastStudiedAt: latestTimestamp || null,
    learningState: getLearningState(accuracyPercentage, completed),
  };
}

/**
 * Calculates subject-level learning progress by aggregating results across the subject's topics.
 */
export function calculateSubjectProgress(
  subjectId: string,
  topicIds: string[],
  results: LearningResult[],
): SubjectProgress {
  const subjectResults = results.filter((r) => r.subjectId === subjectId);
  const completed = subjectResults.length;

  const topicsWithActivity = new Set<string>();
  for (const r of subjectResults) {
    if (topicIds.includes(r.topicId)) {
      topicsWithActivity.add(r.topicId);
    }
  }

  if (completed === 0) {
    return {
      subjectId,
      completedExercises: 0,
      correctExercises: 0,
      incorrectExercises: 0,
      accuracyPercentage: null,
      lastStudiedAt: null,
      learningState: 'unlearned',
      topicsLearnedCount: 0,
      totalTopicsCount: topicIds.length,
    };
  }

  let correct = 0;
  let latestTimestamp = '';

  for (const r of subjectResults) {
    if (r.isCorrect) correct += 1;
    if (!latestTimestamp || new Date(r.createdAt) > new Date(latestTimestamp)) {
      latestTimestamp = r.createdAt;
    }
  }

  const incorrect = completed - correct;
  const accuracyPercentage = Math.round((correct / completed) * 100);

  return {
    subjectId,
    completedExercises: completed,
    correctExercises: correct,
    incorrectExercises: incorrect,
    accuracyPercentage,
    lastStudiedAt: latestTimestamp || null,
    learningState: getLearningState(accuracyPercentage, completed),
    topicsLearnedCount: topicsWithActivity.size,
    totalTopicsCount: topicIds.length,
  };
}

/**
 * Calculates global learning progress across all subjects and topics for the user.
 */
export function calculateGlobalProgress(
  subjects: Array<{ id: string }>,
  topics: Array<{ id: string; subjectId: string }>,
  results: LearningResult[],
): GlobalProgress {
  const total = results.length;
  const topicsWithActivity = new Set<string>();
  const subjectsWithActivity = new Set<string>();

  let correct = 0;
  let latestTimestamp = '';

  for (const r of results) {
    if (r.isCorrect) correct += 1;
    topicsWithActivity.add(r.topicId);
    subjectsWithActivity.add(r.subjectId);
    if (!latestTimestamp || new Date(r.createdAt) > new Date(latestTimestamp)) {
      latestTimestamp = r.createdAt;
    }
  }

  const incorrect = total - correct;
  const accuracyPercentage = total > 0 ? Math.round((correct / total) * 100) : null;

  return {
    totalExercises: total,
    correctExercises: correct,
    incorrectExercises: incorrect,
    accuracyPercentage,
    topicsLearnedCount: topicsWithActivity.size,
    subjectsLearnedCount: subjectsWithActivity.size,
    totalSubjectsCount: subjects.length,
    totalTopicsCount: topics.length,
    lastStudiedAt: latestTimestamp || null,
  };
}

/**
 * Format relative date (Heute, Gestern, or DD.MM.YYYY)
 */
export function formatRelativeDate(isoOrDate: string | Date): { dateLabel: string; timeLabel: string } {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) {
    return { dateLabel: 'Unbekannt', timeLabel: '' };
  }

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeLabel = `${hours}:${minutes}`;

  let dateLabel: string;
  if (isToday) {
    dateLabel = 'Heute';
  } else if (isYesterday) {
    dateLabel = 'Gestern';
  } else {
    dateLabel = d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  return { dateLabel, timeLabel };
}

/**
 * Groups raw learning results into sessions for the recent activity history.
 * Prefers session_id when available; otherwise clusters by topicId + exerciseType within a 15-minute window.
 */
export function groupRecentLearningHistory(
  results: LearningResult[],
  topicsMap: Map<string, { id: string; name: string }>,
  subjectsMap: Map<string, { id: string; name: string }>,
  limit = 10,
): RecentLearningSession[] {
  if (results.length === 0) return [];

  // Sort descending by creation date
  const sorted = [...results].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const sessionGroups: Map<string, LearningResult[]> = new Map();

  for (const r of sorted) {
    let groupKey: string;
    if (r.sessionId) {
      groupKey = r.sessionId;
    } else {
      // Cluster by topic + type + date minute
      const timeBucket = Math.floor(new Date(r.createdAt).getTime() / (15 * 60 * 1000));
      groupKey = `${r.topicId}_${r.exerciseType}_${timeBucket}`;
    }

    const group = sessionGroups.get(groupKey);
    if (group) {
      group.push(r);
    } else {
      sessionGroups.set(groupKey, [r]);
    }
  }

  const sessions: RecentLearningSession[] = [];

  for (const [key, items] of sessionGroups.entries()) {
    const first = items[0];
    const totalCount = items.length;
    const correctCount = items.filter((i) => i.isCorrect).length;
    const accuracy = Math.round((correctCount / totalCount) * 100);

    const { dateLabel, timeLabel } = formatRelativeDate(first.createdAt);
    const subject = subjectsMap.get(first.subjectId);
    const topic = topicsMap.get(first.topicId);

    sessions.push({
      sessionId: key,
      dateLabel,
      timeLabel,
      timestamp: first.createdAt,
      exerciseTypeLabel: EXERCISE_TYPE_LABELS[first.exerciseType] || first.exerciseType,
      rawExerciseType: first.exerciseType,
      subjectId: first.subjectId,
      subjectName: subject?.name || 'Unbekanntes Fach',
      topicId: first.topicId,
      topicName: topic?.name || 'Unbekanntes Thema',
      exerciseCount: totalCount,
      correctCount,
      accuracyPercentage: accuracy,
    });
  }

  return sessions.slice(0, limit);
}

// --- Supabase Persistence Operations ---

type LearningResultRow = Database['public']['Tables']['learning_results']['Row'];

function mapLearningResult(row: LearningResultRow): LearningResult {
  return {
    id: row.id,
    userId: row.user_id,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    sessionId: row.session_id,
    exerciseType: row.exercise_type as ExerciseType,
    isCorrect: row.is_correct,
    createdAt: row.created_at,
  };
}

/**
 * Persists an array of learning results to Supabase in a single batch.
 */
export async function recordLearningResults(
  userId: string,
  records: Array<{
    subjectId: string;
    topicId: string;
    sessionId?: string | null;
    exerciseType: ExerciseType;
    isCorrect: boolean;
    completedAt?: string;
  }>,
): Promise<void> {
  if (records.length === 0) return;

  const inserts: Database['public']['Tables']['learning_results']['Insert'][] = records.map((r) => ({
    id: safeUUID(),
    user_id: userId,
    subject_id: r.subjectId,
    topic_id: r.topicId,
    session_id: r.sessionId?.trim() || null,
    exercise_type: r.exerciseType,
    is_correct: r.isCorrect,
    created_at: r.completedAt || new Date().toISOString(),
  }));

  const { error } = await supabase.from('learning_results').insert(inserts);

  if (error) {
    console.error('Failed to record learning results:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(`Lernfortschritt konnte nicht gespeichert werden: ${error.message}`);
  }

  notifyLearningResultsChanged();
}

/**
 * Fetches all learning results for the given user, sorted descending by created_at.
 */
export async function getLearningResultsForUser(userId: string): Promise<LearningResult[]> {
  const { data, error } = await supabase
    .from('learning_results')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch learning results for user:', error);
    return [];
  }

  return (data || []).map(mapLearningResult);
}
