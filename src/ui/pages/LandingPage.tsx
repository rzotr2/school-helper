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
    const originalTitle = document.title;
    const title = t('landing.title');
    const description = t('landing.hero.description');
    document.title = title;

    const metaDesc = document.querySelector('meta[name="description"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDesc = document.querySelector('meta[name="twitter:description"]');

    if (metaDesc) metaDesc.setAttribute('content', description);
    if (ogTitle) ogTitle.setAttribute('content', title);
    if (ogDesc) ogDesc.setAttribute('content', description);
    if (twitterTitle) twitterTitle.setAttribute('content', title);
    if (twitterDesc) twitterDesc.setAttribute('content', description);

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
