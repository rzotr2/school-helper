import React, { useState } from 'react';
import {
  GraduationCap,
  CheckCircle2,
  RotateCcw,
  BookOpen,
  GitCompare,
  LayoutGrid,
  FileText,
} from 'lucide-react';
import { useTranslation } from '../../../shared/i18n/LanguageContext';
import { cn } from '../../../shared/utils/cn';

type Mode = 'quiz' | 'flashcards' | 'fill-blank' | 'matching' | 'word-bank';

export function LearnShowcaseSection() {
  const { t } = useTranslation();
  const [selectedMode, setSelectedMode] = useState<Mode>('quiz');

  // Flashcard flip interaction
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  // Fill in the blank interactive input
  const [fillBlankInput, setFillBlankInput] = useState('Fixkauf');
  const [isFillBlankChecked, setIsFillBlankChecked] = useState(true);

  // Matching interaction
  const [selectedLeft, setSelectedLeft] = useState<number | null>(0);
  const [matchedPairs, setMatchedPairs] = useState<number[]>([0]);

  // Word Bank interaction
  const [wordBankPlaced, setWordBankPlaced] = useState<string>('');

  const currentWordBankPlaced = wordBankPlaced || t('landing.showcase.defaultPlacedWord');

  return (
    <section id="lernmodi" className="py-16 sm:py-24 px-4 sm:px-6 bg-slate-50/70 border-t border-slate-200/80">
      <div className="max-w-5xl mx-auto space-y-10 sm:space-y-12">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
            {t('landing.showcase.badge')}
          </span>
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight mt-3 mb-2">
            {t('landing.showcase.title')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            {t('landing.showcase.subtitle')}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center justify-start sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto pb-2 px-1">
          {[
            { id: 'quiz', label: t('landing.showcase.tabQuiz'), icon: GraduationCap },
            { id: 'flashcards', label: t('landing.showcase.tabFlashcards'), icon: RotateCcw },
            { id: 'fill-blank', label: t('landing.showcase.tabFillBlank'), icon: FileText },
            { id: 'matching', label: t('landing.showcase.tabMatching'), icon: GitCompare },
            { id: 'word-bank', label: t('landing.showcase.tabWordBank'), icon: LayoutGrid },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = selectedMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedMode(item.id as Mode)}
                className={cn(
                  'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 border cursor-pointer select-none shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
                  isActive
                    ? 'bg-white border-blue-300 text-blue-700 shadow-xs font-semibold'
                    : 'bg-white/80 hover:bg-white border-slate-200 text-slate-600 hover:text-slate-900',
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', isActive ? 'text-blue-600' : 'text-slate-400')} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Interactive Mode Demonstration Container */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-8 max-w-3xl mx-auto">
          {/* 1. QUIZ MODE */}
          {selectedMode === 'quiz' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                <span className="font-semibold text-slate-500 uppercase tracking-wider">
                  {t('landing.showcase.quizHeader')}
                </span>
                <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  {t('landing.showcase.quizSampleTopic')}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
                {t('landing.showcase.quizQuestion')}
              </h3>

              <div className="space-y-2">
                <div className="p-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-500 bg-slate-50/50">
                  {t('landing.showcase.quizOption1')}
                </div>
                <div className="p-3.5 rounded-xl border border-emerald-500 bg-emerald-50 text-xs sm:text-sm text-emerald-950 font-medium flex items-center justify-between">
                  <span>{t('landing.showcase.quizOption2')}</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-500 bg-slate-50/50">
                  {t('landing.showcase.quizOption3')}
                </div>
              </div>

              <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-blue-900">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t('landing.showcase.evidenceTitle')}</span>
                </div>
                <p className="text-slate-700 italic">
                  {t('landing.showcase.quizEvidenceText')}
                </p>
                <p className="text-[11px] text-slate-500">
                  {t('landing.showcase.quizEvidenceSource')}
                </p>
              </div>
            </div>
          )}

          {/* 2. FLASHCARDS (KARTEIKARTEN) */}
          {selectedMode === 'flashcards' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                <span className="font-semibold text-slate-500 uppercase tracking-wider">
                  {t('landing.showcase.flashcardsHeader', {
                    side: isCardFlipped ? t('landing.showcase.flashcardsBack') : t('landing.showcase.flashcardsFront')
                  })}
                </span>
                <span className="text-slate-400">{t('landing.showcase.clickToFlip')}</span>
              </div>

              <div
                onClick={() => setIsCardFlipped(!isCardFlipped)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsCardFlipped(!isCardFlipped);
                  }
                }}
                className="min-h-[200px] sm:min-h-[230px] p-6 sm:p-8 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 bg-slate-50/50 hover:bg-white transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-3"
              >
                {!isCardFlipped ? (
                  <>
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider bg-blue-50 px-2.5 py-0.5 rounded-full">
                      {t('landing.showcase.questionLabel')}
                    </span>
                    <h3 className="text-lg sm:text-xl font-semibold text-slate-900 max-w-lg">
                      {t('landing.showcase.flashcardQuestion')}
                    </h3>
                    <p className="text-xs text-slate-400 pt-2">
                      {t('landing.showcase.clickToRevealAnswer')}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2.5 py-0.5 rounded-full">
                      {t('landing.showcase.answerLabel')}
                    </span>
                    <p className="text-base sm:text-lg font-medium text-slate-900 max-w-lg leading-relaxed">
                      {t('landing.showcase.flashcardAnswer')}
                    </p>
                    <div className="text-xs text-slate-500 pt-2 italic">
                      {t('landing.showcase.flashcardCitation')}
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsCardFlipped(!isCardFlipped)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isCardFlipped ? t('landing.showcase.backToQuestion') : t('landing.showcase.revealAnswer')}</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. FILL-IN-THE-BLANK (LÜCKENTEXT) */}
          {selectedMode === 'fill-blank' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                <span className="font-semibold text-slate-500 uppercase tracking-wider">
                  {t('landing.showcase.fillBlankHeader')}
                </span>
                <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  {t('landing.showcase.fillBlankTopic')}
                </span>
              </div>

              <div className="p-4 sm:p-5 bg-slate-50 rounded-xl border border-slate-200/80 text-sm sm:text-base text-slate-800 leading-relaxed">
                {t('landing.showcase.fillBlankSentencePart1')}
                <span className="inline-block px-2.5 py-0.5 bg-white border border-emerald-500 rounded font-semibold text-emerald-950 shadow-2xs">
                  {t('landing.showcase.fillBlankWord')}
                </span>
                {t('landing.showcase.fillBlankSentencePart2')}
              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200/60 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{t('landing.showcase.fillBlankSuccess')}</span>
              </div>
            </div>
          )}

          {/* 4. MATCHING (ZUORDNEN) */}
          {selectedMode === 'matching' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                <span className="font-semibold text-slate-500 uppercase tracking-wider">
                  {t('landing.showcase.matchingHeader')}
                </span>
                <span className="text-slate-500">{t('landing.showcase.matchingProgress')}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="space-y-2">
                  <div className="p-3 rounded-lg border border-emerald-400 bg-emerald-50 text-emerald-950 font-medium flex items-center justify-between">
                    <span>{t('landing.showcase.termReminder')}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="p-3 rounded-lg border border-blue-300 bg-blue-50/50 text-blue-900 font-medium">
                    {t('landing.showcase.termGracePeriod')}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="p-3 rounded-lg border border-emerald-400 bg-emerald-50 text-emerald-950 font-medium flex items-center justify-between">
                    <span>{t('landing.showcase.defReminder')}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 bg-white text-slate-700">
                    {t('landing.showcase.defGracePeriod')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. WORD BANK (WORTBANK) */}
          {selectedMode === 'word-bank' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 text-xs">
                <span className="font-semibold text-slate-500 uppercase tracking-wider">
                  {t('landing.showcase.wordBankHeader')}
                </span>
                <span className="text-slate-500">{t('landing.showcase.wordBankInstruction')}</span>
              </div>

              <div className="p-4 sm:p-5 bg-slate-50 rounded-xl border border-slate-200/80 text-sm sm:text-base text-slate-800 leading-relaxed">
                {t('landing.showcase.wordBankSentencePart1')}
                <span className="inline-block px-2.5 py-0.5 bg-blue-100 text-blue-950 border border-blue-300 rounded font-semibold text-xs sm:text-sm shadow-2xs">
                  {currentWordBankPlaced}
                </span>
                {t('landing.showcase.wordBankSentencePart2')}
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('landing.showcase.availableTokens')}
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    t('landing.showcase.token1'),
                    t('landing.showcase.token2'),
                    t('landing.showcase.token3'),
                    t('landing.showcase.token4'),
                  ].map(
                    (word, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setWordBankPlaced(word)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                          currentWordBankPlaced === word
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                        )}
                      >
                        {word}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
