import React, { useEffect, useState } from 'react';
import { Folder, FileText, Plus, Loader2, GraduationCap } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../shared/utils/cn';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import {
  Subject,
  getSubjects,
  createSubject,
  SUBJECTS_CHANGED_EVENT,
  notifySubjectsChanged,
} from '../../application/use-cases/subjects';
import { getSchoolProfile, createSchoolProfile } from '../../application/use-cases/schoolProfile';
import { NameDialog } from './NameDialog';

export function Sidebar() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const loadData = async () => {
    if (!user || isAuthLoading) return;
    try {
      setIsLoading(true);
      // Check for school profile first, create if missing
      const profile = await getSchoolProfile(user.id);
      if (!profile) {
        await createSchoolProfile(user.id);
      }
      
      const loadedSubjects = await getSubjects(user.id);
      setSubjects(loadedSubjects);
    } catch (error) {
      console.error("Failed to load subjects:", error);
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

  const handleAddSubject = async (name: string) => {
    if (!user) return;
    const position = subjects.length > 0 ? subjects[subjects.length - 1].position + 1 : 0;
    await createSubject(user.id, name, position);
    notifySubjectsChanged();
    await loadData();
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
            Meine Schule
          </h3>
          <nav className="space-y-0.5">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
                  isActive ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )
              }
            >
              <FileText className="w-4 h-4" />
              Alle Dateien
            </NavLink>
            <NavLink
              to="/learn"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
                  isActive ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )
              }
            >
              <GraduationCap className="w-4 h-4" />
              Lernen
            </NavLink>
          </nav>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 px-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Fächer
            </h3>
            <button
              onClick={() => setIsAddDialogOpen(true)}
              className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-1 rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              title="Fach hinzufügen"
              aria-label="Fach hinzufügen"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <nav className="space-y-0.5">
            {(isLoading || isAuthLoading) ? (
              <div className="flex items-center justify-center py-4 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : subjects.length === 0 ? (
              <div className="px-2 py-2 text-sm text-slate-400 italic">
                Noch keine Fächer
              </div>
            ) : (
              subjects.map((subject) => (
                <NavLink
                  key={subject.id}
                  to={`/subject/${subject.id}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
                      isActive ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )
                  }
                >
                  <Folder className="w-4 h-4" />
                  <span className="truncate">{subject.name}</span>
                </NavLink>
              ))
            )}
          </nav>
        </div>
      </div>

      <NameDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSubmit={handleAddSubject}
        title="Neues Fach"
        submitLabel="Fach hinzufügen"
      />
    </aside>
  );
}
