import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  BarChart2,
  ArrowRight,
  User,
  LogOut,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../../infrastructure/auth/AuthContext';
import { getSubjects, type Subject } from '../../application/use-cases/subjects';
import { getAllTopics, type Topic } from '../../application/use-cases/topics';
import { useLearningProgress } from '../hooks/useLearningProgress';
import { formatLearningStateLabel } from '../../application/use-cases/learning/learningProgress';
import { cn } from '../../shared/utils/cn';
import { Button } from '../components/Button';

export function ProfilePage() {
  const { user, logOut } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isTaxonomyLoading, setIsTaxonomyLoading] = useState(true);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        setIsTaxonomyLoading(true);
        const [loadedSubjects, loadedTopics] = await Promise.all([
          getSubjects(user.id),
          getAllTopics(user.id),
        ]);
        setSubjects(loadedSubjects);
        setTopics(loadedTopics);
      } catch (err) {
        console.error('Failed to load profile taxonomy data:', err);
      } finally {
        setIsTaxonomyLoading(false);
      }
    }
    void loadData();
  }, [user]);

  const {
    isLoading: isProgressLoading,
    globalProgress,
    getSubjectProgress,
    recentHistory,
  } = useLearningProgress(user?.id, { subjects, topics });

  const initials = user?.email
    ? user.email
        .split('@')[0]
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const isLoading = isTaxonomyLoading || isProgressLoading;

  const visibleHistory = showAllHistory ? recentHistory : recentHistory.slice(0, 5);

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Profile Header */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 font-semibold text-lg flex items-center justify-center border border-blue-200 shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 truncate">
                {user?.email ?? 'Benutzer'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Materia Lernprofil · Angemeldet
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              to="/learn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Jetzt lernen</span>
            </Link>
            <button
              onClick={logOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-xs font-medium rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              title="Abmelden"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Abmelden</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Learning Statistics */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Gesamtübersicht
          </h2>
          {globalProgress.lastStudiedAt && (
            <span className="text-xs text-slate-500">
              Zuletzt aktiv:{' '}
              {new Date(globalProgress.lastStudiedAt).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Übungen absolviert */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium mb-1">Übungen</div>
            <div className="text-2xl font-bold text-slate-900">
              {isLoading ? '-' : globalProgress.totalExercises}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Absolviert</div>
          </div>

          {/* Richtig */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
            <div className="text-xs text-emerald-600 font-medium mb-1">Richtig</div>
            <div className="text-2xl font-bold text-emerald-700">
              {isLoading ? '-' : globalProgress.correctExercises}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Aufgaben gelöst</div>
          </div>

          {/* Falsch */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium mb-1">Wiederholen</div>
            <div className="text-2xl font-bold text-slate-700">
              {isLoading ? '-' : globalProgress.incorrectExercises}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Falsch beantwortet</div>
          </div>

          {/* Trefferquote */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
            <div className="text-xs text-blue-600 font-medium mb-1">Trefferquote</div>
            <div className="text-2xl font-bold text-blue-700">
              {isLoading
                ? '-'
                : globalProgress.accuracyPercentage !== null
                  ? `${globalProgress.accuracyPercentage}%`
                  : '-'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {globalProgress.accuracyPercentage !== null ? 'Erfolgsquote' : 'Keine Übungen'}
            </div>
          </div>

          {/* Themen gelernt */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium mb-1">Themen</div>
            <div className="text-2xl font-bold text-slate-900">
              {isLoading ? '-' : globalProgress.topicsLearnedCount}
              <span className="text-sm font-normal text-slate-400 ml-1">
                /{globalProgress.totalTopicsCount}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Bearbeitet</div>
          </div>

          {/* Fächer aktiv */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs">
            <div className="text-xs text-slate-500 font-medium mb-1">Fächer</div>
            <div className="text-2xl font-bold text-slate-900">
              {isLoading ? '-' : globalProgress.subjectsLearnedCount}
              <span className="text-sm font-normal text-slate-400 ml-1">
                /{globalProgress.totalSubjectsCount}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Mit Lernaktivität</div>
          </div>
        </div>
      </section>

      {/* Progress by Subject */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Lernfortschritt nach Fächern
          </h2>
          <span className="text-xs text-slate-500">
            {subjects.length} {subjects.length === 1 ? 'Fach' : 'Fächer'}
          </span>
        </div>

        {subjects.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200/90 rounded-xl p-8 text-center">
            <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-800">Noch keine Fächer angelegt</p>
            <p className="text-xs text-slate-500 mt-1">
              Erstelle ein Fach in der Seitenleiste, um Unterlagen hochzuladen und zu lernen.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {subjects.map((subject) => {
              const prog = getSubjectProgress(subject.id);
              const hasActivity = prog.completedExercises > 0;

              return (
                <div
                  key={subject.id}
                  className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs transition-[border-color,box-shadow] hover:border-slate-300"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                        <BookOpen className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/subject/${subject.id}`}
                            className="font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate text-sm sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded-sm"
                          >
                            {subject.name}
                          </Link>
                          {/* State badge */}
                          <span
                            className={cn(
                              'text-[11px] font-medium px-2 py-0.5 rounded border',
                              prog.learningState === 'sicher'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : prog.learningState === 'ueben'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : prog.learningState === 'wiederholen'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200',
                            )}
                          >
                            {formatLearningStateLabel(prog.learningState)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {hasActivity
                            ? `${prog.completedExercises} Übungen · ${prog.correctExercises} richtig (${prog.accuracyPercentage}%) · ${prog.topicsLearnedCount} von ${prog.totalTopicsCount} Themen bearbeitet`
                            : `Noch nicht gelernt · ${prog.totalTopicsCount} ${prog.totalTopicsCount === 1 ? 'Thema' : 'Themen'}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <Link
                        to={`/learn?subjectId=${subject.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        <span>Fach üben</span>
                      </Link>
                      <Link
                        to={`/subject/${subject.id}`}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Fach anzeigen"
                        aria-label={`Fach "${subject.name}" anzeigen`}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        prog.learningState === 'sicher'
                          ? 'bg-emerald-500'
                          : prog.learningState === 'ueben'
                            ? 'bg-amber-500'
                            : prog.learningState === 'wiederholen'
                              ? 'bg-rose-500'
                              : 'bg-slate-200',
                      )}
                      style={{
                        width: hasActivity ? `${prog.accuracyPercentage}%` : '0%',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Learning History (Lernverlauf) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
            Lernverlauf
          </h2>
          {recentHistory.length > 0 && (
            <span className="text-xs text-slate-500">
              {recentHistory.length} {recentHistory.length === 1 ? 'Session' : 'Sessions'}
            </span>
          )}
        </div>

        {recentHistory.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200/90 rounded-xl p-10 text-center">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <BarChart2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Noch keine Lernaktivität
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4 leading-relaxed">
              Bearbeite deine erste Übung, um hier deinen Lernfortschritt und Verlauf zu sehen.
            </p>
            <Link
              to="/learn"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-2xs transition-colors"
            >
              <GraduationCap className="w-4 h-4" />
              <span>Erste Übung starten</span>
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-xl divide-y divide-slate-100 shadow-2xs overflow-hidden">
            {visibleHistory.map((item) => (
              <div
                key={item.sessionId}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/80 text-slate-600 flex items-center justify-center shrink-0 text-xs font-semibold">
                    {item.exerciseTypeLabel.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-semibold text-slate-900 truncate">
                        {item.topicName}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 truncate">{item.subjectName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-[11px] font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200/70">
                        {item.exerciseTypeLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>
                        {item.dateLabel} um {item.timeLabel} Uhr
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-900 block">
                      {item.correctCount} / {item.exerciseCount} richtig
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {item.accuracyPercentage}% Trefferquote
                    </span>
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded font-medium border',
                      item.accuracyPercentage >= 80
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : item.accuracyPercentage >= 50
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200',
                    )}
                  >
                    {item.accuracyPercentage >= 80
                      ? 'Sicher'
                      : item.accuracyPercentage >= 50
                        ? 'Üben'
                        : 'Wiederholen'}
                  </span>
                </div>
              </div>
            ))}

            {recentHistory.length > 5 && (
              <div className="p-3 bg-slate-50/50 text-center border-t border-slate-100">
                <button
                  onClick={() => setShowAllHistory((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer py-1 px-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  {showAllHistory ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Weniger anzeigen</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Alle {recentHistory.length} Sessions anzeigen</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
