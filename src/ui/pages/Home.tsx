import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Loader2, ExternalLink, Trash2, Search, AlertCircle, X, Edit2, FolderInput, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import {
  Document,
  getAllDocuments,
  getCompletedDocumentsWithContent,
  getDocumentContentById,
  uploadDocument,
} from '../../application/use-cases/documents';
import { processDocument } from '../../application/use-cases/documentProcessing';
import {
  getDocumentRoutingRecommendations,
  assignDocumentToTopic,
  type DocumentRoutingRecommendation,
} from '../../application/use-cases/documentRouting';
import { canOpenDocument, type DocumentContent } from '../../application/use-cases/documentContent';
import {
  understandDocument,
  DOCUMENT_TYPE_LABELS,
} from '../../application/use-cases/documentUnderstanding';
import { DocumentInfoModal } from '../components/pdf/DocumentInfoModal';
import { DocumentRoutingModal } from '../components/pdf/DocumentRoutingModal';
import {
  searchDocuments,
  foldLookalikes,
  levenshteinDistance,
  type DocumentSearchResult,
} from '../../application/use-cases/documentSearch';
import { Subject, getSubjects, SUBJECTS_CHANGED_EVENT } from '../../application/use-cases/subjects';
import { Topic, getAllTopics, createTopic } from '../../application/use-cases/topics';
import { NameDialog } from '../components/NameDialog';
import { MoveDocumentDialog } from '../components/MoveDocumentDialog';
import { DeleteDialog } from '../components/DeleteDialog';
import { useDocumentActions } from '../hooks/useDocumentActions';
import { useDocumentProcessing } from '../hooks/useDocumentProcessing';
import { formatFileSize, formatDate } from '../../shared/utils/format';
import { cn } from '../../shared/utils/cn';

const HOMOGLYPH_REGEX_MAP: Record<string, string> = {
  a: '[a\\u0430]', '\u0430': '[a\\u0430]',
  c: '[c\\u0441]', '\u0441': '[c\\u0441]',
  e: '[e\\u0435\\u0454]', '\u0435': '[e\\u0435\\u0454]', '\u0454': '[e\\u0435\\u0454]',
  i: '[i\\u0456\\u0457]', '\u0456': '[i\\u0456\\u0457]', '\u0457': '[i\\u0456\\u0457]',
  j: '[j\\u0458]', '\u0458': '[j\\u0458]',
  o: '[o\\u043e]', '\u043e': '[o\\u043e]',
  p: '[p\\u0440]', '\u0440': '[p\\u0440]',
  s: '[s\\u0455]', '\u0455': '[s\\u0455]',
  x: '[x\\u0445]', '\u0445': '[x\\u0445]',
  y: '[y\\u0443]', '\u0443': '[y\\u0443]',
  t: '[t\\u0442]', '\u0442': '[t\\u0442]',
  k: '[k\\u043a]', '\u043a': '[k\\u043a]',
  m: '[m\\u043c]', '\u043c': '[m\\u043c]',
  n: '[n\\u043d]', '\u043d': '[n\\u043d]',
  b: '[b\\u0432]', '\u0432': '[b\\u0432]',
};

function buildFlexibleHighlightRegex(query: string): RegExp {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/./g, (ch) => HOMOGLYPH_REGEX_MAP[ch.toLowerCase()] ?? ch);
  return new RegExp(`(${pattern})`, 'gi');
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;

  const regex = buildFlexibleHighlightRegex(trimmed);
  const testRegex = buildFlexibleHighlightRegex(trimmed);
  const parts = text.split(regex);

  if (parts.length > 1) {
    return (
      <>
        {parts.map((part, index) =>
          testRegex.test(part) ? (
            <mark key={index} className="bg-yellow-200 text-slate-900 rounded-xs px-0.5 font-semibold">
              {part}
            </mark>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </>
    );
  }

  // Fallback: tokenize words and highlight fuzzy/OCR-noise matches (e.g. "анотаціхія" for "анотація")
  const queryWords = foldLookalikes(trimmed.toLowerCase()).split(/\s+/).filter(Boolean);
  const tokenParts = text.split(/([^\s,.:;!?"'()\[\]{}«»„“”\n\r\t]+)/gu);

  return (
    <>
      {tokenParts.map((part, index) => {
        const folded = foldLookalikes(part.toLowerCase());
        const isMatch = queryWords.some((qWord) => {
          const qLen = qWord.length;
          if (qLen < 4) return folded === qWord;
          const maxDist = qLen >= 7 ? 2 : 1;
          return Math.abs(folded.length - qLen) <= maxDist && levenshteinDistance(folded, qWord) <= maxDist;
        });

        return isMatch ? (
          <mark key={index} className="bg-yellow-200 text-slate-900 rounded-xs px-0.5 font-semibold">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

export function Home() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Full-text document search state
  const [fullTextQuery, setFullTextQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[]>([]);
  const searchableDocsRef = useRef<Document[] | null>(null);
  // Shared document action handlers and their dialog state.
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
  } = useDocumentActions(user?.id, setDocuments);

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
      console.error('[Home] Failed to analyze document:', err);
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
        console.warn('[Home] Failed to load content for document info modal:', err);
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

  // Global upload & intelligent routing state
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const [isGlobalUploading, setIsGlobalUploading] = useState(false);
  const [routingDoc, setRoutingDoc] = useState<Document | null>(null);
  const [routingRecommendation, setRoutingRecommendation] = useState<DocumentRoutingRecommendation | null>(null);
  const [isLoadingRouting, setIsLoadingRouting] = useState(false);
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState(false);

  const handleGlobalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';

    if (topics.length === 0) {
      setActionError('Bitte erstelle zuerst mindestens ein Fach und ein Thema, bevor du Dokumente hochlädst.');
      return;
    }

    setIsGlobalUploading(true);
    setActionError(null);

    try {
      const initialTopic = topics[0];
      const newDoc = await uploadDocument(user.id, initialTopic.id, file);
      setDocuments(prev => [newDoc, ...prev]);

      setRoutingDoc(newDoc);
      setRoutingRecommendation(null);
      setIsLoadingRouting(true);
      setIsRoutingModalOpen(true);

      try {
        await processDocument(user.id, newDoc.id);
        setDocuments(prev =>
          prev.map(d => (d.id === newDoc.id ? { ...d, processingStatus: 'completed' } : d))
        );

        const rec = await getDocumentRoutingRecommendations(user.id, newDoc.id);
        setRoutingRecommendation(rec);
      } catch (procErr) {
        console.warn('[Home] Processing or routing recommendation failed:', procErr);
        setRoutingRecommendation(null);
      } finally {
        setIsLoadingRouting(false);
      }
    } catch (uploadErr) {
      console.error('[Home] Global upload failed:', uploadErr);
      setActionError(uploadErr instanceof Error ? uploadErr.message : 'Fehler beim Hochladen der Datei.');
    } finally {
      setIsGlobalUploading(false);
    }
  };

  const handleConfirmRouting = async (
    destination: { topicId: string } | { createTopicName: string; subjectId: string }
  ) => {
    if (!user || !routingDoc) return;
    let targetTopicId: string;
    if ('createTopicName' in destination) {
      const created = await createTopic(user.id, destination.subjectId, destination.createTopicName);
      targetTopicId = created.id;
      setTopics(prev => [...prev, created]);
    } else {
      targetTopicId = destination.topicId;
    }

    const movedDoc = await assignDocumentToTopic(user.id, routingDoc.id, targetTopicId);
    setDocuments(prev => prev.map(d => (d.id === routingDoc.id ? movedDoc : d)));
    setIsRoutingModalOpen(false);
    setRoutingDoc(null);
    setRoutingRecommendation(null);
  };

  // Filters
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = async () => {
    if (!user || isAuthLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      searchableDocsRef.current = null;
      const [loadedSubjects, loadedTopics, loadedDocs] = await Promise.all([
        getSubjects(user.id),
        getAllTopics(user.id),
        getAllDocuments(user.id)
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

  useEffect(() => {
    const handleSubjectsChanged = () => {
      void loadData();
    };
    window.addEventListener(SUBJECTS_CHANGED_EVENT, handleSubjectsChanged);
    return () => {
      window.removeEventListener(SUBJECTS_CHANGED_EVENT, handleSubjectsChanged);
    };
  }, [user, isAuthLoading]);

  useEffect(() => {
    searchableDocsRef.current = null;
  }, [documents]);

  // Debounce fullTextQuery by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(fullTextQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [fullTextQuery]);

  const handleResetSearch = () => {
    setFullTextQuery('');
    setDebouncedQuery('');
    setSearchResults([]);
    searchableDocsRef.current = null;
  };

  // Execute full-text search when debouncedQuery changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed || !user) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);

    const performSearch = async () => {
      try {
        if (!searchableDocsRef.current) {
          searchableDocsRef.current = await getCompletedDocumentsWithContent(user.id);
        }
        if (isCancelled) return;
        const results = searchDocuments(searchableDocsRef.current, trimmed);
        if (!isCancelled) {
          setSearchResults(results);
          if (results.length === 0) {
            searchableDocsRef.current = null;
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('[Search] Failed to perform full-text search', err);
          setSearchResults([]);
          searchableDocsRef.current = null;
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    };

    void performSearch();

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery, user]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Alle Dateien</h1>
          <p className="text-sm text-slate-500">
            Übersicht aller hochgeladenen PDF-Unterlagen aus deinen Fächern und Themen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={globalFileInputRef}
            onChange={handleGlobalFileUpload}
            accept="application/pdf"
            className="hidden"
          />
          <button
            onClick={() => globalFileInputRef.current?.click()}
            disabled={isGlobalUploading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isGlobalUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>Dokument hochladen</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-500 hover:text-red-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
            title="Schließen"
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Full-text Search Bar */}
      {documents.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={fullTextQuery}
            onChange={e => setFullTextQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                handleResetSearch();
              }
            }}
            placeholder="Dokumente nach Text durchsuchen (z. B. Fotosynthese, Vokabeln)…"
            className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900 placeholder:text-slate-400 transition-all"
          />
          {fullTextQuery && (
            <button
              onClick={handleResetSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
              title="Suche zurücksetzen"
              aria-label="Suche zurücksetzen"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {fullTextQuery.trim() ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-slate-600 px-1">
            {isSearching ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>Suche läuft…</span>
              </div>
            ) : (
              <div>
                <span className="font-semibold text-slate-900">{searchResults.length}</span>{' '}
                {searchResults.length === 1 ? 'Treffer' : 'Treffer'} gefunden
                {debouncedQuery.trim() && (
                  <span>
                    {' '}für „<span className="font-medium text-slate-900">{debouncedQuery.trim()}</span>“
                  </span>
                )}
              </div>
            )}
            <button
              onClick={handleResetSearch}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Suche beenden
            </button>
          </div>

          {!isSearching && searchResults.length === 0 ? (
            <div className="border border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center text-center bg-white">
              <Search className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-base font-medium text-slate-900 mb-1">Keine Treffer gefunden</p>
              <p className="text-sm text-slate-500 max-w-sm mb-4">
                Für „{debouncedQuery.trim()}“ wurden keine Übereinstimmungen im Text deiner verarbeiteten Dokumente gefunden.
              </p>
              <button
                onClick={handleResetSearch}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-md transition-colors cursor-pointer"
              >
                Suche zurücksetzen
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {searchResults.map((result) => {
                const topic = topicsMap.get(result.topicId);
                const subject = topic ? subjectsMap.get(topic.subjectId) : undefined;
                const subjectName = subject?.name ?? 'Unbekanntes Fach';
                const topicName = topic?.name ?? 'Unbekanntes Thema';

                return (
                  <button
                    key={`${result.documentId}-${result.pageNumber}-${result.source}`}
                    type="button"
                    onClick={() => navigate(`/document/${result.documentId}?page=${result.pageNumber}`)}
                    className="w-full text-left group p-4 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                            {result.documentName}
                          </h4>
                          <p className="text-xs text-slate-500 truncate">
                            <span className="font-medium text-slate-700">{subjectName}</span>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span>{topicName}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-md">
                          Seite {result.pageNumber}
                        </span>
                        <span
                          className={cn(
                            "px-2 py-0.5 text-xs font-medium rounded-md border",
                            result.source === 'native'
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          )}
                          title={
                            result.source === 'native'
                              ? 'Im nativen PDF-Text gefunden'
                              : 'Im erkannten OCR-Text gefunden'
                          }
                        >
                          {result.source === 'native' ? 'Textebene' : 'OCR'}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-md border border-slate-100 font-mono break-words leading-relaxed">
                      <HighlightMatch text={result.snippet} query={debouncedQuery} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
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
                  {availableTopics.map(t => {
                    const subjectName = subjectsMap.get(t.subjectId)?.name;
                    const label = selectedSubjectId === 'all' && subjectName ? `${subjectName} · ${t.name}` : t.name;
                    return (
                      <option key={t.id} value={t.id}>
                        {label}
                      </option>
                    );
                  })}
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
                const isOpenable = canOpenDocument(doc.processingStatus);
                const progressText = processingProgress.get(doc.id);
                const isProcessing = progressText !== undefined;

                return (
                  <div
                    key={doc.id}
                    className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all"
                  >
                    <button
                      onClick={() => isOpenable && handleOpenDocument(doc.id)}
                      disabled={!isOpenable}
                      className={cn(
                        "flex items-center gap-3.5 flex-1 min-w-0 text-left transition-colors",
                        isOpenable ? "hover:text-blue-600 cursor-pointer" : "cursor-default"
                      )}
                    >
                      <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "font-medium text-slate-900 truncate transition-colors",
                          isOpenable && "group-hover:text-blue-600"
                        )}>
                          {doc.originalName}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          <span className="font-medium text-slate-700">{subjectName}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span>{topicName}</span>
                        </p>
                        {isProcessing ? (
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                            <span className="truncate">{progressText || 'Wird verarbeitet…'}</span>
                          </p>
                        ) : doc.processingStatus === 'failed' ? (
                          <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1.5">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            Verarbeitung fehlgeschlagen
                          </p>
                        ) : isOpenable ? (
                          <div className="mt-0.5 space-y-1">
                            <p className="text-xs text-slate-400">
                              {formatFileSize(doc.size)}
                              <span className="mx-1.5 text-slate-300">·</span>
                              {formatDate(doc.createdAt)}
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
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            Verarbeitung unterbrochen
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 mt-0.5">
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
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
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
        </>
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

      <DocumentRoutingModal
        isOpen={isRoutingModalOpen}
        onClose={() => {
          setIsRoutingModalOpen(false);
          setRoutingDoc(null);
          setRoutingRecommendation(null);
        }}
        documentName={routingDoc?.originalName ?? ''}
        subjects={subjects}
        topics={topics}
        recommendation={routingRecommendation}
        isLoadingRecommendation={isLoadingRouting}
        onConfirm={handleConfirmRouting}
      />
    </div>
  );
}
