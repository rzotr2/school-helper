import React, { useEffect, useState, useMemo } from 'react';
import {
  GraduationCap,
  BookOpen,
  Sparkles,
  Layers,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RotateCcw,
  FileText,
  Globe,
  Trophy,
  BarChart2,
} from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { Subject, getSubjects } from '../../application/use-cases/subjects';
import { Topic, getAllTopics } from '../../application/use-cases/topics';
import { Document, getAllDocuments } from '../../application/use-cases/documents';
import { retrieveTopicDocuments } from '../../application/use-cases/learning/documentRetrieval';
import { retrieveWebSources } from '../../application/use-cases/learning/webRetrieval';
import {
  generateQuizTask,
  generateFlashcardTask,
  generateFillInBlankTask,
  BLANK_MARKER,
  checkFillInBlankAnswer,
} from '../../application/use-cases/learning/learnGenerator';
import type {
  CompletedTask,
  CompletedQuizTask,
  CompletedFlashcardTask,
  CompletedFillInBlankTask,
  FillInBlankSessionSummary,
  FillInBlankTask,
  FlashcardSessionSummary,
  FlashcardTask,
  GroundedKnowledgeContext,
  GroundedSource,
  LearningDifficulty,
  LearningMode,
  LearningTask,
  QuizSessionSummary,
  QuizTask,
} from '../../application/use-cases/learning/learningTypes';
import { cn } from '../../shared/utils/cn';

const SESSION_QUESTION_LIMIT = 5;

export function LearnPage() {
  const { user, isLoading: isAuthLoading } = useAuth();

  // Step 1: Subjects & Topics selection
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingTaxonomy, setIsLoadingTaxonomy] = useState(true);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<LearningMode>('quiz');
  const [difficulty, setDifficulty] = useState<LearningDifficulty>('mittel');

  // Step 2: Generation and Active Session State
  const [knowledgeContext, setKnowledgeContext] = useState<GroundedKnowledgeContext | null>(null);
  const [currentTask, setCurrentTask] = useState<LearningTask | null>(null);
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number>(1);
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([]);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Interaction State for Quiz & Lückentext
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [fillBlankInput, setFillBlankInput] = useState<string>('');
  const [fillBlankResult, setFillBlankResult] = useState<{ isCorrect: boolean } | null>(null);

  useEffect(() => {
    async function loadTaxonomy() {
      if (!user || isAuthLoading) return;
      try {
        setIsLoadingTaxonomy(true);
        const [loadedSubjects, loadedTopics, loadedDocs] = await Promise.all([
          getSubjects(user.id),
          getAllTopics(user.id),
          getAllDocuments(user.id),
        ]);
        setSubjects(loadedSubjects);
        setTopics(loadedTopics);
        setDocuments(loadedDocs);

        if (loadedSubjects.length > 0) {
          setSelectedSubjectId(loadedSubjects[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden der Daten');
      } finally {
        setIsLoadingTaxonomy(false);
      }
    }
    void loadTaxonomy();
  }, [user, isAuthLoading]);

  // Document counts per topic (total and completed)
  const topicDocumentCounts = useMemo(() => {
    const counts = new Map<string, { total: number; completed: number }>();
    for (const doc of documents) {
      const current = counts.get(doc.topicId) ?? { total: 0, completed: 0 };
      current.total += 1;
      if (doc.processingStatus === 'completed') {
        current.completed += 1;
      }
      counts.set(doc.topicId, current);
    }
    return counts;
  }, [documents]);

  // Topics belonging to the selected subject
  const availableTopics = useMemo(() => {
    if (!selectedSubjectId) return [];
    return topics.filter((t) => t.subjectId === selectedSubjectId);
  }, [topics, selectedSubjectId]);

  // Topics that can actually be selected (have completed documents)
  const selectableTopics = useMemo(() => {
    return availableTopics.filter((t) => (topicDocumentCounts.get(t.id)?.completed ?? 0) > 0);
  }, [availableTopics, topicDocumentCounts]);

  // Handle subject change: reset selected topics
  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedTopicIds([]);
    resetSession();
  };

  const resetSession = () => {
    setKnowledgeContext(null);
    setCurrentTask(null);
    setCurrentQuestionNumber(1);
    setCompletedTasks([]);
    setIsSessionComplete(false);
    setSelectedAnswer(null);
    setIsAnswerRevealed(false);
    setFillBlankInput('');
    setFillBlankResult(null);
    setError(null);
  };

  const toggleTopic = (topicId: string) => {
    const stats = topicDocumentCounts.get(topicId);
    if (!stats || stats.completed === 0) {
      // Impossible to select empty topics without documents
      return;
    }
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId],
    );
  };

  // Select next topic in a round-robin / balanced fashion
  const getNextTargetTopic = (
    context: GroundedKnowledgeContext,
    completed: CompletedTask[],
  ) => {
    const topicCounts = new Map<string, number>();
    context.topicIds.forEach((id) => topicCounts.set(id, 0));

    completed.forEach((c) => {
      const cnt = topicCounts.get(c.task.topicId) ?? 0;
      topicCounts.set(c.task.topicId, cnt + 1);
    });

    let minTopicId = context.topicIds[0];
    let minCount = Infinity;
    for (const [tId, cnt] of topicCounts.entries()) {
      if (cnt < minCount) {
        minCount = cnt;
        minTopicId = tId;
      }
    }

    const tIndex = context.topicIds.indexOf(minTopicId);
    const tName = context.topicNames[tIndex] || minTopicId;
    return { targetTopicId: minTopicId, targetTopicName: tName };
  };

  const handleStartSession = async () => {
    if (!user || selectedTopicIds.length === 0) return;

    // Strict validation: impossible to create quiz for empty topics
    const emptyTopics = selectedTopicIds.filter(
      (tId) => (topicDocumentCounts.get(tId)?.completed ?? 0) === 0,
    );
    if (emptyTopics.length > 0) {
      setError('Ausgewählte Themen ohne Dokumente können nicht für die Lernsession verwendet werden.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setCompletedTasks([]);
    setCurrentQuestionNumber(1);
    setIsSessionComplete(false);
    setSelectedAnswer(null);
    setIsAnswerRevealed(false);

    try {
      const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
      const selectedTopicsList = topics.filter((t) => selectedTopicIds.includes(t.id));

      // 1. Retrieve user documents - must have document sources
      setGenerationStep('Lade Dokumente aus deinen Themen…');
      const docSources = await retrieveTopicDocuments(user.id, selectedTopicIds);

      if (docSources.length === 0) {
        throw new Error(
          'Zu den ausgewählten Themen wurden keine Dokumente gefunden. Bitte lade zuerst Unterlagen hoch, um ein Quiz zu erstellen.',
        );
      }

      // 2. Retrieve authoritative web information
      setGenerationStep('Recherchiere aktuelle Quellen aus dem Internet…');
      const webSources = await retrieveWebSources(
        selectedSubject?.name || '',
        selectedTopicsList.map((t) => t.name),
      );

      const allSources = [...docSources, ...webSources];

      if (allSources.length === 0) {
        throw new Error(
          'Zu den ausgewählten Themen wurden weder Dokumente noch Webquellen gefunden. Bitte lade Unterlagen hoch oder wähle andere Themen.',
        );
      }

      const context: GroundedKnowledgeContext = {
        subjectId: selectedSubjectId,
        subjectName: selectedSubject?.name || '',
        topicIds: selectedTopicIds,
        topicNames: selectedTopicsList.map((t) => t.name),
        sources: allSources,
      };

      setKnowledgeContext(context);

      // 3. Generate initial task based on selectedMode with balanced topic selection
      setGenerationStep(
        selectedMode === 'flashcards'
          ? 'Erstelle quellenbasierte Karteikarte…'
          : selectedMode === 'fill-in-the-blank'
            ? 'Erstelle quellenbasierten Lückentext…'
            : 'Erstelle quellenbasierte Quiz-Aufgabe…',
      );
      const { targetTopicId, targetTopicName } = getNextTargetTopic(context, []);
      let task: LearningTask;
      if (selectedMode === 'flashcards') {
        task = await generateFlashcardTask(context, {
          targetTopicId,
          targetTopicName,
          difficulty,
        });
      } else if (selectedMode === 'fill-in-the-blank') {
        task = await generateFillInBlankTask(context, {
          targetTopicId,
          targetTopicName,
          difficulty,
        });
      } else {
        task = await generateQuizTask(context, {
          targetTopicId,
          targetTopicName,
          difficulty,
        });
      }
      setCurrentTask(task);
      setCurrentQuestionNumber(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Lernsession');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handleSelectAnswerOption = (option: string) => {
    if (isAnswerRevealed || !currentTask || currentTask.mode === 'flashcards' || currentTask.mode === 'fill-in-the-blank') return;
    setSelectedAnswer(option);
    setIsAnswerRevealed(true);

    const isCorrect = option === currentTask.correctAnswer;
    const completedRecord: CompletedQuizTask = {
      task: currentTask,
      selectedAnswer: option,
      isCorrect,
      answeredAt: new Date().toISOString(),
    };
    setCompletedTasks((prev) => [...prev, completedRecord]);
  };

  const handleFlipFlashcard = () => {
    if (!currentTask || currentTask.mode !== 'flashcards') return;
    const nextRevealed = !isAnswerRevealed;
    setIsAnswerRevealed(nextRevealed);

    if (nextRevealed && !completedTasks.some((c) => c.task.id === currentTask.id)) {
      const completedRecord: CompletedFlashcardTask = {
        task: currentTask,
        completedAt: new Date().toISOString(),
      };
      setCompletedTasks((prev) => [...prev, completedRecord]);
    }
  };

  const handleSubmitFillInBlank = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswerRevealed || !currentTask || currentTask.mode !== 'fill-in-the-blank') return;

    const trimmedInput = fillBlankInput.trim();
    if (!trimmedInput) return;

    const isCorrect = checkFillInBlankAnswer(trimmedInput, currentTask.answer);
    setFillBlankResult({ isCorrect });
    setIsAnswerRevealed(true);

    const completedRecord: CompletedFillInBlankTask = {
      task: currentTask,
      userAnswer: trimmedInput,
      isCorrect,
      completedAt: new Date().toISOString(),
    };
    setCompletedTasks((prev) => [...prev, completedRecord]);
  };

  const handleNextTask = async () => {
    if (!knowledgeContext) return;

    if (completedTasks.length >= SESSION_QUESTION_LIMIT) {
      setIsSessionComplete(true);
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSelectedAnswer(null);
    setIsAnswerRevealed(false);
    setFillBlankInput('');
    setFillBlankResult(null);
    setGenerationStep('Generiere nächste Aufgabe auf Basis der Quellen…');

    try {
      const { targetTopicId, targetTopicName } = getNextTargetTopic(
        knowledgeContext,
        completedTasks,
      );
      const avoidQuestions = completedTasks.map((c) =>
        'question' in c.task ? c.task.question : c.task.sentenceWithBlank,
      );

      let task: LearningTask;
      if (selectedMode === 'flashcards') {
        task = await generateFlashcardTask(knowledgeContext, {
          targetTopicId,
          targetTopicName,
          difficulty,
          avoidQuestions,
        });
      } else if (selectedMode === 'fill-in-the-blank') {
        task = await generateFillInBlankTask(knowledgeContext, {
          targetTopicId,
          targetTopicName,
          difficulty,
          avoidSentences: avoidQuestions,
        });
      } else {
        task = await generateQuizTask(knowledgeContext, {
          targetTopicId,
          targetTopicName,
          difficulty,
          avoidQuestions,
        });
      }
      setCurrentTask(task);
      setCurrentQuestionNumber((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der nächsten Aufgabe');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  // Summary calculations for completed session
  const quizSummary: QuizSessionSummary | null = useMemo(() => {
    if (
      !isSessionComplete ||
      completedTasks.length === 0 ||
      !knowledgeContext ||
      selectedMode !== 'quiz'
    ) {
      return null;
    }

    const byTopicMap = new Map<string, { total: number; correct: number }>();
    knowledgeContext.topicIds.forEach((tId) => {
      byTopicMap.set(tId, { total: 0, correct: 0 });
    });

    let correctCount = 0;
    completedTasks.forEach((c) => {
      const isCorrect = 'isCorrect' in c ? c.isCorrect : false;
      if (isCorrect) correctCount++;
      const current = byTopicMap.get(c.task.topicId) ?? { total: 0, correct: 0 };
      byTopicMap.set(c.task.topicId, {
        total: current.total + 1,
        correct: current.correct + (isCorrect ? 1 : 0),
      });
    });

    const byTopic = knowledgeContext.topicIds.map((tId, idx) => {
      const stats = byTopicMap.get(tId) ?? { total: 0, correct: 0 };
      return {
        topicId: tId,
        topicName: knowledgeContext.topicNames[idx] || tId,
        total: stats.total,
        correct: stats.correct,
      };
    });

    return {
      totalQuestions: completedTasks.length,
      correctCount,
      byTopic,
    };
  }, [isSessionComplete, completedTasks, knowledgeContext, selectedMode]);

  const flashcardSummary: FlashcardSessionSummary | null = useMemo(() => {
    if (
      !isSessionComplete ||
      completedTasks.length === 0 ||
      !knowledgeContext ||
      selectedMode !== 'flashcards'
    ) {
      return null;
    }

    const byTopicMap = new Map<string, number>();
    knowledgeContext.topicIds.forEach((tId) => {
      byTopicMap.set(tId, 0);
    });

    completedTasks.forEach((c) => {
      byTopicMap.set(c.task.topicId, (byTopicMap.get(c.task.topicId) ?? 0) + 1);
    });

    const byTopic = knowledgeContext.topicIds.map((tId, idx) => ({
      topicId: tId,
      topicName: knowledgeContext.topicNames[idx] || tId,
      total: byTopicMap.get(tId) ?? 0,
    }));

    return {
      totalCards: completedTasks.length,
      byTopic,
    };
  }, [isSessionComplete, completedTasks, knowledgeContext, selectedMode]);

  const fillBlankSummary: FillInBlankSessionSummary | null = useMemo(() => {
    if (
      !isSessionComplete ||
      completedTasks.length === 0 ||
      !knowledgeContext ||
      selectedMode !== 'fill-in-the-blank'
    ) {
      return null;
    }

    const byTopicMap = new Map<string, { total: number; correct: number }>();
    knowledgeContext.topicIds.forEach((tId) => {
      byTopicMap.set(tId, { total: 0, correct: 0 });
    });

    let correctCount = 0;
    completedTasks.forEach((c) => {
      const isCorrect = 'isCorrect' in c ? c.isCorrect : false;
      if (isCorrect) correctCount++;
      const current = byTopicMap.get(c.task.topicId) ?? { total: 0, correct: 0 };
      byTopicMap.set(c.task.topicId, {
        total: current.total + 1,
        correct: current.correct + (isCorrect ? 1 : 0),
      });
    });

    const byTopic = knowledgeContext.topicIds.map((tId, idx) => {
      const stats = byTopicMap.get(tId) ?? { total: 0, correct: 0 };
      return {
        topicId: tId,
        topicName: knowledgeContext.topicNames[idx] || tId,
        total: stats.total,
        correct: stats.correct,
      };
    });

    return {
      totalTasks: completedTasks.length,
      correctCount,
      byTopic,
    };
  }, [isSessionComplete, completedTasks, knowledgeContext, selectedMode]);

  // Find referenced sources for the current task
  const referencedSources = useMemo(() => {
    if (!currentTask || !knowledgeContext) return [];
    return currentTask.sourceIds
      .map((id) => knowledgeContext.sources.find((s) => s.id === id))
      .filter((s): s is GroundedSource => Boolean(s));
  }, [currentTask, knowledgeContext]);

  const currentTopicName = useMemo(() => {
    if (!currentTask || !knowledgeContext) return '';
    const idx = knowledgeContext.topicIds.indexOf(currentTask.topicId);
    return idx !== -1 ? knowledgeContext.topicNames[idx] : '';
  }, [currentTask, knowledgeContext]);

  if (isAuthLoading || isLoadingTaxonomy) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-50/90 text-blue-600 border border-blue-100/80 rounded-lg flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
              Lernen
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Quellenbasierte Lernaufgaben auf Basis deiner Schulunterlagen und verifizierter Webinhalte.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50/80 border border-red-200/90 rounded-xl text-sm text-red-700 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-red-800">Hinweis</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Configuration Section (when no active task and session not finished) */}
      {!currentTask && !isGenerating && !isSessionComplete && (
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-6 shadow-2xs space-y-6">
          {/* Step 1: Select Subject */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span>1. Fach auswählen</span>
            </label>
            {subjects.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Noch keine Fächer angelegt.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSubject(s.id)}
                    className={cn(
                      'flex-grow sm:flex-initial min-w-[120px] text-center justify-center px-3.5 py-2 rounded-lg text-sm font-medium transition-[background-color,border-color,box-shadow,color,transform] duration-150 active:scale-[0.98] cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
                      selectedSubjectId === s.id
                        ? 'bg-blue-50 border-blue-300 text-blue-800 shadow-2xs font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Select Topics */}
          {selectedSubjectId && (
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-slate-400" />
                  <span>2. Themen auswählen (mindestens eins)</span>
                </label>
                {selectableTopics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = selectableTopics.every((t) =>
                        selectedTopicIds.includes(t.id),
                      );
                      if (allSelected) {
                        setSelectedTopicIds([]);
                      } else {
                        setSelectedTopicIds(selectableTopics.map((t) => t.id));
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer self-start sm:self-auto transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded px-1"
                  >
                    {selectableTopics.every((t) => selectedTopicIds.includes(t.id))
                      ? 'Auswahl aufheben'
                      : 'Alle mit Unterlagen auswählen'}
                  </button>
                )}
              </div>

              {availableTopics.length === 0 ? (
                <p className="text-sm text-slate-400 italic">
                  Diesem Fach sind noch keine Themen zugeordnet.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {availableTopics.map((t) => {
                      const stats = topicDocumentCounts.get(t.id);
                      const docCount = stats?.completed ?? 0;
                      const totalDocs = stats?.total ?? 0;
                      const isSelectable = docCount > 0;
                      const isSelected = selectedTopicIds.includes(t.id);

                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={!isSelectable}
                          onClick={() => toggleTopic(t.id)}
                          title={
                            !isSelectable
                              ? totalDocs > 0
                                ? 'Dokumente werden noch verarbeitet'
                                : 'Thema enthält keine Dokumente und kann nicht gelernt werden'
                              : undefined
                          }
                          className={cn(
                            'flex-grow sm:flex-initial min-w-[140px] justify-between sm:justify-start px-3 py-2 rounded-lg text-xs font-medium transition-[background-color,border-color,box-shadow,color,transform] duration-150 border flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 select-none',
                            !isSelectable &&
                              'opacity-45 bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed shadow-none',
                            isSelectable &&
                              isSelected &&
                              'bg-slate-900 border-slate-900 text-white shadow-2xs cursor-pointer active:scale-[0.98]',
                            isSelectable &&
                              !isSelected &&
                              'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer active:scale-[0.98]',
                          )}
                        >
                          <span className="truncate flex-1 min-w-0 text-left">{t.name}</span>
                          {isSelectable ? (
                            <span
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded font-normal shrink-0',
                                isSelected
                                  ? 'bg-slate-800 text-slate-300'
                                  : 'bg-slate-200/80 text-slate-600',
                              )}
                            >
                              {docCount} Dok.
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/60 text-slate-400 font-normal shrink-0">
                              {totalDocs > 0 ? 'Wird verarbeitet…' : '0 Dok.'}
                            </span>
                          )}
                          {isSelectable && isSelected && <span className="text-slate-300 shrink-0">✓</span>}
                        </button>
                      );
                    })}
                  </div>

                  {availableTopics.length > 0 && selectableTopics.length === 0 && (
                    <div className="p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-950">
                          Keine Themen mit Dokumenten vorhanden
                        </p>
                        <p className="text-amber-800 mt-0.5">
                          Für dieses Fach wurden noch keine fertigen Unterlagen hochgeladen. Bitte lade
                          zuerst Dokumente in deine Themen hoch, um ein Quiz erstellen zu können.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select Difficulty & Mode */}
          {selectedTopicIds.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4 text-slate-400" />
                  <span>3. Schwierigkeit</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['leicht', 'mittel', 'schwer'] as LearningDifficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={cn(
                        'flex-1 sm:flex-initial text-center justify-center px-3.5 py-1.5 rounded-lg text-xs font-medium capitalize border transition-[background-color,border-color,box-shadow,color,transform] duration-150 cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
                        difficulty === d
                          ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-slate-400" />
                  <span>4. Lernmodus</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('quiz')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.99] cursor-pointer flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
                      selectedMode === 'quiz'
                        ? 'border-blue-500 bg-blue-50/50 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <div>
                      <div className="font-semibold text-sm text-slate-900">Multiple-Choice Quiz</div>
                      <p className="text-xs text-slate-500 mt-1">
                        Verifizierte Fragen mit 4 Antwortoptionen und Quellennachweis.
                      </p>
                    </div>
                    {selectedMode === 'quiz' && (
                      <span className="text-[11px] font-semibold text-blue-600 mt-3 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ausgewählt
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMode('flashcards')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.99] cursor-pointer flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
                      selectedMode === 'flashcards'
                        ? 'border-blue-500 bg-blue-50/50 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <div>
                      <div className="font-semibold text-sm text-slate-900">Karteikarten</div>
                      <p className="text-xs text-slate-500 mt-1">
                        Kompakte Frage- und Antwortkarten aus denselben Quellen.
                      </p>
                    </div>
                    {selectedMode === 'flashcards' && (
                      <span className="text-[11px] font-semibold text-blue-600 mt-3 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ausgewählt
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMode('fill-in-the-blank')}
                    className={cn(
                      'p-3.5 rounded-xl border text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.99] cursor-pointer flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
                      selectedMode === 'fill-in-the-blank'
                        ? 'border-blue-500 bg-blue-50/50 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <div>
                      <div className="font-semibold text-sm text-slate-900">Lückentext</div>
                      <p className="text-xs text-slate-500 mt-1">
                        Wichtige Schlüsselbegriffe im Kontext ergänzen.
                      </p>
                    </div>
                    {selectedMode === 'fill-in-the-blank' && (
                      <span className="text-[11px] font-semibold text-blue-600 mt-3 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ausgewählt
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          {selectedTopicIds.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleStartSession}
                disabled={
                  isGenerating ||
                  selectedTopicIds.length === 0 ||
                  selectedTopicIds.some(
                    (tId) => (topicDocumentCounts.get(tId)?.completed ?? 0) === 0,
                  )
                }
                className="inline-flex items-center justify-center w-full sm:w-auto gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl shadow-xs transition-[background-color,transform] duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                <span>
                  Lernsession starten ({SESSION_QUESTION_LIMIT}{' '}
                  {selectedMode === 'flashcards' ? 'Karten' : 'Fragen'})
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading state during retrieval & generation */}
      {isGenerating && (
        <div className="bg-white border border-slate-200/90 rounded-xl p-6 sm:p-8 text-center space-y-3 shadow-2xs">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <h3 className="text-base font-semibold text-slate-900">
            Quellenbasiertes Lernen wird vorbereitet
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">{generationStep || 'Bitte warten…'}</p>
        </div>
      )}

      {/* Session Completed Summary Screen */}
      {isSessionComplete && (quizSummary || flashcardSummary || fillBlankSummary) && !isGenerating && (
        <div className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-8 shadow-2xs space-y-6">
          <div className="text-center space-y-2">
            <div className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2',
              selectedMode === 'flashcards'
                ? 'bg-blue-50/90 text-blue-600 border border-blue-100/80'
                : 'bg-amber-50/90 text-amber-600 border border-amber-100/80',
            )}>
              {selectedMode === 'flashcards' ? (
                <Sparkles className="w-6 h-6" />
              ) : (
                <Trophy className="w-6 h-6" />
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              {selectedMode === 'flashcards'
                ? 'Karteikarten-Session abgeschlossen!'
                : selectedMode === 'fill-in-the-blank'
                  ? 'Lückentext-Session abgeschlossen!'
                  : 'Quiz abgeschlossen!'}
            </h2>
            <p className="text-sm text-slate-500">
              {selectedMode === 'flashcards'
                ? `Du hast alle ${completedTasks.length} Karteikarten durchgearbeitet.`
                : selectedMode === 'fill-in-the-blank'
                  ? `Du hast ${fillBlankSummary?.correctCount ?? 0} von ${fillBlankSummary?.totalTasks ?? 0} Lücken richtig ergänzt.`
                  : `Du hast ${quizSummary?.correctCount ?? 0} von ${quizSummary?.totalQuestions ?? 0} Fragen richtig beantwortet.`}
            </p>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {selectedMode === 'flashcards' ? 'Bearbeitete Themen' : 'Ergebnis nach Themen'}
            </h3>
            <div className="space-y-2">
              {selectedMode === 'flashcards' && flashcardSummary
                ? flashcardSummary.byTopic.map((item) => (
                    <div
                      key={item.topicId}
                      className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200/70 text-sm gap-2"
                    >
                      <span className="font-medium text-slate-800 truncate">{item.topicName}</span>
                      <span className="text-xs font-semibold text-slate-600 shrink-0">
                        {item.total} {item.total === 1 ? 'Karte' : 'Karten'}
                      </span>
                    </div>
                  ))
                : (fillBlankSummary || quizSummary)?.byTopic.map((item) => (
                    <div
                      key={item.topicId}
                      className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200/70 text-sm gap-2"
                    >
                      <span className="font-medium text-slate-800 truncate">{item.topicName}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-slate-600">
                          {item.correct} / {item.total} richtig
                        </span>
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded font-medium',
                            item.total > 0 && item.correct === item.total
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.correct > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800',
                          )}
                        >
                          {item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={handleStartSession}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg shadow-xs transition-[background-color,transform] duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Erneut spielen</span>
            </button>
            <button
              onClick={resetSession}
              className="px-4 py-2 bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-[background-color,border-color,transform] duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              Andere Themen wählen
            </button>
          </div>
        </div>
      )}

      {/* Active Task UI (Quiz or Flashcard) */}
      {currentTask && !isGenerating && !isSessionComplete && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {selectedMode === 'flashcards'
                    ? 'Karte'
                    : selectedMode === 'fill-in-the-blank'
                      ? 'Aufgabe'
                      : 'Frage'}{' '}
                  {currentQuestionNumber} von {SESSION_QUESTION_LIMIT}
                </span>
                {currentTopicName && (
                  <span className="text-[11px] font-medium bg-slate-100/80 text-slate-700 px-2 py-0.5 rounded border border-slate-200/60 truncate max-w-[160px] sm:max-w-none">
                    {currentTopicName}
                  </span>
                )}
                {currentTask.difficulty && (
                  <span className="text-[11px] font-medium bg-blue-50/80 text-blue-700 px-2 py-0.5 rounded border border-blue-100/60 capitalize">
                    {currentTask.difficulty}
                  </span>
                )}
              </div>
              <button
                onClick={resetSession}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded px-1"
              >
                Session beenden
              </button>
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${(currentQuestionNumber / SESSION_QUESTION_LIMIT) * 100}%` }}
              />
            </div>
          </div>

          {/* Quiz Task View */}
          {selectedMode === 'quiz' && 'options' in currentTask && (
            <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-6 shadow-2xs space-y-6">
              {/* Question */}
              <div className="space-y-2">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
                  {currentTask.question}
                </h2>
              </div>

              {/* Multiple Choice Options */}
              <div className="space-y-2.5">
                {currentTask.options.map((option, idx) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrect = option === currentTask.correctAnswer;

                  let optionStyle = 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50';

                  if (isAnswerRevealed) {
                    if (isCorrect) {
                      optionStyle =
                        'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-medium';
                    } else if (isSelected && !isCorrect) {
                      optionStyle = 'border-red-500 bg-red-50/80 text-red-950';
                    } else {
                      optionStyle = 'border-slate-200 bg-slate-50/50 text-slate-400 opacity-60';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isAnswerRevealed}
                      onClick={() => handleSelectAnswerOption(option)}
                      className={cn(
                        'w-full p-3.5 sm:p-4 rounded-xl border text-left text-sm transition-[background-color,border-color,box-shadow,color,transform] duration-150 flex items-center justify-between gap-2.5 select-none',
                        optionStyle,
                        !isAnswerRevealed ? 'cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40' : 'cursor-default',
                      )}
                    >
                      <span className="min-w-0 flex-1 break-words">{option}</span>
                      {isAnswerRevealed && isCorrect && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 ml-2" />
                      )}
                      {isAnswerRevealed && isSelected && !isCorrect && (
                        <XCircle className="w-5 h-5 text-red-600 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explanation & Evidence after answering */}
              {isAnswerRevealed && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      <span>Erklärung</span>
                    </div>
                    <p className="text-sm text-slate-800 leading-relaxed">
                      {currentTask.explanation}
                    </p>
                    {currentTask.evidence && (
                      <div className="pt-2 border-t border-slate-200/60 text-xs text-slate-600 italic">
                        „{currentTask.evidence}“
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleNextTask}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg shadow-xs transition-[background-color,transform] duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                      <span>
                        {completedTasks.length >= SESSION_QUESTION_LIMIT
                          ? 'Ergebnis ansehen'
                          : 'Nächste Frage'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Flashcard Task View with 3D Flip & Layout Stability */}
          {selectedMode === 'flashcards' && currentTask.mode === 'flashcards' && (
            <div className="w-full max-w-2xl mx-auto">
              <div className="relative w-full min-h-[380px] h-[380px] sm:h-[420px] perspective-1000">
                <div
                  className={cn(
                    'relative w-full h-full preserve-3d transition-transform duration-350 ease-out',
                    isAnswerRevealed && 'rotate-y-180',
                  )}
                >
                  {/* Front Card Face (Question) */}
                  <div className="absolute inset-0 w-full h-full backface-hidden bg-white border border-slate-200/90 rounded-2xl shadow-sm p-4 sm:p-8 flex flex-col justify-between select-none">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Vorderseite · Frage
                      </span>
                      <span className="text-xs text-slate-400">
                        Klicken zum Umdrehen
                      </span>
                    </div>

                    <div
                      onClick={handleFlipFlashcard}
                      className="flex-1 flex items-center justify-center text-center px-2 sm:px-6 cursor-pointer overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-lg"
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleFlipFlashcard();
                        }
                      }}
                    >
                      <h2 className="text-lg sm:text-2xl font-semibold text-slate-900 leading-snug">
                        {currentTask.question}
                      </h2>
                    </div>

                    <div className="pt-4 flex justify-center shrink-0 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleFlipFlashcard}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-[background-color,transform] duration-150 cursor-pointer border border-slate-200/80 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      >
                        <RotateCcw className="w-4 h-4 text-slate-600" />
                        <span>Karte umdrehen</span>
                      </button>
                    </div>
                  </div>

                  {/* Back Card Face (Answer + Evidence) */}
                  <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bg-white border border-slate-200/90 rounded-2xl shadow-sm p-4 sm:p-8 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Rückseite · Antwort
                      </span>
                      <button
                        type="button"
                        onClick={handleFlipFlashcard}
                        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded px-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Zurück</span>
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
                      {isAnswerRevealed && (
                        <>
                          <div>
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                              Frage
                            </div>
                            <p className="text-xs sm:text-sm font-medium text-slate-700 bg-slate-50/90 p-3 rounded-xl border border-slate-200/70">
                              {currentTask.question}
                            </p>
                          </div>

                          <div>
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                              Antwort
                            </div>
                            <p className="text-sm sm:text-lg font-semibold text-slate-900 leading-relaxed">
                              {currentTask.answer}
                            </p>
                          </div>

                          {currentTask.evidence && (
                            <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100 text-xs text-slate-600 italic">
                              <span className="font-semibold not-italic text-slate-700 block mb-1">
                                Beleg aus den Quellen:
                              </span>
                              „{currentTask.evidence}“
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={handleFlipFlashcard}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-medium transition-[background-color,transform] duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Vorderseite</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleNextTask}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg shadow-xs transition-[background-color,transform] duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      >
                        <span>
                          {completedTasks.length >= SESSION_QUESTION_LIMIT
                            ? 'Ergebnis ansehen'
                            : 'Nächste Karte'}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lückentext (Fill-in-the-blank) Task View */}
          {selectedMode === 'fill-in-the-blank' && currentTask.mode === 'fill-in-the-blank' && (
            <div className="w-full max-w-2xl mx-auto bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Lückentext · Vervollständige den Satz
                </span>
                <span className="text-xs text-slate-400">
                  {isAnswerRevealed ? '✓ Überprüft' : 'Schlüsselbegriff gesucht'}
                </span>
              </div>

              {/* Sentence Display with Blank */}
              <div className="space-y-4">
                <div className="p-4 sm:p-5 bg-slate-50/80 rounded-xl border border-slate-200/70 leading-relaxed text-sm sm:text-lg text-slate-800 break-words">
                  {(() => {
                    const parts = currentTask.sentenceWithBlank.split(BLANK_MARKER);
                    if (parts.length < 2) {
                      return <span>{currentTask.sentenceWithBlank}</span>;
                    }
                    return (
                      <span>
                        {parts[0]}
                        {!isAnswerRevealed ? (
                          <span className="inline-block border-b-2 border-blue-500 min-w-[80px] sm:min-w-[100px] text-center font-semibold text-blue-600 px-2 py-0.5 mx-1 bg-blue-50/60 rounded">
                            {fillBlankInput.trim() ? fillBlankInput : '_____'}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'inline-block px-2.5 py-0.5 mx-1 font-bold rounded border',
                              fillBlankResult?.isCorrect
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                : 'bg-red-50 text-red-700 border-red-300 line-through',
                            )}
                          >
                            {fillBlankInput || '—'}
                          </span>
                        )}
                        {parts[1]}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Input Form (Before Answer Reveal) */}
              {!isAnswerRevealed ? (
                <form onSubmit={handleSubmitFillInBlank} className="space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={fillBlankInput}
                      onChange={(e) => setFillBlankInput(e.target.value)}
                      placeholder="Gesuchten Begriff eingeben…"
                      autoFocus
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium bg-white text-slate-900 shadow-2xs transition-[border-color,box-shadow] duration-150"
                    />
                    <button
                      type="submit"
                      disabled={!fillBlankInput.trim()}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl shadow-xs transition-[background-color,transform] duration-150 active:scale-95 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                      Prüfen
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    Tipp: Drücke Enter zum schnellen Überprüfen deiner Antwort.
                  </p>
                </form>
              ) : (
                /* Feedback & Evidence (After Answer Reveal) */
                <div className="space-y-5 pt-2 border-t border-slate-100">
                  <div
                    className={cn(
                      'p-4 rounded-xl border flex items-start gap-3',
                      fillBlankResult?.isCorrect
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                        : 'bg-red-50/70 border-red-200 text-red-900',
                    )}
                  >
                    {fillBlankResult?.isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">
                        {fillBlankResult?.isCorrect ? 'Richtig!' : 'Nicht ganz'}
                      </p>
                      {!fillBlankResult?.isCorrect && (
                        <p className="text-xs text-slate-700">
                          Richtige Antwort:{' '}
                          <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {currentTask.answer}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {currentTask.evidence && (
                    <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-100 text-xs text-slate-600 italic">
                      <span className="font-semibold not-italic text-slate-700 block mb-1">
                        Beleg aus den Quellen:
                      </span>
                      „{currentTask.evidence}“
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleNextTask}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-xl shadow-xs transition-[background-color,transform] duration-150 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                      <span>
                        {completedTasks.length >= SESSION_QUESTION_LIMIT
                          ? 'Ergebnis ansehen'
                          : 'Nächste Aufgabe'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sources Grounding Block (Mandatory) */}
          <div className={cn(
            'bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs space-y-3',
            (selectedMode === 'flashcards' || selectedMode === 'fill-in-the-blank') && 'max-w-2xl mx-auto w-full',
          )}>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Verifizierte Quellen dieser Aufgabe</span>
            </h3>

            {referencedSources.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Keine Quellennachweise gefunden.</p>
            ) : (
              <div className="space-y-2">
                {referencedSources.map((src) => {
                  if (src.type === 'document') {
                    return (
                      <div
                        key={src.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-slate-50/80 border border-slate-200/80 text-xs gap-1.5 sm:gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                          <span className="font-medium text-slate-800 truncate">
                            {src.documentName || src.title}
                          </span>
                          {src.pageNumber && (
                            <span className="text-slate-500 text-[11px] shrink-0">
                              · Seite {src.pageNumber}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded shrink-0 self-start sm:self-auto">
                          Meine Unterlagen
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={src.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-slate-50/80 border border-slate-200/80 text-xs gap-1.5 sm:gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">
                          {src.title}
                        </span>
                        {src.domain && (
                          <span className="text-slate-500 text-[11px] shrink-0">
                            · {src.domain}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        {src.url && (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 underline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded"
                          >
                            <span>Öffnen</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
                          Aktuelle Webquelle
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
