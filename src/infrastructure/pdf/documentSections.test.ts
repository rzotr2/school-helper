import { describe, expect, it } from 'vitest';
import { buildDocumentSections } from './textStructure';
import type { TextBlock } from './types';

describe('buildDocumentSections', () => {
  it('returns empty array when input is null, undefined, empty, or pages have no blocks', () => {
    expect(buildDocumentSections(null)).toEqual([]);
    expect(buildDocumentSections(undefined)).toEqual([]);
    expect(buildDocumentSections([])).toEqual([]);
    expect(buildDocumentSections([{ pageNumber: 1 }])).toEqual([]);
    expect(buildDocumentSections([{ pageNumber: 1, blocks: [] }])).toEqual([]);
  });

  it('builds basic sections where each heading starts a new section', () => {
    const pages = [
      {
        pageNumber: 1,
        blocks: [
          { type: 'heading' as const, text: 'IT-Dienstleistungen' },
          { type: 'paragraph' as const, text: 'Erster Absatz' },
          { type: 'paragraph' as const, text: 'Zweiter Absatz' },
          { type: 'heading' as const, text: 'Cloud-Management' },
          { type: 'paragraph' as const, text: 'Cloud Absatz' },
        ],
      },
    ];

    const sections = buildDocumentSections(pages);
    expect(sections).toEqual([
      {
        title: 'IT-Dienstleistungen',
        blocks: [
          { type: 'heading', text: 'IT-Dienstleistungen' },
          { type: 'paragraph', text: 'Erster Absatz' },
          { type: 'paragraph', text: 'Zweiter Absatz' },
        ],
        pageStart: 1,
        pageEnd: 1,
      },
      {
        title: 'Cloud-Management',
        blocks: [
          { type: 'heading', text: 'Cloud-Management' },
          { type: 'paragraph', text: 'Cloud Absatz' },
        ],
        pageStart: 1,
        pageEnd: 1,
      },
    ]);
  });

  it('preserves content before the first heading as an untitled section', () => {
    const pages = [
      {
        pageNumber: 1,
        blocks: [
          { type: 'paragraph' as const, text: 'Dokument-Metadaten und Einleitung' },
          { type: 'list' as const, text: '- Punkt 1\n- Punkt 2' },
          { type: 'heading' as const, text: 'Hauptkapitel' },
          { type: 'paragraph' as const, text: 'Kapitelinhalt' },
        ],
      },
    ];

    const sections = buildDocumentSections(pages);
    expect(sections).toHaveLength(2);

    expect(sections[0]).toEqual({
      title: null,
      blocks: [
        { type: 'paragraph', text: 'Dokument-Metadaten und Einleitung' },
        { type: 'list', text: '- Punkt 1\n- Punkt 2' },
      ],
      pageStart: 1,
      pageEnd: 1,
    });

    expect(sections[1]).toEqual({
      title: 'Hauptkapitel',
      blocks: [
        { type: 'heading', text: 'Hauptkapitel' },
        { type: 'paragraph', text: 'Kapitelinhalt' },
      ],
      pageStart: 1,
      pageEnd: 1,
    });
  });

  it('supports sections spanning multiple pages', () => {
    const pages = [
      {
        pageNumber: 1,
        blocks: [
          { type: 'heading' as const, text: 'Datenbanken' },
          { type: 'paragraph' as const, text: 'Einführung Relationale DB' },
        ],
      },
      {
        pageNumber: 2,
        blocks: [
          { type: 'paragraph' as const, text: 'Fortsetzung Normalisierung' },
          { type: 'list' as const, text: '- 1NF\n- 2NF\n- 3NF' },
        ],
      },
      {
        pageNumber: 3,
        blocks: [
          { type: 'heading' as const, text: 'SQL' },
          { type: 'paragraph' as const, text: 'SELECT * FROM users;' },
        ],
      },
    ];

    const sections = buildDocumentSections(pages);
    expect(sections).toHaveLength(2);

    expect(sections[0]).toEqual({
      title: 'Datenbanken',
      blocks: [
        { type: 'heading', text: 'Datenbanken' },
        { type: 'paragraph', text: 'Einführung Relationale DB' },
        { type: 'paragraph', text: 'Fortsetzung Normalisierung' },
        { type: 'list', text: '- 1NF\n- 2NF\n- 3NF' },
      ],
      pageStart: 1,
      pageEnd: 2,
    });

    expect(sections[1]).toEqual({
      title: 'SQL',
      blocks: [
        { type: 'heading', text: 'SQL' },
        { type: 'paragraph', text: 'SELECT * FROM users;' },
      ],
      pageStart: 3,
      pageEnd: 3,
    });
  });

  it('produces a single untitled section when a document has no headings but has blocks', () => {
    const pages = [
      {
        pageNumber: 1,
        blocks: [{ type: 'paragraph' as const, text: 'Absatz auf Seite 1' }],
      },
      {
        pageNumber: 2,
        blocks: [{ type: 'list' as const, text: '- Punkt A\n- Punkt B' }],
      },
    ];

    const sections = buildDocumentSections(pages);
    expect(sections).toEqual([
      {
        title: null,
        blocks: [
          { type: 'paragraph', text: 'Absatz auf Seite 1' },
          { type: 'list', text: '- Punkt A\n- Punkt B' },
        ],
        pageStart: 1,
        pageEnd: 2,
      },
    ]);
  });

  it('does not extend pageEnd when empty/image-only pages exist between sections', () => {
    const pages = [
      {
        pageNumber: 4,
        blocks: [
          { type: 'heading' as const, text: 'Kapitel 4' },
          { type: 'paragraph' as const, text: 'Inhalt auf Seite 4' },
        ],
      },
      {
        pageNumber: 5, // Image-only or empty page: no blocks
      },
      {
        pageNumber: 6,
        blocks: [
          { type: 'heading' as const, text: 'Kapitel 5' },
          { type: 'paragraph' as const, text: 'Inhalt auf Seite 6' },
        ],
      },
    ];

    const sections = buildDocumentSections(pages);
    expect(sections).toHaveLength(2);

    expect(sections[0].pageStart).toBe(4);
    expect(sections[0].pageEnd).toBe(4); // Page 5 has no blocks, so pageEnd must NOT be 5

    expect(sections[1].pageStart).toBe(6);
    expect(sections[1].pageEnd).toBe(6);
  });

  it('preserves block text, block types, and block order exactly without mutation', () => {
    const originalBlocks: TextBlock[] = [
      { type: 'heading', text: ' Überschrift mit Leerzeichen  ' },
      { type: 'paragraph', text: 'Absatz 1' },
      { type: 'list', text: '• Element 1\n• Element 2' },
      { type: 'paragraph', text: 'Absatz 2' },
    ];

    const sections = buildDocumentSections([
      {
        pageNumber: 1,
        blocks: originalBlocks,
      },
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0].blocks).toEqual(originalBlocks);
    expect(sections[0].title).toBe(' Überschrift mit Leerzeichen  ');
  });

  it('orders pages deterministically by pageNumber regardless of input array order', () => {
    const pages = [
      {
        pageNumber: 2,
        blocks: [{ type: 'paragraph' as const, text: 'Seite 2 Inhalt' }],
      },
      {
        pageNumber: 1,
        blocks: [{ type: 'heading' as const, text: 'Seite 1 Titel' }],
      },
    ];

    const sections = buildDocumentSections(pages);
    expect(sections).toEqual([
      {
        title: 'Seite 1 Titel',
        blocks: [
          { type: 'heading', text: 'Seite 1 Titel' },
          { type: 'paragraph', text: 'Seite 2 Inhalt' },
        ],
        pageStart: 1,
        pageEnd: 2,
      },
    ]);
  });

  it('handles multiple headings on the same page correctly', () => {
    const pages = [
      {
        pageNumber: 1,
        blocks: [
          { type: 'heading' as const, text: 'Abschnitt A' },
          { type: 'paragraph' as const, text: 'Text A' },
          { type: 'heading' as const, text: 'Abschnitt B' },
          { type: 'heading' as const, text: 'Abschnitt C' },
          { type: 'paragraph' as const, text: 'Text C' },
        ],
      },
    ];

    const sections = buildDocumentSections(pages);
    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('Abschnitt A');
    expect(sections[0].blocks).toHaveLength(2);
    expect(sections[1].title).toBe('Abschnitt B');
    expect(sections[1].blocks).toHaveLength(1);
    expect(sections[2].title).toBe('Abschnitt C');
    expect(sections[2].blocks).toHaveLength(2);
  });
});
