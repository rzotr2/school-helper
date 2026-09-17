import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ChevronRight, Folder, FileText, Upload, Trash2, ExternalLink, Edit2, FolderInput, AlertCircle, X, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '../components/Button';
import { NameDialog } from '../components/NameDialog';
import { MoveDocumentDialog } from '../components/MoveDocumentDialog';
import { DeleteDialog } from '../components/DeleteDialog';
import { Document, getDocumentsForTopic, uploadDocument, getDocumentContentById } from '../../application/use-cases/documents';
import { canOpenDocument, type DocumentContent } from '../../application/use-cases/documentContent';
import {
  understandDocument,
  DOCUMENT_TYPE_LABELS,
} from '../../application/use-cases/documentUnderstanding';
import { DocumentInfoModal } from '../components/pdf/DocumentInfoModal';
import { useDocumentActions } from '../hooks/useDocumentActions';
import { useDocumentProcessing } from '../hooks/useDocumentProcessing';
import { formatFileSize, formatDate } from '../../shared/utils/format';
import { cn } from '../../shared/utils/cn';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { Subject, getSubjects } from '../../application/use-cases/subjects';
import { Topic, getTopic, getAllTopics } from '../../application/use-cases/topics';

export function TopicPage() {
  const { subjectId, topicId } = useParams<{ subjectId: string; topicId: string }>();
  const { user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared document action handlers and their dialog state. The page shows a
  // single topic, so documents moved elsewhere leave the list.
  const {
    actionError,
    setActionError,
    deletingDocId,
    renamingDoc,
    setRenamingDoc,
    movingDoc,
    setMovingDoc,
    docToDelete,
    setDocToDelete,
    handleOpenDocument,
    handleDeleteDocument,
    handleRenameDocument,
    handleMoveDocument,
  } = useDocumentActions(user?.id, setDocuments, { currentTopicId: topicId });

  // Automatic processing (extraction + OCR) runs per document; the hook
  // tracks the in-flight runs of this session and updates the list state.
  const { processingProgress, startProcessing } = useDocumentProcessing(user?.id, setDocuments);

  // Semantic document analysis modal state
  const [inspectingDoc, setInspectingDoc] = useState<Document | null>(null);
  const [isAnalyzingDoc, setIsAnalyzingDoc] = useState(false);

  const handleAnalyzeDocument = async (doc: Document) => {
    if (!user?.id || isAnalyzingDoc) return;
    setIsAnalyzingDoc(true);
    try {
      const result = await understandDocument(user.id, doc.id, { force: true });
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, understanding: result } : d));
      setInspectingDoc(prev => prev && prev.id === doc.id ? { ...prev, understanding: result } : prev);
    } catch (err) {
      console.error('[TopicPage] Failed to analyze document:', err);
    } finally {
      setIsAnalyzingDoc(false);
    }
  };

  const [inspectingDocContent, setInspectingDocContent] = useState<DocumentContent | null>(null);
  const [isLoadingDocContent, setIsLoadingDocContent] = useState(false);

  useEffect(() => {
    if (!inspectingDoc || !user?.id) {
      setInspectingDocContent(null);
      return;
    }
    if (inspectingDoc.content) {
      setInspectingDocContent(inspectingDoc.content);
      return;
    }
    let isCancelled = false;
    setIsLoadingDocContent(true);
    getDocumentContentById(user.id, inspectingDoc.id)
      .then((content) => {
        if (!isCancelled) {
          setInspectingDocContent(content);
        }
      })
      .catch((err) => {
        console.warn('[TopicPage] Failed to load content for document info modal:', err);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingDocContent(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [inspectingDoc, user?.id]);

  useEffect(() => {
    const loadData = async () => {
      if (!user || !subjectId || !topicId || isAuthLoading) return;
      setIsLoading(true);
      setError(null);
      try {
        const [subjects, topics, loadedDocs, foundTopic] = await Promise.all([
          getSubjects(user.id),
          getAllTopics(user.id),
          getDocumentsForTopic(user.id, topicId),
          getTopic(user.id, topicId)
        ]);
        
        const foundSubject = subjects.find(s => s.id === subjectId);
        
        if (!foundSubject || foundTopic.subjectId !== subjectId) {
          navigate('/', { replace: true });
          return;
        }
        
        setSubject(foundSubject);
        setAllSubjects(subjects);
        setAllTopics(topics);
        setTopic(foundTopic);
        setDocuments(loadedDocs);

      } catch (error) {
        console.error("Failed to load topic data", error);
        setError("Fehler beim Laden des Themas. Möglicherweise fehlen Berechtigungen.");
      } finally {
        setIsLoading(false);
      }
    };
    
    if (!isAuthLoading) {
      loadData();
    }
  }, [user, subjectId, topicId, navigate, isAuthLoading]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !topic) return;
    
    // Clear input so same file can be selected again if it fails
    e.target.value = '';

    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const newDoc = await uploadDocument(
        user.id,
        topic.id,
        file,
        (progress) => setUploadProgress(Math.round(progress))
      );
      setDocuments(prev => [newDoc, ...prev]);
      // Processing starts automatically in this session; the persisted
      // 'pending'/'processing' status keeps the row busy across reloads.
      void startProcessing(newDoc.id);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message || 'Fehler beim Hochladen' : 'Fehler beim Hochladen');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
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
      <div className="border-2 border-dashed border-red-200 rounded-xl p-12 flex flex-col items-center justify-center text-center bg-red-50/50">
        <h3 className="text-sm font-medium text-red-900 mb-1">Ein Fehler ist aufgetreten</h3>
        <p className="text-sm text-red-700">{error}</p>
        <Link to="/" className="mt-4 text-blue-600 hover:underline">Zurück zur Übersicht</Link>
      </div>
    );
  }

  if (!subject || !topic) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <Link 
          to={`/subject/${subject.id}`} 
          className="hover:text-slate-900 hover:underline transition-colors"
        >
          {subject.name}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-900 font-medium">{topic.name}</span>
      </div>

      <div className="flex items-center gap-3 border-b border-slate-200 pb-6">
        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
          <Folder className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">{topic.name}</h1>
      </div>

      {uploadError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm mb-4 border border-red-200">
          {uploadError}
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between p-3.5 bg-red-50 text-red-700 rounded-lg text-sm mb-4 border border-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="p-1 hover:bg-red-100 rounded text-red-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="Schließen"
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-slate-900">Dokumente</h2>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          <Button
            variant="primary"
            className="gap-2"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {isUploading ? `Wird hochgeladen (${uploadProgress}%)` : 'Dokument hochladen'}
          </Button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center bg-white/50">
          <h3 className="text-sm font-medium text-slate-900 mb-1">Noch keine Unterlagen</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-4">
            Lade dein erstes PDF für dieses Thema hoch.
          </p>
          <Button
            variant="secondary"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            Dokument hochladen
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => {
            const isOpenable = canOpenDocument(doc.processingStatus);
            const progressText = processingProgress.get(doc.id);
            const isProcessing = progressText !== undefined;

            return (
              <div
                key={doc.id}
                className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 transition-all"
              >
                <button
                  onClick={() => isOpenable && handleOpenDocument(doc.id)}
                  disabled={!isOpenable}
                  className={cn(
                    "flex items-center gap-3 flex-1 min-w-0 text-left transition-colors",
                    isOpenable ? "hover:text-blue-600 cursor-pointer" : "cursor-default"
                  )}
                >
                  <div className="w-8 h-8 rounded bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={cn(
                      "font-medium text-slate-900 truncate transition-colors",
                      isOpenable && "group-hover:text-blue-600"
                    )}>
                      {doc.originalName}
                    </p>
                    {isProcessing ? (
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                        <span className="truncate">{progressText || 'Wird verarbeitet…'}</span>
                      </p>
                    ) : doc.processingStatus === 'failed' ? (
                      <p className="text-xs text-red-600 flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        Verarbeitung fehlgeschlagen
                      </p>
                    ) : isOpenable ? (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500">
                          {formatFileSize(doc.size)} &middot; {formatDate(doc.createdAt)}
                        </p>
                        {doc.understanding && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                              {DOCUMENT_TYPE_LABELS[doc.understanding.documentType] ?? 'Dokument'}
                            </span>
                            {doc.understanding.title && (
                              <span className="text-[11px] text-slate-600 font-medium truncate max-w-[200px]">
                                {doc.understanding.title}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : doc.processingStatus === 'processing' ? (
                      // A persisted 'processing' row with no live run in this
                      // session: the browser run that started it is gone
                      // (reload). Show the recovery state instead of
                      // pretending the job is still running.
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        Verarbeitung unterbrochen
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Verarbeitung ausstehend
                      </p>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-1.5 ml-4 shrink-0">
                  {isOpenable && (
                    <button
                      onClick={() => setInspectingDoc(doc)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      title="Dokument-Übersicht & Analyse"
                      aria-label="Dokument-Übersicht & Analyse"
                    >
                      <Sparkles className={cn("w-4 h-4", doc.understanding ? "text-blue-600" : "")} />
                    </button>
                  )}
                  {!isOpenable && (
                    <button
                      onClick={() => void startProcessing(doc.id)}
                      disabled={isProcessing}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      title="Verarbeitung wiederholen"
                      aria-label="Verarbeitung wiederholen"
                    >
                      <RefreshCw className={cn("w-4 h-4", isProcessing && "animate-spin text-blue-600")} />
                    </button>
                  )}
                  <button
                    onClick={() => isOpenable && handleOpenDocument(doc.id)}
                    disabled={!isOpenable}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    title="Öffnen"
                    aria-label="Öffnen"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setRenamingDoc(doc)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    title="Umbenennen"
                    aria-label="Umbenennen"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setMovingDoc(doc)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    title="Verschieben"
                    aria-label="Verschieben"
                  >
                    <FolderInput className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDocToDelete(doc)}
                    disabled={deletingDocId === doc.id}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    title="Löschen"
                    aria-label="Löschen"
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
        currentTopicId={topicId ?? ''}
        subjects={allSubjects}
        topics={allTopics}
        onMove={handleMoveDocument}
      />

      <DeleteDialog
        isOpen={!!docToDelete}
        onClose={() => setDocToDelete(null)}
        onConfirm={() => handleDeleteDocument(docToDelete?.id ?? '')}
        title="Dokument löschen?"
        description={
          <>
            Das Dokument <span className="font-semibold text-slate-900">"{docToDelete?.originalName}"</span> wird dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </>
        }
      />

      <DocumentInfoModal
        isOpen={!!inspectingDoc}
        onClose={() => setInspectingDoc(null)}
        documentName={inspectingDoc?.originalName ?? ''}
        documentId={inspectingDoc?.id}
        content={inspectingDocContent}
        isLoadingContent={isLoadingDocContent}
        onNavigateToPage={(page) => {
          if (inspectingDoc) {
            navigate(`/document/${inspectingDoc.id}?page=${page}`);
          }
        }}
        understanding={inspectingDoc?.understanding ?? null}
        isAnalyzing={isAnalyzingDoc}
        onAnalyze={() => inspectingDoc && void handleAnalyzeDocument(inspectingDoc)}
      />
    </div>
  );
}
