import React from 'react';
import {
  Folder,
  Tag,
  FileText,
  Search,
  Sparkles,
  FileScan,
  CheckCircle2,
  ChevronRight,
  Layers,
} from 'lucide-react';

export function OrganizationSection() {
  return (
    <section id="funktionen" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-16 sm:space-y-20">
        {/* Sub-section 1: Hierarchy Fächer -> Themen -> Dokumente */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-5 space-y-4">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
              Organisation
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight leading-snug">
              Fächer, Themen und Dokumente klar strukturiert
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Schluss mit verteilten PDF-Dateien in Chatgruppen und Download-Ordnern. Materia bildet deine schulische Fächerstruktur sauber ab.
            </p>
            <ul className="space-y-2.5 pt-2 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Fächer & Themen:</strong> Eigene Schulfächer anlegen und mit Themen für bevorstehende Klausuren gliedern.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Intelligentes Routing:</strong> Beim Hochladen analysiert das System den Inhalt und schlägt das passende Thema vor.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Volltextsuche:</strong> Finde Fachbegriffe und Definitionen blitzschnell über alle verarbeiteten Unterlagen hinweg.
                </span>
              </li>
            </ul>
          </div>

          {/* Visual card showing the actual Fächer -> Themen -> Dokumente tree */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Akademische Struktur</span>
              <span className="text-slate-500 font-normal">Fächer & Themenbaum</span>
            </div>

            {/* Subject 1 */}
            <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/70 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Folder className="w-4 h-4 text-blue-600" />
                <span>Wirtschafts- und Sozialprozesse</span>
                <span className="text-xs font-normal text-slate-400 ml-auto">Fach</span>
              </div>
              <div className="pl-6 space-y-1.5 border-l-2 border-slate-200 ml-2">
                <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200/80 text-xs">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span>Kaufvertragsstörungen</span>
                  </div>
                  <span className="text-[11px] text-slate-500">3 Dokumente</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200/80 text-xs">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span>Arbeitsrecht & Kündigungsschutz</span>
                  </div>
                  <span className="text-[11px] text-slate-500">4 Dokumente</span>
                </div>
              </div>
            </div>

            {/* Subject 2 */}
            <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200/70 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Folder className="w-4 h-4 text-blue-600" />
                <span>Geschäftsprozesse</span>
                <span className="text-xs font-normal text-slate-400 ml-auto">Fach</span>
              </div>
              <div className="pl-6 space-y-1.5 border-l-2 border-slate-200 ml-2">
                <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200/80 text-xs">
                  <div className="flex items-center gap-2 font-medium text-slate-800">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span>Rechnungswesen & Buchungssätze</span>
                  </div>
                  <span className="text-[11px] text-slate-500">5 Dokumente</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-section 2: Document Intelligence & OCR */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center pt-8 border-t border-slate-200/80">
          {/* Visual card for Document Understanding */}
          <div className="lg:col-span-7 order-2 lg:order-1 bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileScan className="w-4 h-4 text-blue-600" />
                <span>Strukturierte Dokumentenanalyse</span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                Arbeitsblatt
              </span>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Extrahierte Zusammenfassung
              </div>
              <p className="text-xs sm:text-sm text-slate-700 bg-slate-50/80 p-3 rounded-lg border border-slate-200/60 leading-relaxed">
                Behandelt die Voraussetzungen des Annahmeverzugs nach § 293 BGB, das tatsächliche Angebot der Leistung sowie die Rechtsfolgen für den Gläubiger (Haftungserleichterung und Mehraufwendungsersatz).
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Erkannte Schlüsselbegriffe
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Annahmeverzug',
                  '§ 293 BGB',
                  'Tatsächliches Angebot',
                  'Mehraufwendungen',
                  'Haftungserleichterung',
                ].map((term, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200/60"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-medium text-slate-700">Texterkennung & Gliederung:</span>
              </div>
              <span className="text-slate-600 font-mono text-[11px]">
                Headings (#, ##) · Aufzählungen · OCR
              </span>
            </div>
          </div>

          <div className="lg:col-span-5 order-1 lg:order-2 space-y-4">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
              Inhalte verstehen
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight leading-snug">
              Dokumente verstehen, nicht nur ablegen
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Jedes hochgeladene PDF wird semantisch erfasst. Materia klassifiziert Dokumenttypen und bereitet Inhalte für das spätere Lernen auf.
            </p>
            <ul className="space-y-2.5 pt-2 text-sm text-slate-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Dokumententypen:</strong> Automatische Erkennung von Arbeitsblättern, Skripten, Zusammenfassungen und Klausuren.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Integrierte OCR-Texterkennung:</strong> Gescannte Handouts und Kopien werden direkt im Browser lesbar und durchsuchbar gemacht.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Kernkonzepte:</strong> Schneller Überblick über die wichtigsten Fachbegriffe vor jeder Lerneinheit.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
