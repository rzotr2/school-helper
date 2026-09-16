import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  Document,
  deleteDocument,
  getDocumentDownloadUrl,
  moveDocument,
  renameDocument,
} from '../../application/use-cases/documents';

interface UseDocumentActionsOptions {
  // When set, a document moved to a different topic is removed from the list
  // (the page shows a single topic). When omitted, the document stays in the
  // list with its new topicId (the page shows all documents).
  currentTopicId?: string;
}

/**
 * Shared document action state and handlers for the pages that render
 * document lists (Home, TopicPage). The pages keep ownership of their
 * document list; the hook coordinates the action calls and the
 * selected-document / dialog state that both pages need.
 */
export function useDocumentActions(
  userId: string | undefined,
  setDocuments: Dispatch<SetStateAction<Document[]>>,
  options: UseDocumentActionsOptions = {},
) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [renamingDoc, setRenamingDoc] = useState<Document | null>(null);
  const [movingDoc, setMovingDoc] = useState<Document | null>(null);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);

  const handleOpenDocument = async (docId: string) => {
    if (!userId) return;
    setActionError(null);
    try {
      const url = await getDocumentDownloadUrl(userId, docId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open document', err);
      setActionError('Dokument konnte nicht geöffnet werden.');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!userId) return;
    setActionError(null);
    setDeletingDocId(docId);
    try {
      await deleteDocument(userId, docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      console.error('Failed to delete document', err);
      setActionError('Fehler beim Löschen des Dokuments. Bitte versuche es erneut.');
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleRenameDocument = async (newName: string) => {
    if (!userId || !renamingDoc) return;
    setActionError(null);
    const updated = await renameDocument(userId, renamingDoc.id, newName);
    setDocuments(prev => prev.map(d => (d.id === updated.id ? updated : d)));
    setRenamingDoc(null);
  };

  const handleMoveDocument = async (targetTopicId: string) => {
    if (!userId || !movingDoc) return;
    setActionError(null);
    const updated = await moveDocument(userId, movingDoc.id, targetTopicId);
    if (options.currentTopicId !== undefined) {
      if (updated.topicId !== options.currentTopicId) {
        setDocuments(prev => prev.filter(d => d.id !== updated.id));
      }
    } else {
      setDocuments(prev =>
        prev.map(d => (d.id === updated.id ? { ...d, topicId: updated.topicId } : d)),
      );
    }
    setMovingDoc(null);
  };

  return {
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
  };
}
