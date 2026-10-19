import React from 'react';
import { Upload, FolderTree, FileCheck, GraduationCap } from 'lucide-react';
import { useTranslation } from '../../../shared/i18n/LanguageContext';

export function WorkflowSection() {
  const { t } = useTranslation();

  const steps = [
    {
      number: t('landing.workflow.step1Number'),
      icon: Upload,
      title: t('landing.workflow.step1Title'),
      description: t('landing.workflow.step1Desc'),
    },
    {
      number: t('landing.workflow.step2Number'),
      icon: FolderTree,
      title: t('landing.workflow.step2Title'),
      description: t('landing.workflow.step2Desc'),
    },
    {
      number: t('landing.workflow.step3Number'),
      icon: FileCheck,
      title: t('landing.workflow.step3Title'),
      description: t('landing.workflow.step3Desc'),
    },
    {
      number: t('landing.workflow.step4Number'),
      icon: GraduationCap,
      title: t('landing.workflow.step4Title'),
      description: t('landing.workflow.step4Desc'),
    },
  ];

  return (
    <section className="py-14 sm:py-20 bg-slate-50/70 border-y border-slate-200/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-14">
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
            {t('landing.workflow.badge')}
          </span>
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight mt-3 mb-2">
            {t('landing.workflow.title')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            {t('landing.workflow.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={index}
                className="relative bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/60">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 font-mono">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-1.5">
                    {step.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
