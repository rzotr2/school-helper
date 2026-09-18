import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Layers, ExternalLink, Loader2, MessageSquare } from 'lucide-react';
import type { DocumentContent } from '../../../application/use-cases/documentContent';
import { getDocumentSections } from '../../../application/use-cases/documentContent';
import { cn } from '../../../shared/utils/cn';

export interface DocumentStructureProps {
  /** The typed document content containing pages and optional sections. */
  content: DocumentContent | null | undefined;
  /** Optional document ID for page navigation. */
  documentId?: string;
  /** Optional callback when a page number reference is clicked. */
  onNavigateToPage?: (pageNumber: number) => void;
  /** Whether the document content is currently loading. */
  isLoading?: boolean;
  /** Additional CSS class names. */
  className?: string;
}

/**
 * Renders the deterministic document structure (sections & contained blocks).
 *
 * Requirements:
 * - Uses getDocumentSections(content) application accessor.
 * - Collapsible sections: first section expanded by default.
 * - Displays page ranges with clickable navigation when available.
 * - Renders block types: heading, paragraph, list without modifying text.
 * - Displays neutral message for OCR-only or legacy documents.
 */
export function DocumentStructure({
  content,
  documentId,
  onNavigateToPage,
  isLoading = false,
  className,
}: DocumentStructureProps) {
  const navigate = useNavigate();
  const sections = getDocumentSections(content ?? null);

  // First section expanded by default; others collapsed
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(() => new Set([0]));

  useEffect(() => {
    setExpandedIndices(new Set([0]));
  }, [content]);

  const toggleSection = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handlePageClick = (e: React.MouseEvent, pageNumber: number) => {
    e.stopPropagation();
    if (onNavigateToPage) {
      onNavigateToPage(pageNumber);
    } else if (documentId) {
      navigate(`/document/${documentId}?page=${pageNumber}`);
    }
  };

  if (isLoading) {
    return (
      <div className={cn('p-4 bg-slate-50/80 border border-slate-200 rounded-lg text-xs text-slate-500', className)}>
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
          <span>Lade Dokumentstruktur…</span>
        </div>
      </div>
    );
  }

  // Check if document is OCR-only (scanned without native blocks)
  const isOcrOnly = Boolean(
    content?.pages &&
    content.pages.length > 0 &&
    content.pages.every(
      (page) => (!page.blocks || page.blocks.length === 0) && (!page.quality.usable || page.ocrText !== null),
    ),
  );

  if (sections === null || sections.length === 0) {
    return (
      <div className={cn('p-4 bg-slate-50/80 border border-slate-200 rounded-lg text-xs text-slate-600', className)}>
        <div className="flex items-center gap-2 mb-1 text-slate-700 font-medium">
          <Layers className="w-4 h-4 text-slate-400" />
          <span>Dokumentstruktur</span>
        </div>
        <p className="text-slate-500 pl-6">
          {isOcrOnly
            ? 'Für dieses Dokument konnte keine native PDF-Struktur ermittelt werden.'
            : 'Für dieses Dokument ist noch keine Struktur verfügbar.'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span>
            Dokumentstruktur ({sections.length} {sections.length === 1 ? 'Abschnitt' : 'Abschnitte'})
          </span>
        </h4>
      </div>

      <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
        {sections.map((section, index) => {
          const isExpanded = expandedIndices.has(index);
          const displayTitle = section.title?.trim() || 'Allgemeiner Inhalt';
          const pageLabel =
            section.pageStart === section.pageEnd
              ? `Seite ${section.pageStart}`
              : `Seiten ${section.pageStart}–${section.pageEnd}`;

          const isNavigable = Boolean(onNavigateToPage || documentId);

          return (
            <div key={index} className="group">
              <button
                type="button"
                onClick={() => toggleSection(index)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50/80 transition-colors duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-inset"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ease-out',
                      isExpanded && 'rotate-90 text-blue-600',
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs font-semibold truncate',
                      section.title ? 'text-slate-900' : 'text-slate-500 italic',
                    )}
                  >
                    {displayTitle}
                  </span>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isNavigable ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handlePageClick(e, section.pageStart)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handlePageClick(e as unknown as React.MouseEvent, section.pageStart);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100/60 px-1.5 py-0.5 rounded transition-[background-color,color] duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      title={`Zu Seite ${section.pageStart} springen`}
                    >
                      <ExternalLink className="w-3 h-3 opacity-60" />
                      <span>{pageLabel}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-400">{pageLabel}</span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3.5 pt-1 space-y-2 border-t border-slate-100 bg-slate-50/40 text-xs">
                  {section.items && section.items.length > 0
                    ? section.items.map((item, iIdx) => {
                        if (item.kind === 'annotation') {
                          return (
                            <div
                              key={iIdx}
                              className="p-2 rounded bg-amber-50/80 border border-amber-200/80 text-amber-900 leading-relaxed space-y-0.5"
                            >
                              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 tracking-wide uppercase">
                                <MessageSquare className="w-3 h-3 text-amber-600" />
                                <span>Anmerkung ({item.annotation.type})</span>
                              </div>
                              <p className="text-xs text-amber-950 whitespace-pre-line">
                                {item.annotation.content}
                              </p>
                            </div>
                          );
                        }

                        const block = item.block;
                        if (block.type === 'heading') {
                          return (
                            <h5 key={iIdx} className="text-xs font-semibold text-slate-900 pt-1.5 first:pt-0">
                              {block.text}
                            </h5>
                          );
                        }
                        if (block.type === 'list') {
                          return (
                            <div
                              key={iIdx}
                              className="text-xs text-slate-700 pl-2.5 border-l-2 border-blue-300/80 whitespace-pre-line leading-relaxed"
                            >
                              {block.text}
                            </div>
                          );
                        }
                        return (
                          <p key={iIdx} className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                            {block.text}
                          </p>
                        );
                      })
                    : section.blocks.map((block, bIdx) => {
                        if (block.type === 'heading') {
                          return (
                            <h5 key={bIdx} className="text-xs font-semibold text-slate-900 pt-1.5 first:pt-0">
                              {block.text}
                            </h5>
                          );
                        }
                        if (block.type === 'list') {
                          return (
                            <div
                              key={bIdx}
                              className="text-xs text-slate-700 pl-2.5 border-l-2 border-blue-300/80 whitespace-pre-line leading-relaxed"
                            >
                              {block.text}
                            </div>
                          );
                        }
                        return (
                          <p key={bIdx} className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                            {block.text}
                          </p>
                        );
                      })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
