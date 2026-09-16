/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './ui/layouts/MainLayout';
import { Home } from './ui/pages/Home';
import { SubjectPage } from './ui/pages/SubjectPage';
import { TopicPage } from './ui/pages/TopicPage';
import { AuthProvider, useAuth } from './infrastructure/auth/AuthContext';
import { Button } from './ui/components/Button';
import { BookOpen } from 'lucide-react';

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
  const { user, isLoading, signIn } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin"></div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center flex flex-col items-center">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-6">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Meine Schule</h1>
          <p className="text-sm text-slate-500 mb-8">
            Melde dich an, um auf deinen digitalen Schul-Workspace zuzugreifen.
          </p>
          <Button onClick={signIn} className="w-full">
            Mit Google anmelden
          </Button>
        </div>
      </div>
    );
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RequireAuth><MainLayout /></RequireAuth>}>
            <Route index element={<Home />} />
            <Route path="subject/:subjectId" element={<SubjectPage />} />
            <Route path="subject/:subjectId/topic/:topicId" element={<TopicPage />} />
            <Route
              path="document/:documentId"
              element={
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center min-h-[400px]">
                      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin"></div>
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
                      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin"></div>
                    </div>
                  }
                >
                  <PdfInspectPage />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
