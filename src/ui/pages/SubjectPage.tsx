import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Settings, Trash2, Edit2, Loader2, Book, Folder, Plus } from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { Subject, getSubjects, updateSubject, deleteSubject } from '../../application/use-cases/subjects';
import { Topic, getTopicsForSubject, createTopic, updateTopic, deleteTopic } from '../../application/use-cases/topics';
import { Button } from '../components/Button';
import { NameDialog } from '../components/NameDialog';
import { DeleteDialog } from '../components/DeleteDialog';

export function SubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [isAddTopicDialogOpen, setIsAddTopicDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null);

  const loadData = async () => {
    if (!user || !subjectId || isAuthLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const subjects = await getSubjects(user.id);
      const found = subjects.find(s => s.id === subjectId);
      if (found) {
        setSubject(found);
        const loadedTopics = await getTopicsForSubject(user.id, found.id);
        setTopics(loadedTopics);
      } else {
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error("Failed to load subject data", error);
      setError("Fehler beim Laden der Fachdaten. Möglicherweise fehlen Berechtigungen.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      loadData();
    }
  }, [user, subjectId, navigate, isAuthLoading]);

  const handleEditSubject = async (name: string) => {
    if (!user || !subject) return;
    await updateSubject(user.id, subject.id, name);
    window.location.reload(); 
  };

  const handleDeleteSubject = async () => {
    if (!user || !subject) return;
    try {
      await deleteSubject(user.id, subject.id);
      window.location.href = '/'; 
    } catch (err: unknown) {
      console.error("Failed to delete subject", err);
      setError("Fehler beim Löschen des Fachs. Bitte erneut versuchen.");
      setIsDeleteDialogOpen(false);
    }
  };

  const handleAddTopic = async (name: string) => {
    if (!user || !subject) return;
    await createTopic(user.id, subject.id, name);
    await loadData();
  };

  const handleEditTopic = async (name: string) => {
    if (!user || !editingTopic) return;
    await updateTopic(user.id, editingTopic.id, name);
    setEditingTopic(null);
    await loadData();
  };

  const handleDeleteTopic = async () => {
    if (!user || !deletingTopic) return;
    try {
      await deleteTopic(user.id, deletingTopic.id);
      setDeletingTopic(null);
      await loadData();
    } catch (err: unknown) {
      console.error("Failed to delete topic", err);
      setError("Fehler beim Löschen des Themas. Bitte erneut versuchen.");
      setDeletingTopic(null);
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
      </div>
    );
  }

  if (!subject) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
            <Book className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{subject.name}</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setIsEditDialogOpen(true)} className="gap-2">
            <Edit2 className="w-4 h-4" />
            <span className="hidden sm:inline">Umbenennen</span>
          </Button>
          <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(true)} aria-label="Fach löschen" className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-900">Themen</h2>
          <Button onClick={() => setIsAddTopicDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Thema erstellen
          </Button>
        </div>

        {topics.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center bg-white/50">
            <h3 className="text-sm font-medium text-slate-900 mb-1">Noch keine Themen</h3>
            <p className="text-sm text-slate-500 max-w-sm mb-4">
              Erstelle ein Thema, um deine Unterlagen später zu organisieren.
            </p>
            <Button variant="secondary" onClick={() => setIsAddTopicDialogOpen(true)}>
              Thema erstellen
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {topics.map((topic) => (
              <div 
                key={topic.id}
                className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
              >
                <Link 
                  to={`/subject/${subject.id}/topic/${topic.id}`} 
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Folder className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="font-medium text-slate-900 truncate">{topic.name}</span>
                </Link>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingTopic(topic)}
                    aria-label={`Thema "${topic.name}" umbenennen`}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeletingTopic(topic)}
                    aria-label={`Thema "${topic.name}" löschen`}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NameDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSubmit={handleEditSubject}
        title="Fach umbenennen"
        submitLabel="Speichern"
        initialName={subject.name}
        placeholder="z.B. Fachkunde"
      />

      <DeleteDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDeleteSubject}
        title="Fach löschen?"
        description={
          <>
            Das Fach <span className="font-semibold text-slate-900">"{subject.name}"</span> und alle zugehörigen Themen werden gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </>
        }
      />

      <NameDialog
        isOpen={isAddTopicDialogOpen}
        onClose={() => setIsAddTopicDialogOpen(false)}
        onSubmit={handleAddTopic}
        title="Neues Thema"
        submitLabel="Thema erstellen"
        placeholder="z.B. Lernfeld 1"
      />

      {editingTopic && (
        <NameDialog
          isOpen={true}
          onClose={() => setEditingTopic(null)}
          onSubmit={handleEditTopic}
          title="Thema umbenennen"
          submitLabel="Speichern"
          initialName={editingTopic.name}
          placeholder="z.B. Lernfeld 1"
        />
      )}

      {deletingTopic && (
        <DeleteDialog
          isOpen={true}
          onClose={() => setDeletingTopic(null)}
          onConfirm={handleDeleteTopic}
          title="Thema löschen?"
          description={
            <>
              Das Thema <span className="font-semibold text-slate-900">"{deletingTopic.name}"</span> wird dauerhaft gelöscht.
            </>
          }
        />
      )}
    </div>
  );
}
