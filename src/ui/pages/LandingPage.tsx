import React, { useEffect } from 'react';
import { LandingNavbar } from '../components/landing/LandingNavbar';
import { LandingHero } from '../components/landing/LandingHero';
import { WorkflowSection } from '../components/landing/WorkflowSection';
import { OrganizationSection } from '../components/landing/OrganizationSection';
import { LearnShowcaseSection } from '../components/landing/LearnShowcaseSection';
import { TrustSection } from '../components/landing/TrustSection';
import { FinalCtaSection } from '../components/landing/FinalCtaSection';
import { LandingFooter } from '../components/landing/LandingFooter';

export function LandingPage() {
  useEffect(() => {
    // Set landing page document title
    const originalTitle = document.title;
    document.title = 'Materia — Digitaler Schul-Workspace';
    return () => {
      document.title = originalTitle;
    };
  }, []);

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
