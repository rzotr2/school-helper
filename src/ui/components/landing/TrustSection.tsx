import React from 'react';
import { ShieldCheck, FileText, CheckCircle2, FolderTree, FileScan, GraduationCap } from 'lucide-react';
import { useTranslation } from '../../../shared/i18n';

export function TrustSection() {
  const { t } = useTranslation();

  const capabilities = [
    {
      icon: FolderTree,
      title: t('landing.trust.cap1Title'),
      description: t('landing.trust.cap1Desc'),
    },
    {
      icon: FileScan,
      title: t('landing.trust.cap2Title'),
      description: t('landing.trust.cap2Desc'),
    },
    {
      icon: GraduationCap,
      title: t('landing.trust.cap3Title'),
      description: t('landing.trust.cap3Desc'),
    },
    {
      icon: ShieldCheck,
      title: t('landing.trust.cap4Title'),
      description: t('landing.trust.cap4Desc'),
    },
  ];

  return (
    <section id="quellen" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-14 sm:space-y-16">
        {/* Grounded learning & sources spotlight */}
        <div className="bg-blue-50/50 rounded-2xl border border-blue-100 p-6 sm:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider bg-white px-2.5 py-1 rounded-md border border-blue-200/60 shadow-2xs">
                {t('landing.trust.badge')}
              </span>
              <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight leading-snug">
                {t('landing.trust.title')}
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                {t('landing.trust.description')}
              </p>
              <div className="pt-1 space-y-2 text-xs sm:text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{t('landing.trust.bullet1')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{t('landing.trust.bullet2')}</span>
                </div>
              </div>
            </div>

            {/* Source Card Visual */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-blue-200/80 p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5 text-blue-900 font-semibold">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t('landing.trust.verifiedSource')}</span>
                </span>
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px]">
                  {t('landing.trust.pageInDoc')}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 text-xs text-slate-700 leading-relaxed italic">
                {t('landing.trust.quote')}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>{t('landing.trust.documentLabel')}</span>
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {t('landing.trust.verifiedBadge')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Focused Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {capabilities.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <div
                key={i}
                className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs hover:border-slate-300 transition-colors space-y-2.5"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/60">
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                  {cap.title}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {cap.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
