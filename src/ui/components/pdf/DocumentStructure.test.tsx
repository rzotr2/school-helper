// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentStructure } from './DocumentStructure';
import type { DocumentContent } from '../../../application/use-cases/documentContent';

// Configure React 19 act environment for jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('DocumentStructure component', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  const renderComponent = async (element: React.ReactElement) => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<MemoryRouter>{element}</MemoryRouter>);
    });
    return root;
  };

  const sampleContent: DocumentContent = {
    pages: [
      {
        pageNumber: 1,
        nativeText: 'Text 1',
        quality: { usable: true, charCount: 10, printableRatio: 1, whitespaceRatio: 0.2, alphanumericRatio: 0.8, wordCount: 2, replacementCharCount: 0, reasons: [] },
        ocrText: null,
        ocrStatus: 'not-generated',
        blocks: [
          { type: 'heading', text: 'IT-Dienstleistungen' },
          { type: 'paragraph', text: 'Einleitung in Dienstleistungen.' },
          { type: 'list', text: '- Beratung\n- Support' },
        ],
      },
      {
        pageNumber: 2,
        nativeText: 'Text 2',
        quality: { usable: true, charCount: 10, printableRatio: 1, whitespaceRatio: 0.2, alphanumericRatio: 0.8, wordCount: 2, replacementCharCount: 0, reasons: [] },
        ocrText: null,
        ocrStatus: 'not-generated',
        blocks: [
          { type: 'heading', text: 'Cloud-Management' },
          { type: 'paragraph', text: 'Grundlagen Cloud Computing.' },
        ],
      },
    ],
    sections: [
      {
        title: 'IT-Dienstleistungen',
        blocks: [
          { type: 'heading', text: 'IT-Dienstleistungen' },
          { type: 'paragraph', text: 'Einleitung in Dienstleistungen.' },
          { type: 'list', text: '- Beratung\n- Support' },
        ],
        pageStart: 1,
        pageEnd: 1,
      },
      {
        title: 'Cloud-Management',
        blocks: [
          { type: 'heading', text: 'Cloud-Management' },
          { type: 'paragraph', text: 'Grundlagen Cloud Computing.' },
        ],
        pageStart: 2,
        pageEnd: 2,
      },
    ],
  };

  it('renders sections with titles and page ranges, with first section expanded by default', async () => {
    await renderComponent(<DocumentStructure content={sampleContent} />);

    expect(container.textContent).toContain('Dokumentstruktur (2 Abschnitte)');
    expect(container.textContent).toContain('IT-Dienstleistungen');
    expect(container.textContent).toContain('Cloud-Management');
    expect(container.textContent).toContain('Seite 1');
    expect(container.textContent).toContain('Seite 2');

    // First section is expanded: its content is visible
    expect(container.textContent).toContain('Einleitung in Dienstleistungen.');
    expect(container.textContent).toContain('- Beratung\n- Support');

    // Second section is collapsed: its paragraphs should not be rendered
    expect(container.textContent).not.toContain('Grundlagen Cloud Computing.');
  });

  it('expands and collapses sections when clicked', async () => {
    await renderComponent(<DocumentStructure content={sampleContent} />);

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    // Click second section header to expand it
    await act(async () => {
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Grundlagen Cloud Computing.');

    // Click first section header to collapse it
    await act(async () => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('Einleitung in Dienstleistungen.');
  });

  it('renders untitled sections safely with neutral label "Allgemeiner Inhalt"', async () => {
    const untitledContent: DocumentContent = {
      pages: [],
      sections: [
        {
          title: null,
          blocks: [{ type: 'paragraph', text: 'Text ohne Überschrift' }],
          pageStart: 1,
          pageEnd: 3,
        },
      ],
    };

    await renderComponent(<DocumentStructure content={untitledContent} />);

    expect(container.textContent).toContain('Allgemeiner Inhalt');
    expect(container.textContent).toContain('Seiten 1–3');
    expect(container.textContent).toContain('Text ohne Überschrift');
  });

  it('shows neutral message when sections are missing (legacy state)', async () => {
    const legacyContent: DocumentContent = {
      pages: [
        {
          pageNumber: 1,
          nativeText: 'Legacy',
          quality: { usable: true, charCount: 6, printableRatio: 1, whitespaceRatio: 0.2, alphanumericRatio: 0.8, wordCount: 1, replacementCharCount: 0, reasons: [] },
          ocrText: null,
          ocrStatus: 'not-generated',
        },
      ],
    };

    await renderComponent(<DocumentStructure content={legacyContent} />);

    expect(container.textContent).toContain('Für dieses Dokument ist noch keine Struktur verfügbar.');
  });

  it('shows neutral OCR-only message for scanned documents without native text blocks', async () => {
    const ocrOnlyContent: DocumentContent = {
      pages: [
        {
          pageNumber: 1,
          nativeText: '',
          quality: { usable: false, charCount: 0, printableRatio: 0, whitespaceRatio: 0, alphanumericRatio: 0, wordCount: 0, replacementCharCount: 0, reasons: ['no_printable_text'] },
          ocrText: 'Gescannter Text',
          ocrStatus: 'completed',
        },
      ],
    };

    await renderComponent(<DocumentStructure content={ocrOnlyContent} />);

    expect(container.textContent).toContain('Für dieses Dokument konnte keine native PDF-Struktur ermittelt werden.');
  });

  it('invokes onNavigateToPage when page reference is clicked', async () => {
    const handleNavigate = vi.fn();
    await renderComponent(
      <DocumentStructure content={sampleContent} onNavigateToPage={handleNavigate} />,
    );

    const pageBadges = container.querySelectorAll('span[role="button"]');
    expect(pageBadges.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      pageBadges[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handleNavigate).toHaveBeenCalledWith(1);
  });

  it('renders loading state when isLoading is true', async () => {
    await renderComponent(<DocumentStructure content={null} isLoading={true} />);

    expect(container.textContent).toContain('Lade Dokumentstruktur…');
  });

  it('renders interleaved annotation items with proper styling badge', async () => {
    const annotatedContent: DocumentContent = {
      pages: [
        {
          pageNumber: 1,
          nativeText: 'Text 1',
          quality: { usable: true, charCount: 10, printableRatio: 1, whitespaceRatio: 0.2, alphanumericRatio: 0.8, wordCount: 2, replacementCharCount: 0, reasons: [] },
          ocrText: null,
          ocrStatus: 'not-generated',
          blocks: [
            { type: 'heading', text: 'Aufgabenstellung' },
            { type: 'paragraph', text: 'Bitte beantworten.' },
          ],
          annotations: [
            { type: 'TEXT', content: 'Handschriftliche Notiz des Schülers', y: 450 },
          ],
        },
      ],
      sections: [
        {
          title: 'Aufgabenstellung',
          blocks: [
            { type: 'heading', text: 'Aufgabenstellung' },
            { type: 'paragraph', text: 'Bitte beantworten.' },
          ],
          pageStart: 1,
          pageEnd: 1,
          items: [
            { kind: 'block', block: { type: 'heading', text: 'Aufgabenstellung' } },
            { kind: 'annotation', annotation: { type: 'TEXT', content: 'Handschriftliche Notiz des Schülers', y: 450 } },
            { kind: 'block', block: { type: 'paragraph', text: 'Bitte beantworten.' } },
          ],
        },
      ],
    };

    await renderComponent(<DocumentStructure content={annotatedContent} />);

    expect(container.textContent).toContain('Aufgabenstellung');
    expect(container.textContent).toContain('Anmerkung (TEXT)');
    expect(container.textContent).toContain('Handschriftliche Notiz des Schülers');
    expect(container.textContent).toContain('Bitte beantworten.');
  });
});
