import React, { useState } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  Sparkles,
  BookOpen,
  GraduationCap,
  Folder,
  Upload,
  Check,
} from 'lucide-react';
import { useTranslation } from '../../../shared/i18n/LanguageContext';
import { cn } from '../../../shared/utils/cn';
import logoIconUrl from '../../../assets/logo-icon.png';

export function ProductPreviewWindow() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'workspace' | 'learn' | 'analysis'>('workspace');

  // Interactive Quiz state in Tab 2
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(1); // default option 1 selected to show evidence
  const [isQuizRevealed, setIsQuizRevealed] = useState(true);

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Tab Switcher above the window */}
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 px-2 overflow-x-auto py-1">
        <button
          type="button"
          onClick={() => setActiveTab('workspace')}
          className={cn(
            'inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 border cursor-pointer select-none shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
            activeTab === 'workspace'
              ? 'bg-white border-slate-300 text-blue-700 shadow-xs font-semibold'
              : 'bg-slate-100/80 hover:bg-white border-transparent text-slate-600 hover:text-slate-900',
          )}
        >
          <Folder className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
          <span>{t('landing.preview.tabWorkspace')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('learn')}
          className={cn(
            'inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 border cursor-pointer select-none shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
            activeTab === 'learn'
              ? 'bg-white border-slate-300 text-blue-700 shadow-xs font-semibold'
              : 'bg-slate-100/80 hover:bg-white border-transparent text-slate-600 hover:text-slate-900',
          )}
        >
          <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
          <span>{t('landing.preview.tabLearn')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analysis')}
          className={cn(
            'inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 border cursor-pointer select-none shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
            activeTab === 'analysis'
              ? 'bg-white border-slate-300 text-blue-700 shadow-xs font-semibold'
              : 'bg-slate-100/80 hover:bg-white border-transparent text-slate-600 hover:text-slate-900',
          )}
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
          <span>{t('landing.preview.tabAnalysis')}</span>
        </button>
      </div>

      {/* Main Desktop Window Mockup */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-xl sm:shadow-2xl shadow-slate-200/60 overflow-hidden transition-all duration-200">
        {/* Window Chrome / Title Bar */}
        <div className="h-10 sm:h-11 bg-slate-100/90 border-b border-slate-200 px-3 sm:px-4 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-slate-300/80" />
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-slate-300/80" />
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-slate-300/80" />
            </div>
            <div className="hidden sm:flex items-center gap-2 ml-4 pl-3 border-l border-slate-200 text-xs font-medium text-slate-500">
              <img src={logoIconUrl} alt="Materia" className="w-3.5 h-3.5 object-contain" />
              <span className="font-semibold text-slate-900">Materia</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-semibold">
                {activeTab === 'workspace' && t('landing.preview.pathAllFiles')}
                {activeTab === 'learn' && t('landing.preview.pathLearn')}
                {activeTab === 'analysis' && t('landing.preview.pathAnalysis')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              {t('landing.preview.workspaceSynchronized')}
            </span>
          </div>
        </div>

        {/* Window Content Area */}
        <div className="p-3 sm:p-6 bg-[#F9FAFB] min-h-[380px] sm:min-h-[460px] flex flex-col justify-start">
          {/* TAB 1: WORKSPACE & DOCUMENTS */}
          {activeTab === 'workspace' && (
            <div className="space-y-4 sm:space-y-5 animate-fadeIn">
              {/* Header inside mockup */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-slate-900">
                    {t('landing.preview.allFiles')}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    {t('landing.preview.stats')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium shadow-2xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t('landing.preview.uploadDoc')}</span>
                  </div>
                </div>
              </div>

              {/* Filters bar mockup */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <div className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-500 truncate">
                    {t('landing.preview.searchDocsPlaceholder')}
                  </div>
                </div>
                <div className="px-2.5 py-1.5 text-xs rounded-md border border-blue-200 bg-blue-50/60 text-blue-900 font-medium">
                  {t('landing.preview.filterSubject')}
                </div>
                <div className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-700">
                  {t('landing.preview.filterTopic')}
                </div>
              </div>

              {/* Document List Items */}
              <div className="space-y-2">
                {/* Document Card 1 */}
                <div className="p-3 sm:p-3.5 bg-white border border-slate-200/90 rounded-lg shadow-2xs hover:border-slate-300 transition-colors flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {t('landing.preview.doc1Title')}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                          {t('landing.organization.worksheetBadge')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-medium text-slate-700">{t('landing.preview.doc1MetaSubject')}</span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span>{t('landing.preview.doc1MetaTopic')}</span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span>{t('landing.preview.doc1MetaDetails')}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
                      <Check className="w-3 h-3" />
                      <span>{t('landing.preview.readyToLearn')}</span>
                    </span>
                  </div>
                </div>

                {/* Document Card 2 */}
                <div className="p-3 sm:p-3.5 bg-white border border-slate-200/90 rounded-lg shadow-2xs hover:border-slate-300 transition-colors flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {t('landing.preview.doc2Title')}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {t('documents.types.script')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-medium text-slate-700">{t('landing.preview.doc2MetaSubject')}</span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span>{t('landing.preview.doc2MetaTopic')}</span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span>{t('landing.preview.doc2MetaDetails')}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
                      <Check className="w-3 h-3" />
                      <span>{t('landing.preview.readyToLearn')}</span>
                    </span>
                  </div>
                </div>

                {/* Routing Recommendation Callout */}
                <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-lg flex items-start gap-2.5 text-xs text-slate-700">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-blue-950">
                      {t('landing.preview.intelligentRoutingActive')}
                    </span>{' '}
                    {t('landing.preview.intelligentRoutingDesc')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE LEARNING (QUIZ) */}
          {activeTab === 'learn' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Quiz Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t('landing.preview.quizHeader')}
                  </span>
                  <span className="text-[11px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                    {t('landing.preview.quizSubject')}
                  </span>
                  <span className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    {t('landing.preview.quizDifficulty')}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{t('landing.preview.quizModeLabel')}</div>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-slate-200/70 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full w-1/5" />
              </div>

              {/* Question Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
                <h4 className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">
                  {t('landing.preview.quizQuestion')}
                </h4>

                {/* Multiple choice options */}
                <div className="space-y-2">
                  {[
                    t('landing.preview.quizOption1'),
                    t('landing.preview.quizOption2'),
                    t('landing.preview.quizOption3'),
                    t('landing.preview.quizOption4'),
                  ].map((option, idx) => {
                    const isSelected = selectedQuizOption === idx;
                    const isCorrect = idx === 1;

                    let style = 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50';
                    if (isQuizRevealed) {
                      if (isCorrect) {
                        style = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-medium';
                      } else if (isSelected && !isCorrect) {
                        style = 'border-red-500 bg-red-50 text-red-950';
                      } else {
                        style = 'border-slate-200 bg-slate-50/50 text-slate-400 opacity-60';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedQuizOption(idx);
                          setIsQuizRevealed(true);
                        }}
                        className={cn(
                          'w-full p-3 rounded-lg border text-left text-xs sm:text-sm transition-all flex items-center justify-between gap-2.5 cursor-pointer',
                          style,
                        )}
                      >
                        <span className="flex-1">{option}</span>
                        {isQuizRevealed && isCorrect && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Evidence citation from user's document */}
                {isQuizRevealed && (
                  <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-lg text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-blue-900">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span>{t('landing.preview.evidenceTitle')}</span>
                    </div>
                    <p className="text-slate-700 italic">
                      {t('landing.preview.quizEvidence')}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium pt-0.5">
                      {t('landing.preview.quizSource')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DOCUMENT ANALYSIS & OCR */}
          {activeTab === 'analysis' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
                {/* Modal Title inside mockup */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        {t('landing.preview.analysisTitle')}
                      </h4>
                      <p className="text-xs text-slate-500 truncate">
                        {t('landing.preview.analysisDocName')}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                    {t('landing.organization.worksheetBadge')}
                  </span>
                </div>

                {/* Summary */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('landing.preview.analysisSummaryTitle')}
                  </span>
                  <p className="text-xs sm:text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200/70 leading-relaxed">
                    {t('landing.preview.analysisSummaryText')}
                  </p>
                </div>

                {/* Key Topics Badges */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('landing.preview.analysisKeyTopicsTitle')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      t('landing.preview.topic1'),
                      t('landing.preview.topic2'),
                      t('landing.preview.topic3'),
                      t('landing.preview.topic4'),
                      t('landing.preview.topic5'),
                      t('landing.preview.topic6'),
                    ].map((topic, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200/60"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Document Structure & OCR Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
                    <span className="font-semibold text-slate-700 block mb-0.5">
                      {t('landing.preview.outlineStructure')}
                    </span>
                    <span className="text-slate-600">
                      {t('landing.preview.outlineDetails')}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-emerald-200/60 bg-emerald-50/50 text-xs">
                    <span className="font-semibold text-emerald-900 block mb-0.5">
                      {t('landing.preview.ocrStatusTitle')}
                    </span>
                    <span className="text-emerald-800">
                      {t('landing.preview.ocrStatusDetails')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
