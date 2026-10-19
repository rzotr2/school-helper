import React, { useEffect } from 'react';
import { LandingNavbar } from '../components/landing/LandingNavbar';
import { LandingHero } from '../components/landing/LandingHero';
import { WorkflowSection } from '../components/landing/WorkflowSection';
import { OrganizationSection } from '../components/landing/OrganizationSection';
import { LearnShowcaseSection } from '../components/landing/LearnShowcaseSection';
import { TrustSection } from '../components/landing/TrustSection';
import { FinalCtaSection } from '../components/landing/FinalCtaSection';
import { LandingFooter } from '../components/landing/LandingFooter';
import { useTranslation } from '../../shared/i18n';

export function LandingPage() {
  const { t } = useTranslation();

  useEffect(() => {
    // Set landing page document title
    const originalTitle = document.title;
    document.title = t('landing.title');
    return () => {
      document.title = originalTitle;
    };
  }, [t]);

  return (
    <div className="min-h-screen bg-[#FDFEFE] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      <LandingNavbar />
      <main>
        <LandingHero />
        <WorkflowSection />
        <OrganizationSection />
        <LearnShowcaseSection />
        <TrustSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
