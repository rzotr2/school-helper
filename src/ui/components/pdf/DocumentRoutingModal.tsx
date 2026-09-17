import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Folder, Tag, Plus, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { Subject } from '../../../application/use-cases/subjects';
import { Topic } from '../../../application/use-cases/topics';
import type { DocumentRoutingRecommendation } from '../../../application/use-cases/documentRouting';
import { Button } from '../Button';

export interface DocumentRoutingModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  subjects: Subject[];
  topics: Topic[];
  recommendation: DocumentRoutingRecommendation | null;
  isLoadingRecommendation: boolean;
  onConfirm: (destination: { topicId: string } | { createTopicName: string; subjectId: string }) => Promise<void>;
}

export function DocumentRoutingModal({
  isOpen,
  onClose,
  documentName,
  subjects,
  topics,
  recommendation,
  isLoadingRecommendation,
  onConfirm,
}: DocumentRoutingModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [isCreatingNewTopic, setIsCreatingNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Sync recommendation once loaded
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsCreatingNewTopic(false);
    setNewTopicName('');

    if (recommendation?.subjectId) {
      setSelectedSubjectId(recommendation.subjectId);

      const topRecTopicId = recommendation.topicRecommendations[0]?.topicId;
      if (topRecTopicId) {
        setSelectedTopicId(topRecTopicId);
      } else if (recommendation.newTopicSuggestion) {
        setIsCreatingNewTopic(true);
        setNewTopicName(recommendation.newTopicSuggestion.name);
        setSelectedTopicId('');
      } else {
        setSelectedTopicId('');
      }
    } else {
      // Fallback: pick first subject if available
      if (subjects.length > 0) {
        setSelectedSubjectId(subjects[0].id);
        const subjectTopics = topics.filter((t) => t.subjectId === subjects[0].id);
        setSelectedTopicId(subjectTopics[0]?.id ?? '');
      } else {
        setSelectedSubjectId('');
        setSelectedTopicId('');
      }
    }
  }, [isOpen, recommendation, subjects, topics]);

  // When selectedSubjectId changes manually
  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setIsCreatingNewTopic(false);
    setNewTopicName('');
    const available = topics.filter((t) => t.subjectId === subjectId);
    setSelectedTopicId(available[0]?.id ?? '');
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) {
      setError('Bitte wähle ein Fach aus.');
      return;
    }

    if (isCreatingNewTopic) {
      const trimmed = newTopicName.trim();
      if (!trimmed) {
        setError('Bitte gib einen Namen für das neue Thema ein.');
        return;
      }
      setIsSubmitting(true);
      setError(null);
      try {
        await onConfirm({ createTopicName: trimmed, subjectId: selectedSubjectId });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Erstellen des Themas');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!selectedTopicId) {
        setError('Bitte wähle ein Thema aus.');
        return;
      }
      setIsSubmitting(true);
      setError(null);
      try {
        await onConfirm({ topicId: selectedTopicId });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Zuordnen');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!isOpen) return null;

  const currentSubjectTopics = topics.filter((t) => t.subjectId === selectedSubjectId);
  const matchedRecTopic = recommendation?.topicRecommendations.find((r) => r.topicId === selectedTopicId);

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="routing-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="routing-modal-title" className="text-base font-semibold text-slate-900 truncate">
                Dokument zuordnen
              </h3>
              <p className="text-xs text-slate-500 truncate">{documentName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {isLoadingRecommendation ? (
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center gap-3 text-xs text-blue-700">
              <Loader2 className="w-4 h-4 animate-spin shrink-0 text-blue-600" />
              <span>Analysiere Dokument und suche passende Themen…</span>
            </div>
          ) : recommendation?.subjectId ? (
            <div className="p-3.5 bg-blue-50/40 border border-blue-200/70 rounded-lg space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>KI-Vorschlag</span>
              </div>
              {matchedRecTopic?.reason && (
                <p className="text-xs text-slate-600 italic">
                  „{matchedRecTopic.reason}“
                </p>
              )}
              {recommendation.topicRecommendations.length > 1 && (
                <div className="pt-1">
                  <span className="text-[11px] font-medium text-slate-500 block mb-1">
                    Weitere passende Themen:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {recommendation.topicRecommendations.map((rec) => {
                      const t = topics.find((item) => item.id === rec.topicId);
                      if (!t) return null;
                      const isSelected = selectedTopicId === rec.topicId && !isCreatingNewTopic;
                      return (
                        <button
                          key={rec.topicId}
                          type="button"
                          onClick={() => {
                            setIsCreatingNewTopic(false);
                            setSelectedTopicId(rec.topicId);
                          }}
                          className={`px-2 py-0.5 text-xs rounded-md border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-lg text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium">Kein eindeutiger Vorschlag</p>
                <p className="text-slate-600 mt-0.5">
                  Bitte wähle Fach und Thema für dieses Dokument manuell aus.
                </p>
              </div>
            </div>
          )}

          {/* Subject Selection */}
          <div>
            <label htmlFor="routing-subject-select" className="block text-xs font-medium text-slate-700 mb-1">
              Fach
            </label>
            <select
              id="routing-subject-select"
              value={selectedSubjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Topic Selection or New Topic Mode */}
          {!isCreatingNewTopic ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="routing-topic-select" className="block text-xs font-medium text-slate-700">
                  Thema
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingNewTopic(true);
                    setNewTopicName(recommendation?.newTopicSuggestion?.name ?? '');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Neues Thema erstellen
                </button>
              </div>
              <select
                id="routing-topic-select"
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
                disabled={currentSubjectTopics.length === 0}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
              >
                {currentSubjectTopics.length === 0 ? (
                  <option value="">Keine Themen in diesem Fach vorhanden</option>
                ) : (
                  currentSubjectTopics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Neues Thema anlegen</span>
                <button
                  type="button"
                  onClick={() => setIsCreatingNewTopic(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Bestehendes Thema wählen
                </button>
              </div>
              <input
                type="text"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                placeholder="z.B. IT-Sicherheit"
                maxLength={100}
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {recommendation?.newTopicSuggestion?.reason && (
                <p className="text-[11px] text-slate-500">
                  KI-Hinweis: {recommendation.newTopicSuggestion.reason}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || (!selectedTopicId && !isCreatingNewTopic)}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Wird zugewiesen…
                </>
              ) : (
                'Übernehmen'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
