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
  RefreshCw,
  FileText,
  Globe,
} from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { Subject, getSubjects } from '../../application/use-cases/subjects';
import { Topic, getAllTopics } from '../../application/use-cases/topics';
import { retrieveTopicDocuments } from '../../application/use-cases/learning/documentRetrieval';
import { retrieveWebSources } from '../../application/use-cases/learning/webRetrieval';
import { generateQuizTask } from '../../application/use-cases/learning/learnGenerator';
import type {
  GroundedKnowledgeContext,
  GroundedSource,
  LearningMode,
  QuizTask,
} from '../../application/use-cases/learning/learningTypes';
import { cn } from '../../shared/utils/cn';

export function LearnPage() {
  const { user, isLoading: isAuthLoading } = useAuth();

  // Step 1: Subjects & Topics selection
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoadingTaxonomy, setIsLoadingTaxonomy] = useState(true);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<LearningMode>('quiz');

  // Step 2: Generation and Active Session State
  const [knowledgeContext, setKnowledgeContext] = useState<GroundedKnowledgeContext | null>(null);
  const [currentTask, setCurrentTask] = useState<QuizTask | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Interaction State for Quiz
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);

  useEffect(() => {
    async function loadTaxonomy() {
      if (!user || isAuthLoading) return;
      try {
        setIsLoadingTaxonomy(true);
        const [loadedSubjects, loadedTopics] = await Promise.all([
          getSubjects(user.id),
          getAllTopics(user.id),
        ]);
        setSubjects(loadedSubjects);
        setTopics(loadedTopics);

        if (loadedSubjects.length > 0) {
          setSelectedSubjectId(loadedSubjects[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden der Fächer');
      } finally {
        setIsLoadingTaxonomy(false);
      }
    }
    loadData();
    async function loadData() {
      await loadTaxonomy();
    }
  }, [user, isAuthLoading]);

  // Topics belonging to the selected subject
  const availableTopics = useMemo(() => {
    if (!selectedSubjectId) return [];
    return topics.filter((t) => t.subjectId === selectedSubjectId);
  }, [topics, selectedSubjectId]);

  // Handle subject change: reset selected topics
  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedTopicIds([]);
    setKnowledgeContext(null);
    setCurrentTask(null);
    setError(null);
  };

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId],
    );
  };

  const handleStartSession = async () => {
    if (!user || selectedTopicIds.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setSelectedAnswer(null);
    setIsAnswerRevealed(false);

    try {
      const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
      const selectedTopicsList = topics.filter((t) => selectedTopicIds.includes(t.id));

      // 1. Retrieve user documents
      setGenerationStep('Lade Dokumente aus deinen Themen…');
      const docSources = await retrieveTopicDocuments(user.id, selectedTopicIds);

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

      // 3. Generate grounded Quiz task
      setGenerationStep('Erstelle quellenbasierte Quiz-Aufgabe…');
      const task = await generateQuizTask(context);
      setCurrentTask(task);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Lernsession');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handleNextTask = async () => {
    if (!knowledgeContext) return;
    setIsGenerating(true);
    setError(null);
    setSelectedAnswer(null);
    setIsAnswerRevealed(false);
    setGenerationStep('Generiere nächste Aufgabe auf Basis der Quellen…');

    try {
      const task = await generateQuizTask(knowledgeContext);
      setCurrentTask(task);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der nächsten Aufgabe');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handleSelectAnswerOption = (option: string) => {
    if (isAnswerRevealed) return;
    setSelectedAnswer(option);
    setIsAnswerRevealed(true);
  };

  // Find referenced sources for the current task
  const referencedSources = useMemo(() => {
    if (!currentTask || !knowledgeContext) return [];
    return currentTask.sourceIds
      .map((id) => knowledgeContext.sources.find((s) => s.id === id))
      .filter((s): s is GroundedSource => Boolean(s));
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-600" />
            <span>Lernen</span>
          </h1>
          <p className="text-sm text-slate-500">
            Quellenbasierte Lernaufgaben auf Basis deiner Schulunterlagen und verifizierter Webinhalte.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-red-800">Hinweis</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Configuration Section (when no active task or when changing) */}
      {!currentTask && !isGenerating && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
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
                      'px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer border',
                      selectedSubjectId === s.id
                        ? 'bg-blue-50 border-blue-300 text-blue-800 shadow-2xs'
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
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-slate-400" />
                  <span>2. Themen auswählen (mindestens eins)</span>
                </label>
                {availableTopics.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedTopicIds.length === availableTopics.length) {
                        setSelectedTopicIds([]);
                      } else {
                        setSelectedTopicIds(availableTopics.map((t) => t.id));
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                  >
                    {selectedTopicIds.length === availableTopics.length
                      ? 'Auswahl aufheben'
                      : 'Alle auswählen'}
                  </button>
                )}
              </div>

              {availableTopics.length === 0 ? (
                <p className="text-sm text-slate-400 italic">
                  Diesem Fach sind noch keine Themen zugeordnet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableTopics.map((t) => {
                    const isSelected = selectedTopicIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTopic(t.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border flex items-center gap-1.5',
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
                        )}
                      >
                        <span>{t.name}</span>
                        {isSelected && <span className="text-slate-300">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select Learning Mode */}
          {selectedTopicIds.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-slate-400" />
                <span>3. Lernmodus</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setSelectedMode('quiz')}
                  className={cn(
                    'p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between',
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
                  <span className="text-[11px] font-semibold text-blue-600 mt-3 inline-block">
                    Aktiv (MVP)
                  </span>
                </button>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 opacity-60 text-left flex flex-col justify-between">
                  <div>
                    <div className="font-medium text-sm text-slate-700">Karteikarten</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Kompakte Frage- und Antwortkarten aus denselben Quellen.
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 mt-3 inline-block">
                    Demnächst
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 opacity-60 text-left flex flex-col justify-between">
                  <div>
                    <div className="font-medium text-sm text-slate-700">Lückentext</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Wichtige Schlüsselbegriffe im Kontext ergänzen.
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 mt-3 inline-block">
                    Demnächst
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          {selectedTopicIds.length > 0 && (
            <div className="pt-2">
              <button
                onClick={handleStartSession}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <span>Lernsession starten</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading state during retrieval & generation */}
      {isGenerating && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <h3 className="text-base font-semibold text-slate-900">Quellenbasiertes Lernen wird vorbereitet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">{generationStep || 'Bitte warten…'}</p>
        </div>
      )}

      {/* Active Quiz Task UI */}
      {currentTask && !isGenerating && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Aufgabe · {knowledgeContext?.subjectName}
            </span>
            <button
              onClick={() => {
                setCurrentTask(null);
                setKnowledgeContext(null);
              }}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Themen ändern
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
            {/* Question */}
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900 leading-snug">
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
                    optionStyle = 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-medium';
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
                      'w-full p-4 rounded-xl border text-left text-sm transition-all cursor-pointer flex items-center justify-between',
                      optionStyle,
                      isAnswerRevealed && 'cursor-default',
                    )}
                  >
                    <span>{option}</span>
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
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    <span>Nächste Frage</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sources Grounding Block (Mandatory) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
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
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
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
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded shrink-0">
                          Meine Unterlagen
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={src.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
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
                      <div className="flex items-center gap-2 shrink-0">
                        {src.url && (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 underline"
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
