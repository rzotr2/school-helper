import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ChevronRight, Folder, FileText, Upload, Trash2, ExternalLink, Edit2, FolderInput, AlertCircle, X } from 'lucide-react';
import { Button } from '../components/Button';
import { NameDialog } from '../components/NameDialog';
import { MoveDocumentDialog } from '../components/MoveDocumentDialog';
import { DeleteDialog } from '../components/DeleteDialog';
import { Document, getDocumentsForTopic, uploadDocument, deleteDocument, getDocumentDownloadUrl, renameDocument, moveDocument } from '../../application/use-cases/documents';
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [renamingDoc, setRenamingDoc] = useState<Document | null>(null);
  const [movingDoc, setMovingDoc] = useState<Document | null>(null);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        
        if (!foundSubject) {
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
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message || 'Fehler beim Hochladen' : 'Fehler beim Hochladen');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!user) return;
    setActionError(null);
    setDeletingDocId(docId);
    try {
      await deleteDocument(user.id, docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      console.error('Failed to delete document', err);
      setActionError('Fehler beim Löschen des Dokuments.');
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleOpenDocument = async (docId: string) => {
    if (!user) return;
    setActionError(null);
    try {
      const url = await getDocumentDownloadUrl(user.id, docId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open document', err);
      setActionError('Dokument konnte nicht geöffnet werden.');
    }
  };

  const handleRenameDocument = async (newName: string) => {
    if (!user || !renamingDoc) return;
    setActionError(null);
    const updated = await renameDocument(user.id, renamingDoc.id, newName);
    setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
    setRenamingDoc(null);
  };

  const handleMoveDocument = async (targetTopicId: string) => {
    if (!user || !movingDoc) return;
    setActionError(null);
    await moveDocument(user.id, movingDoc.id, targetTopicId);
    if (targetTopicId !== topicId) {
      setDocuments(prev => prev.filter(d => d.id !== movingDoc.id));
    }
    setMovingDoc(null);
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
          {documents.map((doc) => (
            <div 
              key={doc.id}
              className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 transition-all"
            >
              <button 
                onClick={() => handleOpenDocument(doc.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left hover:text-blue-600 transition-colors"
              >
                <div className="w-8 h-8 rounded bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                    {doc.originalName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(doc.size / 1024 / 1024).toFixed(2)} MB &middot; {doc.createdAt.toLocaleDateString('de-DE')}
                  </p>
                </div>
              </button>
              
              <div className="flex items-center gap-1.5 ml-4 shrink-0">
                <button
                  onClick={() => handleOpenDocument(doc.id)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
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
          ))}
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
    </div>
  );
}
