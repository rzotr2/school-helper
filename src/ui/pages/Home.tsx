import React, { useEffect, useState, useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { FileText, Loader2, ExternalLink, Trash2, Search, AlertCircle, X, Edit2, FolderInput } from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { Document, getAllDocuments, deleteDocument, getDocumentDownloadUrl, renameDocument, moveDocument } from '../../application/use-cases/documents';
import { Subject, getSubjects } from '../../application/use-cases/subjects';
import { Topic, getAllTopics } from '../../application/use-cases/topics';
import { NameDialog } from '../components/NameDialog';
import { MoveDocumentDialog } from '../components/MoveDocumentDialog';

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 });
    return `${kb} KB`;
  }
  const mb = (bytes / (1024 * 1024)).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${mb} MB`;
}

function formatDate(val: Timestamp | Date | null | undefined): string {
  if (!val) return 'Unbekanntes Datum';
  if ('toDate' in val && typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
  if (val instanceof Date) {
    return val.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
  return 'Unbekanntes Datum';
}

export function Home() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [renamingDoc, setRenamingDoc] = useState<Document | null>(null);
  const [movingDoc, setMovingDoc] = useState<Document | null>(null);

  // Filters
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = async () => {
    if (!user || isAuthLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const [loadedSubjects, loadedTopics, loadedDocs] = await Promise.all([
        getSubjects(user.uid),
        getAllTopics(user.uid),
        getAllDocuments(user.uid)
      ]);
      setSubjects(loadedSubjects);
      setTopics(loadedTopics);
      setDocuments(loadedDocs);
    } catch (err) {
      console.error('Failed to load library data', err);
      setError('Fehler beim Laden der Dokumentenbibliothek. Bitte versuche es später erneut.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      loadData();
    }
  }, [user, isAuthLoading]);

  // Lookup maps for O(1) in-memory resolution
  const subjectsMap = useMemo(() => {
    const map = new Map<string, Subject>();
    subjects.forEach(s => map.set(s.id, s));
    return map;
  }, [subjects]);

  const topicsMap = useMemo(() => {
    const map = new Map<string, Topic>();
    topics.forEach(t => map.set(t.id, t));
    return map;
  }, [topics]);

  // Filter topics for the topic dropdown based on selected subject
  const availableTopics = useMemo(() => {
    if (selectedSubjectId === 'all') return topics;
    return topics.filter(t => t.subjectId === selectedSubjectId);
  }, [topics, selectedSubjectId]);

  // Filter documents in memory
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const topic = topicsMap.get(doc.topicId);
      const subjectId = topic?.subjectId;

      if (selectedSubjectId !== 'all' && subjectId !== selectedSubjectId) {
        return false;
      }

      if (selectedTopicId !== 'all' && doc.topicId !== selectedTopicId) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        if (!doc.originalName.toLowerCase().includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [documents, topicsMap, selectedSubjectId, selectedTopicId, searchQuery]);

  const handleOpenDocument = async (docId: string) => {
    if (!user) return;
    setActionError(null);
    try {
      const url = await getDocumentDownloadUrl(user.uid, docId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open document', err);
      setActionError('Dokument konnte nicht geöffnet werden.');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!user) return;
    setActionError(null);
    setDeletingDocId(docId);
    try {
      await deleteDocument(user.uid, docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      console.error('Failed to delete document', err);
      setActionError('Fehler beim Löschen des Dokuments. Bitte versuche es erneut.');
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleRenameDocument = async (newName: string) => {
    if (!user || !renamingDoc) return;
    setActionError(null);
    const updated = await renameDocument(user.uid, renamingDoc.id, newName);
    setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
    setRenamingDoc(null);
  };

  const handleMoveDocument = async (targetTopicId: string) => {
    if (!user || !movingDoc) return;
    setActionError(null);
    const updated = await moveDocument(user.uid, movingDoc.id, targetTopicId);
    setDocuments(prev => prev.map(d => d.id === updated.id ? { ...d, topicId: updated.topicId } : d));
    setMovingDoc(null);
  };

  const handleResetFilters = () => {
    setSelectedSubjectId('all');
    setSelectedTopicId('all');
    setSearchQuery('');
  };

  if (isAuthLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-red-50/50">
        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
        <h3 className="text-base font-medium text-red-900 mb-1">Ein Fehler ist aufgetreten</h3>
        <p className="text-sm text-red-700 max-w-md mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold text-slate-900">Alle Dateien</h1>
        <p className="text-sm text-slate-500">
          Übersicht aller hochgeladenen PDF-Unterlagen aus deinen Fächern und Themen.
        </p>
      </div>

      {actionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-500 hover:text-red-700 transition-colors cursor-pointer"
            title="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Global Filter Bar */}
      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 border border-slate-200 rounded-lg shadow-2xs">
          {/* Search by filename */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Dateiname suchen..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 placeholder:text-slate-400 transition-all"
            />
          </div>

          {/* Subject Filter */}
          <div className="min-w-[150px]">
            <select
              value={selectedSubjectId}
              onChange={e => {
                setSelectedSubjectId(e.target.value);
                setSelectedTopicId('all');
              }}
              className="w-full px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 cursor-pointer transition-all"
            >
              <option value="all">Alle Fächer ({subjects.length})</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Topic Filter */}
          <div className="min-w-[150px]">
            <select
              value={selectedTopicId}
              onChange={e => setSelectedTopicId(e.target.value)}
              disabled={availableTopics.length === 0}
              className="w-full px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 focus:bg-white text-slate-900 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <option value="all">Alle Themen ({availableTopics.length})</option>
              {availableTopics.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {(selectedSubjectId !== 'all' || selectedTopicId !== 'all' || searchQuery) && (
            <button
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      )}

      {/* Document List or Empty States */}
      {documents.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center bg-white/50">
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-base font-medium text-slate-900 mb-1">Noch keine Dokumente</h3>
          <p className="text-sm text-slate-500 max-w-md">
            Hier werden alle hochgeladenen PDF-Dateien aus deinen Fächern und Themen gesammelt. Öffne ein Fach und ein Thema in der Navigation, um Unterlagen hochzuladen.
          </p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="border border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center text-center bg-white">
          <p className="text-base font-medium text-slate-900 mb-1">Keine Dokumente gefunden</p>
          <p className="text-sm text-slate-500 max-w-sm mb-4">
            Keine Unterlagen entsprechen den ausgewählten Filterkriterien.
          </p>
          <button
            onClick={handleResetFilters}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-md transition-colors cursor-pointer"
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredDocuments.map(doc => {
            const topic = topicsMap.get(doc.topicId);
            const subject = topic ? subjectsMap.get(topic.subjectId) : undefined;
            const subjectName = subject?.name ?? 'Unbekanntes Fach';
            const topicName = topic?.name ?? 'Unbekanntes Thema';

            return (
              <div
                key={doc.id}
                className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all"
              >
                <button
                  onClick={() => handleOpenDocument(doc.id)}
                  className="flex items-center gap-3.5 flex-1 min-w-0 text-left hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                      {doc.originalName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      <span className="font-medium text-slate-700">{subjectName}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>{topicName}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatFileSize(doc.size)}
                      <span className="mx-1.5 text-slate-300">·</span>
                      {formatDate(doc.createdAt)}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 ml-4 shrink-0">
                  <button
                    onClick={() => handleOpenDocument(doc.id)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                    title="Öffnen"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setRenamingDoc(doc)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                    title="Umbenennen"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setMovingDoc(doc)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                    title="Verschieben"
                  >
                    <FolderInput className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    disabled={deletingDocId === doc.id}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                    title="Löschen"
                  >
                    {deletingDocId === doc.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NameDialog
        isOpen={!!renamingDoc}
        onClose={() => setRenamingDoc(null)}
        onSubmit={handleRenameDocument}
        initialName={renamingDoc?.originalName ?? ''}
        title="Datei umbenennen"
        submitLabel="Speichern"
        placeholder="z.B. Mathematik Skript"
        label="Dateiname"
        maxLength={255}
      />

      <MoveDocumentDialog
        isOpen={!!movingDoc}
        onClose={() => setMovingDoc(null)}
        document={movingDoc}
        currentTopicId={movingDoc?.topicId ?? ''}
        subjects={subjects}
        topics={topics}
        onMove={handleMoveDocument}
      />
    </div>
  );
}
