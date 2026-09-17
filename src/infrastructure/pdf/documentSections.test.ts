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
        items: [
          { kind: 'block', block: { type: 'heading', text: 'IT-Dienstleistungen' } },
          { kind: 'block', block: { type: 'paragraph', text: 'Erster Absatz' } },
          { kind: 'block', block: { type: 'paragraph', text: 'Zweiter Absatz' } },
        ],
      },
      {
        title: 'Cloud-Management',
        blocks: [
          { type: 'heading', text: 'Cloud-Management' },
          { type: 'paragraph', text: 'Cloud Absatz' },
        ],
        pageStart: 1,
        pageEnd: 1,
        items: [
          { kind: 'block', block: { type: 'heading', text: 'Cloud-Management' } },
          { kind: 'block', block: { type: 'paragraph', text: 'Cloud Absatz' } },
        ],
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
      items: [
        { kind: 'block', block: { type: 'paragraph', text: 'Dokument-Metadaten und Einleitung' } },
        { kind: 'block', block: { type: 'list', text: '- Punkt 1\n- Punkt 2' } },
      ],
    });

    expect(sections[1]).toEqual({
      title: 'Hauptkapitel',
      blocks: [
        { type: 'heading', text: 'Hauptkapitel' },
        { type: 'paragraph', text: 'Kapitelinhalt' },
      ],
      pageStart: 1,
      pageEnd: 1,
      items: [
        { kind: 'block', block: { type: 'heading', text: 'Hauptkapitel' } },
        { kind: 'block', block: { type: 'paragraph', text: 'Kapitelinhalt' } },
      ],
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
      items: [
        { kind: 'block', block: { type: 'heading', text: 'Datenbanken' } },
        { kind: 'block', block: { type: 'paragraph', text: 'Einführung Relationale DB' } },
        { kind: 'block', block: { type: 'paragraph', text: 'Fortsetzung Normalisierung' } },
        { kind: 'block', block: { type: 'list', text: '- 1NF\n- 2NF\n- 3NF' } },
      ],
    });

    expect(sections[1]).toEqual({
      title: 'SQL',
      blocks: [
        { type: 'heading', text: 'SQL' },
        { type: 'paragraph', text: 'SELECT * FROM users;' },
      ],
      pageStart: 3,
      pageEnd: 3,
      items: [
        { kind: 'block', block: { type: 'heading', text: 'SQL' } },
        { kind: 'block', block: { type: 'paragraph', text: 'SELECT * FROM users;' } },
      ],
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
        items: [
          { kind: 'block', block: { type: 'paragraph', text: 'Absatz auf Seite 1' } },
          { kind: 'block', block: { type: 'list', text: '- Punkt A\n- Punkt B' } },
        ],
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
        items: [
          { kind: 'block', block: { type: 'heading', text: 'Seite 1 Titel' } },
          { kind: 'block', block: { type: 'paragraph', text: 'Seite 2 Inhalt' } },
        ],
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

  describe('interleaved reading-order with annotations and Y coordinates', () => {
    it('sorts native blocks and annotations top-to-bottom according to Y coordinate (descending Y)', () => {
      const pages = [
        {
          pageNumber: 1,
          blocks: [
            { type: 'heading' as const, text: 'Überschrift', y: 800 },
            { type: 'paragraph' as const, text: 'Instruktion 1', y: 650 },
            { type: 'paragraph' as const, text: 'Instruktion 2', y: 400 },
          ],
          annotations: [
            { type: 'TEXT', content: 'Schülerantwort', y: 550 },
          ],
        },
      ];

      const sections = buildDocumentSections(pages);
      expect(sections).toHaveLength(1);
      const s = sections[0];

      // Legacy blocks property preserves only native blocks in their order
      expect(s.blocks).toHaveLength(3);
      expect(s.blocks.map((b) => b.text)).toEqual(['Überschrift', 'Instruktion 1', 'Instruktion 2']);

      // items property contains interleaved blocks and annotations in reading order (800 -> 650 -> 550 -> 400)
      expect(s.items).toBeDefined();
      expect(s.items).toHaveLength(4);
      expect(s.items![0]).toEqual({
        kind: 'block',
        block: { type: 'heading', text: 'Überschrift', y: 800 },
      });
      expect(s.items![1]).toEqual({
        kind: 'block',
        block: { type: 'paragraph', text: 'Instruktion 1', y: 650 },
      });
      expect(s.items![2]).toEqual({
        kind: 'annotation',
        annotation: { type: 'TEXT', content: 'Schülerantwort', y: 550 },
      });
      expect(s.items![3]).toEqual({
        kind: 'block',
        block: { type: 'paragraph', text: 'Instruktion 2', y: 400 },
      });
    });

    it('annotations never create sections and belong to the section defined by preceding heading', () => {
      const pages = [
        {
          pageNumber: 1,
          blocks: [
            { type: 'heading' as const, text: 'Sektion 1', y: 700 },
            { type: 'paragraph' as const, text: 'Text 1', y: 600 },
          ],
          annotations: [
            { type: 'FREETEXT', content: 'Notiz A', y: 650 },
            { type: 'HIGHLIGHT', content: 'Notiz B', y: 550 },
          ],
        },
      ];

      const sections = buildDocumentSections(pages);
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe('Sektion 1');
      expect(sections[0].items?.map((it) => it.kind)).toEqual(['block', 'annotation', 'block', 'annotation']);
    });

    it('annotations appearing before any heading belong to the untitled section (title: null)', () => {
      const pages = [
        {
          pageNumber: 1,
          blocks: [
            { type: 'heading' as const, text: 'Erstes Kapitel', y: 500 },
            { type: 'paragraph' as const, text: 'Text im Kapitel', y: 400 },
          ],
          annotations: [
            { type: 'TEXT', content: 'Vorab-Notiz', y: 700 },
          ],
        },
      ];

      const sections = buildDocumentSections(pages);
      expect(sections).toHaveLength(2);

      // First section is untitled and contains the early annotation
      expect(sections[0].title).toBeNull();
      expect(sections[0].blocks).toHaveLength(0);
      expect(sections[0].items).toEqual([
        { kind: 'annotation', annotation: { type: 'TEXT', content: 'Vorab-Notiz', y: 700 } },
      ]);

      // Second section is the chapter
      expect(sections[1].title).toBe('Erstes Kapitel');
      expect(sections[1].blocks).toHaveLength(2);
      expect(sections[1].items).toEqual([
        { kind: 'block', block: { type: 'heading', text: 'Erstes Kapitel', y: 500 } },
        { kind: 'block', block: { type: 'paragraph', text: 'Text im Kapitel', y: 400 } },
      ]);
    });

    it('places coordinate-less items (y === null or undefined) at the end of the page', () => {
      // Scenario:
      // block A: y=800
      // block B: y=600
      // annotation without coords: y=null
      // annotation with coords: y=400
      // Expected order: block A (800) -> block B (600) -> annotation (400) -> annotation (null)
      const pages = [
        {
          pageNumber: 1,
          blocks: [
            { type: 'paragraph' as const, text: 'Block A', y: 800 },
            { type: 'paragraph' as const, text: 'Block B', y: 600 },
          ],
          annotations: [
            { type: 'TEXT', content: 'Annotation ohne Y', y: null },
            { type: 'HIGHLIGHT', content: 'Annotation y=400', y: 400 },
          ],
        },
      ];

      const sections = buildDocumentSections(pages);
      expect(sections).toHaveLength(1);
      const items = sections[0].items!;
      expect(items).toHaveLength(4);
      expect(items[0]).toEqual({ kind: 'block', block: { type: 'paragraph', text: 'Block A', y: 800 } });
      expect(items[1]).toEqual({ kind: 'block', block: { type: 'paragraph', text: 'Block B', y: 600 } });
      expect(items[2]).toEqual({ kind: 'annotation', annotation: { type: 'HIGHLIGHT', content: 'Annotation y=400', y: 400 } });
      expect(items[3]).toEqual({ kind: 'annotation', annotation: { type: 'TEXT', content: 'Annotation ohne Y', y: null } });
    });

    it('correctly handles a page containing only annotations (no native blocks)', () => {
      const pages = [
        {
          pageNumber: 1,
          blocks: [],
          annotations: [
            { type: 'TEXT', content: 'Reine Notiz', y: 500 },
          ],
        },
      ];

      const sections = buildDocumentSections(pages);
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBeNull();
      expect(sections[0].blocks).toEqual([]);
      expect(sections[0].items).toEqual([
        { kind: 'annotation', annotation: { type: 'TEXT', content: 'Reine Notiz', y: 500 } },
      ]);
    });

    it('tie-breaker: when Y coordinates match exactly, blocks come before annotations', () => {
      const pages = [
        {
          pageNumber: 1,
          blocks: [
            { type: 'paragraph' as const, text: 'Gleiches Y Text', y: 500 },
          ],
          annotations: [
            { type: 'TEXT', content: 'Gleiches Y Notiz', y: 500 },
          ],
        },
      ];

      const sections = buildDocumentSections(pages);
      expect(sections).toHaveLength(1);
      expect(sections[0].items).toEqual([
        { kind: 'block', block: { type: 'paragraph', text: 'Gleiches Y Text', y: 500 } },
        { kind: 'annotation', annotation: { type: 'TEXT', content: 'Gleiches Y Notiz', y: 500 } },
      ]);
    });
  });
});
