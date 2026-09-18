/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MainLayout } from './ui/layouts/MainLayout';
import { Home } from './ui/pages/Home';
import { SubjectPage } from './ui/pages/SubjectPage';
import { TopicPage } from './ui/pages/TopicPage';
import { LearnPage } from './ui/pages/LearnPage';
import { ProfilePage } from './ui/pages/ProfilePage';
import { LandingPage } from './ui/pages/LandingPage';
import { AuthProvider, useAuth } from './infrastructure/auth/AuthContext';

// Lazy-loaded so the main bundle doesn't pay for pdf.js + Tesseract.js:
// the document viewer and the inspection development tool are optional flows.
const PdfInspectPage = lazy(() =>
  import('./ui/pages/PdfInspectPage').then((module) => ({ default: module.PdfInspectPage })),
);
const DocumentViewerPage = lazy(() =>
  import('./ui/pages/DocumentViewerPage').then((module) => ({
    default: module.DocumentViewerPage,
  })),
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    // Unauthenticated user at root sees the public Landing Page
    if (location.pathname === '/') {
      return <LandingPage />;
    }
    // Unauthenticated deep link access is routed to root Landing Page preserving target
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public landing route directly accessible */}
          <Route path="landing" element={<LandingPage />} />

          {/* Authenticated workspace routes */}
          <Route path="/" element={<RequireAuth><MainLayout /></RequireAuth>}>
            <Route index element={<Home />} />
            <Route path="learn" element={<LearnPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="subject/:subjectId" element={<SubjectPage />} />
            <Route path="subject/:subjectId/topic/:topicId" element={<TopicPage />} />
            <Route
              path="document/:documentId"
              element={
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center min-h-[400px]">
                      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                    </div>
                  }
                >
                  <DocumentViewerPage />
                </Suspense>
              }
            />
            {/* Development tool for the local PDF inspection pipeline (not in the sidebar). */}
            <Route
              path="pdf-inspect"
              element={
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center min-h-[400px]">
                      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
                    </div>
                  }
                >
                  <PdfInspectPage />
                </Suspense>
              }
            />
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
