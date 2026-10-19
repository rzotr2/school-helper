/**
 * Development tool for the client-side PDF inspection pipeline.
 *
 * Not linked in the sidebar on purpose; reachable at /pdf-inspect while
 * signed in. Every file processed here stays in the browser: Tesseract.js
 * downloads its engine and language data, but the PDF and its content are
 * never sent anywhere.
 */
import React, { useRef, useState } from 'react';
import { FileSearch, Loader2 } from 'lucide-react';
import { PdfCancellationError, PdfInspectionError } from '../../infrastructure/pdf/errors';
import { inspectPdf } from '../../infrastructure/pdf/inspect';
import type { OcrStatus, PdfInspectionProgress, PdfInspectionResult } from '../../infrastructure/pdf/types';
import { Button } from '../components/Button';
import { useTranslation } from '../../shared/i18n';

export function PdfInspectPage() {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [result, setResult] = useState<PdfInspectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const getOcrStatusLabel = (status: OcrStatus): string => {
    switch (status) {
      case 'not-needed':
        return t('pdfInspect.ocrStatus.notNeeded');
      case 'pending':
        return t('pdfInspect.ocrStatus.pending');
      case 'processing':
        return t('pdfInspect.ocrStatus.processing');
      case 'completed':
        return t('pdfInspect.ocrStatus.completed');
      case 'failed':
        return t('pdfInspect.ocrStatus.failed');
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input so the same file can be selected again.
    event.target.value = '';
    if (!file) return;

    setResult(null);
    setError(null);
    setProgressText(null);
    setIsProcessing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const inspection = await inspectPdf(file, {
        signal: controller.signal,
        onProgress: (progress: PdfInspectionProgress) => {
          setProgressText(
            progress.phase === 'ocr'
              ? t('documents.processingProgress.ocrRunning', {
                  currentPage: progress.currentPage,
                  ocrPageCount: progress.ocrPageCount,
                  pageCount: progress.pageCount,
                })
              : t('documents.processingProgress.readingText', {
                  currentPage: progress.currentPage,
                  pageCount: progress.pageCount,
                }),
          );
        },
      });
      setResult(inspection);
    } catch (err: unknown) {
      if (err instanceof PdfCancellationError) {
        setError(t('pdfInspect.errorCancelled'));
      } else if (err instanceof PdfInspectionError) {
        setError(err.message);
      } else {
        setError(t('pdfInspect.errorUnknown'));
      }
    } finally {
      setIsProcessing(false);
      setProgressText(null);
      abortRef.current = null;
    }
  };

  const handleCancel = (): void => {
    abortRef.current?.abort();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-6">
        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
          <FileSearch className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('pdfInspect.title')}</h1>
          <p className="text-sm text-slate-500">
            {t('pdfInspect.subtitle')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
        <Button
          variant="primary"
          className="gap-2"
          disabled={isProcessing}
          onClick={() => fileInputRef.current?.click()}
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileSearch className="w-4 h-4" />
          )}
          {isProcessing ? t('pdfInspect.processing') : t('pdfInspect.selectAndInspect')}
        </Button>
        {isProcessing && (
          <Button variant="secondary" onClick={handleCancel}>
            {t('pdfInspect.cancel')}
          </Button>
        )}
        {progressText && <span className="text-sm text-slate-500">{progressText}</span>}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500">{t('pdfInspect.pages')}</p>
              <p className="text-lg font-semibold text-slate-900">{result.pageCount}</p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500">{t('pdfInspect.usableText')}</p>
              <p className="text-lg font-semibold text-slate-900">
                {result.hasUsableText ? t('pdfInspect.yes') : t('pdfInspect.no')}
              </p>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-slate-900">{t('pdfInspect.pages')}</h2>
            {result.pages.map((page) => (
              <div key={page.pageNumber} className="p-4 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-medium text-slate-900">{t('pdfInspect.pageLabel', { page: page.pageNumber })}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      page.quality.usable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {page.quality.usable
                      ? t('pdfInspect.textLayerUsable')
                      : t('pdfInspect.textLayerNotUsable', { reasons: page.quality.reasons.join(', ') })}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {getOcrStatusLabel(page.ocrStatus)}
                  </span>
                </div>
                <pre className="text-xs text-slate-700 bg-slate-50 rounded p-3 max-h-48 overflow-auto whitespace-pre-wrap">
                  {page.nativeText.trim() === '' ? '—' : page.nativeText}
                </pre>
                {page.ocrText !== null && (
                  <>
                    <p className="text-xs text-slate-500 mt-2 mb-1">{t('pdfInspect.ocrTextLabel')}</p>
                    <pre className="text-xs text-slate-700 bg-slate-50 rounded p-3 max-h-48 overflow-auto whitespace-pre-wrap">
                      {page.ocrText}
                    </pre>
                  </>
                )}
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-slate-900">
              {t('pdfInspect.annotations', { count: result.annotations.length })}
            </h2>
            {result.annotations.length === 0 ? (
              <p className="text-sm text-slate-500">{t('pdfInspect.noAnnotations')}</p>
            ) : (
              <div className="space-y-2">
                {result.annotations.map((annotation, index) => (
                  <div key={index} className="p-3 bg-white border border-slate-200 rounded-lg text-sm">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-slate-900">
                        {t('pdfInspect.pageLabel', { page: annotation.pageNumber })}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {annotation.type}
                      </span>
                      {annotation.subtype && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {annotation.subtype}
                        </span>
                      )}
                      {annotation.rect && (
                        <span className="text-xs text-slate-500">
                          {t('pdfInspect.rect', {
                            x: annotation.rect.x,
                            y: annotation.rect.y,
                            width: annotation.rect.width,
                            height: annotation.rect.height,
                          })}
                        </span>
                      )}
                    </div>
                    {annotation.content && <p className="text-slate-700">{annotation.content}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
