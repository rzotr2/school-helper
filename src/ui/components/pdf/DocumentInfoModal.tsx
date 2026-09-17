import React, { useEffect, useRef } from 'react';
import { X, Sparkles, Loader2, BookOpen, Tag, Calendar, FileText } from 'lucide-react';
import type { DocumentUnderstanding } from '../../../application/use-cases/documentUnderstanding';
import { DOCUMENT_TYPE_LABELS } from '../../../application/use-cases/documentUnderstanding';
import type { DocumentContent } from '../../../application/use-cases/documentContent';
import { DocumentStructure } from './DocumentStructure';
import { Button } from '../Button';
import { formatDate } from '../../../shared/utils/format';

export interface DocumentInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  documentId?: string;
  content?: DocumentContent | null;
  isLoadingContent?: boolean;
  onNavigateToPage?: (pageNumber: number) => void;
  understanding: DocumentUnderstanding | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
}

export function DocumentInfoModal({
  isOpen,
  onClose,
  documentName,
  documentId,
  content,
  isLoadingContent = false,
  onNavigateToPage,
  understanding,
  isAnalyzing,
  onAnalyze,
}: DocumentInfoModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        className="w-full max-w-xl bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-info-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="document-info-title" className="text-base font-semibold text-slate-900 truncate">
                Dokument-Übersicht
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

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {understanding ? (
            <>
              {/* Type and Subject badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                  {DOCUMENT_TYPE_LABELS[understanding.documentType] ?? 'Dokument'}
                </span>
                {understanding.subject && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    Fach: {understanding.subject}
                  </span>
                )}
              </div>

              {/* Title */}
              {understanding.title && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Titel / Thema
                  </h4>
                  <p className="text-sm font-medium text-slate-900">{understanding.title}</p>
                </div>
              )}

              {/* Summary */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Kurzbeschreibung
                </h4>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  {understanding.summary}
                </div>
              </div>

              {/* Key Topics */}
              {understanding.keyTopics && understanding.keyTopics.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    Schlüsselbegriffe
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {understanding.keyTopics.map((topic, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs bg-white text-slate-700 border border-slate-200 rounded-md shadow-2xs"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Analyzed At */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Analysiert am {formatDate(new Date(understanding.analyzedAt))}
                </span>
                <button
                  type="button"
                  disabled={isAnalyzing}
                  onClick={onAnalyze}
                  className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer disabled:opacity-50 text-xs"
                >
                  {isAnalyzing ? 'Wird aktualisiert…' : 'Analyse aktualisieren'}
                </button>
              </div>
            </>
          ) : (
            <div className="py-8 text-center space-y-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="max-w-xs mx-auto">
                <h4 className="text-sm font-medium text-slate-900 mb-1">
                  Noch keine Analyse vorhanden
                </h4>
                <p className="text-xs text-slate-500">
                  Lass das Dokument semantisch analysieren, um Titel, Typ, Fach, Kurzbeschreibung und
                  wichtige Schlüsselbegriffe zu erfassen.
                </p>
              </div>
              <div className="pt-2">
                <Button
                  variant="primary"
                  onClick={onAnalyze}
                  disabled={isAnalyzing}
                  className="gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analysiere Dokument…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Dokument analysieren
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Document Structure Layer */}
          <div className="pt-3 border-t border-slate-200/80">
            <DocumentStructure
              content={content}
              documentId={documentId}
              onNavigateToPage={onNavigateToPage}
              isLoading={isLoadingContent}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </div>
    </div>
  );
}
