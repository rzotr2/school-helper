import React, { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Subject } from '../../application/use-cases/subjects';
import { Topic } from '../../application/use-cases/topics';
import { Document } from '../../application/use-cases/documents';

interface MoveDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: Document | null;
  currentTopicId: string;
  subjects: Subject[];
  topics: Topic[];
  onMove: (targetTopicId: string) => Promise<void>;
}

export function MoveDocumentDialog({
  isOpen,
  onClose,
  document,
  currentTopicId,
  subjects,
  topics,
  onMove,
}: MoveDocumentDialogProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find current topic and subject name
  const currentTopic = topics.find(t => t.id === currentTopicId);
  const currentSubject = currentTopic ? subjects.find(s => s.id === currentTopic.subjectId) : null;
  const currentTopicDisplay = currentTopic
    ? `${currentSubject ? `${currentSubject.name} · ` : ''}${currentTopic.name}`
    : 'Unbekannt';

  useEffect(() => {
    if (isOpen) {
      setSelectedTopicId('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId || selectedTopicId === currentTopicId) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onMove(selectedTopicId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message || 'Fehler beim Verschieben des Dokuments.' : 'Fehler beim Verschieben des Dokuments.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const otherTopicsCount = topics.filter(t => t.id !== currentTopicId).length;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Dokument verschieben">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {document && (
          <div className="text-sm">
            <span className="text-slate-500 block text-xs mb-0.5">Dokument</span>
            <p className="font-medium text-slate-800 truncate">{document.originalName}</p>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
          <span className="text-slate-500 text-xs block mb-0.5">Aktuelles Thema</span>
          <p className="font-medium text-slate-900">{currentTopicDisplay}</p>
        </div>

        <div>
          <label htmlFor="target-topic-select" className="block text-sm font-medium text-slate-700 mb-1">
            Neues Thema auswählen
          </label>
          <select
            id="target-topic-select"
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
            disabled={isSubmitting || otherTopicsCount === 0}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-slate-900 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">-- Thema auswählen --</option>
            {subjects.map(subject => {
              const subjectTopics = topics.filter(t => t.subjectId === subject.id);
              if (subjectTopics.length === 0) return null;
              return (
                <optgroup key={subject.id} label={subject.name}>
                  {subjectTopics.map(t => (
                    <option key={t.id} value={t.id} disabled={t.id === currentTopicId}>
                      {t.name} {t.id === currentTopicId ? '(Aktuell)' : ''}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {otherTopicsCount === 0 && (
            <p className="text-xs text-slate-500 mt-1">
              Es sind keine weiteren Themen zum Verschieben vorhanden.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 mt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !selectedTopicId || selectedTopicId === currentTopicId}
          >
            {isSubmitting ? 'Wird verschoben...' : 'Verschieben'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
