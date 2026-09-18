import React, { useEffect, useState, useMemo } from 'react';
import { Folder, FileText, Plus, Loader2, GraduationCap, X, BookOpen, ChevronRight } from 'lucide-react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { cn } from '../../shared/utils/cn';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import {
  Subject,
  getSubjects,
  createSubject,
  SUBJECTS_CHANGED_EVENT,
  notifySubjectsChanged,
} from '../../application/use-cases/subjects';
import {
  Topic,
  getAllTopics,
  TOPICS_CHANGED_EVENT,
} from '../../application/use-cases/topics';
import { getSchoolProfile, createSchoolProfile } from '../../application/use-cases/schoolProfile';
import { NameDialog } from './NameDialog';

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const location = useLocation();

  const loadData = async () => {
    if (!user || isAuthLoading) return;
    try {
      setIsLoading(true);
      // Check for school profile first, create if missing
      const profile = await getSchoolProfile(user.id);
      if (!profile) {
        await createSchoolProfile(user.id);
      }
      
      const [loadedSubjects, loadedTopics] = await Promise.all([
        getSubjects(user.id),
        getAllTopics(user.id),
      ]);
      setSubjects(loadedSubjects);
      setTopics(loadedTopics);
    } catch (error) {
      console.error("Failed to load subjects and topics:", error);
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
    const handleDataChanged = () => {
      void loadData();
    };
    window.addEventListener(SUBJECTS_CHANGED_EVENT, handleDataChanged);
    window.addEventListener(TOPICS_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(SUBJECTS_CHANGED_EVENT, handleDataChanged);
      window.removeEventListener(TOPICS_CHANGED_EVENT, handleDataChanged);
    };
  }, [user, isAuthLoading]);

  // Group topics by subject ID
  const topicsBySubject = useMemo(() => {
    const map = new Map<string, Topic[]>();
    for (const topic of topics) {
      const list = map.get(topic.subjectId) ?? [];
      list.push(topic);
      map.set(topic.subjectId, list);
    }
    return map;
  }, [topics]);

  // If the current route is a TopicPage or SubjectPage, auto-expand that subject
  useEffect(() => {
    const topicMatch = location.pathname.match(/^\/subject\/([^/]+)\/topic\/([^/]+)/);
    if (topicMatch) {
      const activeSubjectId = topicMatch[1];
      setExpandedSubjectIds((prev) => {
        if (prev.has(activeSubjectId)) return prev;
        const next = new Set(prev);
        next.add(activeSubjectId);
        return next;
      });
    }
  }, [location.pathname]);

  const toggleSubjectExpanded = (subjectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  };

  // Close mobile drawer on route change
  useEffect(() => {
    if (isMobileOpen && onMobileClose) {
      onMobileClose();
    }
  }, [location.pathname]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!isMobileOpen || !onMobileClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onMobileClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onMobileClose]);

  const handleAddSubject = async (name: string) => {
    if (!user) return;
    const position = subjects.length > 0 ? subjects[subjects.length - 1].position + 1 : 0;
    await createSubject(user.id, name, position);
    notifySubjectsChanged();
    await loadData();
  };

  const handleLinkClick = () => {
    if (isMobileOpen && onMobileClose) {
      onMobileClose();
    }
  };

  const renderNavContent = () => (
    <div className="p-4 flex-1 overflow-y-auto">
      <div className="mb-6">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
          Meine Schule
        </h3>
        <nav className="space-y-0.5">
          <NavLink
            to="/"
            end
            onClick={handleLinkClick}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                isActive ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )
            }
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Alle Dateien</span>
          </NavLink>
          <NavLink
            to="/learn"
            onClick={handleLinkClick}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                isActive ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )
            }
          >
            <GraduationCap className="w-4 h-4 shrink-0" />
            <span>Lernen</span>
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
            className="text-slate-400 hover:text-slate-600 transition-[background-color,color,transform] duration-150 active:scale-95 cursor-pointer p-1 rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
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
            subjects.map((subject) => {
              const subjectTopics = topicsBySubject.get(subject.id) ?? [];
              const hasTopics = subjectTopics.length > 0;
              const isExpanded = expandedSubjectIds.has(subject.id);
              const isSubjectRouteActive =
                location.pathname === `/subject/${subject.id}` ||
                location.pathname.startsWith(`/subject/${subject.id}/`);

              return (
                <div key={subject.id} className="space-y-0.5">
                  <div className="flex items-center group rounded-md transition-colors duration-150">
                    {/* Left: Main navigation area */}
                    <NavLink
                      to={`/subject/${subject.id}`}
                      onClick={handleLinkClick}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-[background-color,color] duration-150 flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                        location.pathname === `/subject/${subject.id}`
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : isSubjectRouteActive
                            ? "text-blue-900 font-medium hover:bg-slate-100/80"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <Folder
                        className={cn(
                          "w-4 h-4 shrink-0 transition-colors duration-150",
                          isSubjectRouteActive ? "text-blue-600" : "text-slate-400"
                        )}
                      />
                      <span className="truncate">{subject.name}</span>
                    </NavLink>

                    {/* Right: Reserved toggle chevron button */}
                    {hasTopics ? (
                      <button
                        type="button"
                        onClick={(e) => toggleSubjectExpanded(subject.id, e)}
                        className={cn(
                          "w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 transition-[transform,color,background-color] duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                        )}
                        aria-expanded={isExpanded}
                        aria-label={`${subject.name} Themen ${isExpanded ? 'einklappen' : 'ausklappen'}`}
                        title={isExpanded ? 'Einklappen' : 'Ausklappen'}
                      >
                        <ChevronRight
                          className={cn(
                            "w-3.5 h-3.5 transition-transform duration-150",
                            isExpanded && "rotate-90 text-slate-600"
                          )}
                        />
                      </button>
                    ) : (
                      <div className="w-7 h-7 shrink-0" aria-hidden="true" />
                    )}
                  </div>

                  {/* Expanded Topics List */}
                  {hasTopics && isExpanded && (
                    <div className="pl-6 pr-1 py-0.5 space-y-0.5 border-l-2 border-slate-100 ml-4">
                      {subjectTopics.map((topic) => {
                        const isTopicActive =
                          location.pathname === `/subject/${subject.id}/topic/${topic.id}`;

                        return (
                          <NavLink
                            key={topic.id}
                            to={`/subject/${subject.id}/topic/${topic.id}`}
                            onClick={handleLinkClick}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1 text-xs rounded-md transition-[background-color,color] duration-150 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                              isTopicActive
                                ? "bg-blue-50 text-blue-700 font-semibold"
                                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-normal"
                            )}
                          >
                            <span className="truncate">{topic.name}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </nav>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar: stays unchanged on md screens and up */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-slate-200 flex-col shrink-0">
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer: visible on < md when toggled */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs animate-backdrop-fade"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          {/* Drawer content */}
          <aside className="relative w-72 max-w-[80vw] h-full bg-white flex flex-col shadow-2xl border-r border-slate-200 z-10 animate-drawer-slide">
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 shrink-0">
              <Link
                to="/"
                onClick={handleLinkClick}
                className="flex items-center gap-2 text-slate-900 hover:opacity-90 transition-opacity"
              >
                <BookOpen className="w-5 h-5 text-blue-600 shrink-0" />
                <span className="font-semibold text-sm whitespace-nowrap">Meine Schule</span>
              </Link>
              <button
                type="button"
                onClick={onMobileClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                aria-label="Navigation schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNavContent()}
          </aside>
        </div>
      )}

      <NameDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSubmit={handleAddSubject}
        title="Neues Fach"
        submitLabel="Fach hinzufügen"
      />
    </>
  );
}
