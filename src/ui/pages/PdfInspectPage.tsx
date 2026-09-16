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
import type {
  PdfInspectionProgress,
  PdfInspectionResult,
} from '../../infrastructure/pdf/types';
import { Button } from '../components/Button';

const METHOD_LABELS: Record<PdfInspectionResult['extractionMethod'], string> = {
  'native-text': 'Textebene',
  ocr: 'OCR',
  mixed: 'Gemischt (Textebene + OCR)',
};

export function PdfInspectPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [result, setResult] = useState<PdfInspectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
              ? `OCR läuft: Seite ${progress.currentPage} von ${progress.ocrPageCount} (${progress.pageCount} Seiten insgesamt)`
              : `Text wird gelesen: Seite ${progress.currentPage} von ${progress.pageCount}`,
          );
        },
      });
      setResult(inspection);
    } catch (err: unknown) {
      if (err instanceof PdfCancellationError) {
        setError('Verarbeitung abgebrochen.');
      } else if (err instanceof PdfInspectionError) {
        setError(err.message);
      } else {
        setError('Ein unbekannter Fehler ist aufgetreten.');
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
          <h1 className="text-2xl font-semibold text-slate-900">PDF-Inspektion</h1>
          <p className="text-sm text-slate-500">
            Entwicklungswerkzeug: lokale Textextraktion und OCR, nichts verlässt den Browser.
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
          {isProcessing ? 'Verarbeitung läuft…' : 'PDF auswählen und inspizieren'}
        </Button>
        {isProcessing && (
          <Button variant="secondary" onClick={handleCancel}>
            Abbrechen
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500">Seiten</p>
              <p className="text-lg font-semibold text-slate-900">{result.pageCount}</p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500">Textmethode</p>
              <p className="text-lg font-semibold text-slate-900">
                {METHOD_LABELS[result.extractionMethod]}
              </p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500">Verwertbarer Text</p>
              <p className="text-lg font-semibold text-slate-900">
                {result.hasUsableText ? 'Ja' : 'Nein'}
              </p>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-slate-900">Seiten</h2>
            {result.pages.map((page) => (
              <div key={page.pageNumber} className="p-4 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-medium text-slate-900">Seite {page.pageNumber}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {page.extractionMethod === 'native-text' ? 'Textebene' : 'OCR'}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      page.quality.usable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {page.quality.usable
                      ? 'verwertbar'
                      : `nicht verwertbar: ${page.quality.reasons.join(', ')}`}
                  </span>
                </div>
                <pre className="text-xs text-slate-700 bg-slate-50 rounded p-3 max-h-48 overflow-auto whitespace-pre-wrap">
                  {page.text.trim() === '' ? '—' : page.text}
                </pre>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-slate-900">
              Annotationen ({result.annotations.length})
            </h2>
            {result.annotations.length === 0 ? (
              <p className="text-sm text-slate-500">Keine Annotationen gefunden.</p>
            ) : (
              <div className="space-y-2">
                {result.annotations.map((annotation, index) => (
                  <div key={index} className="p-3 bg-white border border-slate-200 rounded-lg text-sm">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium text-slate-900">
                        Seite {annotation.pageNumber}
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
                          Rechteck: x={annotation.rect.x}, y={annotation.rect.y},{' '}
                          {annotation.rect.width}×{annotation.rect.height}
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
