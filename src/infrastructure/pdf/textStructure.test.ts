import { describe, expect, it } from 'vitest';
import { extractTextBlocks } from './textStructure';
import type { TextBlock } from './types';

describe('extractTextBlocks', () => {
  it('returns an empty array for empty or non-text items', () => {
    expect(extractTextBlocks([])).toEqual([]);
    expect(extractTextBlocks([{ type: 'beginMarkedContent', id: '1' }])).toEqual([]);
    expect(extractTextBlocks([{ str: '   ' }, { str: '' }])).toEqual([]);
    expect(extractTextBlocks([null, undefined, 42])).toEqual([]);
  });

  it('groups horizontal text items on the same baseline into a single line', () => {
    const items = [
      { str: 'Hallo', transform: [12, 0, 0, 12, 72, 700], width: 30, height: 12, hasEOL: false },
      { str: 'Welt', transform: [12, 0, 0, 12, 108, 700], width: 25, height: 12, hasEOL: true },
    ];
    const blocks = extractTextBlocks(items);
    expect(blocks).toEqual<TextBlock[]>([
      {
        text: 'Hallo Welt',
        type: 'paragraph',
        y: 700,
      },
    ]);
  });

  it('distinguishes headings with noticeably larger font sizes', () => {
    const items = [
      // 20pt heading
      { str: 'Kapitel 1: Einleitung', transform: [20, 0, 0, 20, 72, 750], width: 180, height: 20, hasEOL: true },
      // 12pt body paragraph (two lines)
      { str: 'Dies ist der erste Absatz.', transform: [12, 0, 0, 12, 72, 715], width: 140, height: 12, hasEOL: true },
      { str: 'Er geht in der zweiten Zeile weiter.', transform: [12, 0, 0, 12, 72, 699], width: 190, height: 12, hasEOL: true },
    ];
    const blocks = extractTextBlocks(items);
    expect(blocks).toEqual<TextBlock[]>([
      {
        text: 'Kapitel 1: Einleitung',
        type: 'heading',
        y: 750,
      },
      {
        text: 'Dies ist der erste Absatz.\nEr geht in der zweiten Zeile weiter.',
        type: 'paragraph',
        y: 715,
      },
    ]);
  });

  it('identifies bulleted and numbered list items', () => {
    const items = [
      { str: 'Uebersicht der Aufgaben:', transform: [12, 0, 0, 12, 72, 750], width: 140, height: 12, hasEOL: true },
      { str: '- Erste Aufgabe bearbeiten', transform: [12, 0, 0, 12, 72, 730], width: 150, height: 12, hasEOL: true },
      { str: '- Zweite Aufgabe pruefen', transform: [12, 0, 0, 12, 72, 714], width: 145, height: 12, hasEOL: true },
      { str: '1. Erste nummerierte Frage', transform: [12, 0, 0, 12, 72, 690], width: 155, height: 12, hasEOL: true },
      { str: '2. Zweite nummerierte Frage', transform: [12, 0, 0, 12, 72, 674], width: 160, height: 12, hasEOL: true },
      { str: 'Abschliessender Fliesstext.', transform: [12, 0, 0, 12, 72, 630], width: 140, height: 12, hasEOL: true },
    ];
    const blocks = extractTextBlocks(items);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toEqual<TextBlock>({
      text: 'Uebersicht der Aufgaben:',
      type: 'paragraph',
      y: 750,
    });
    expect(blocks[1]).toEqual<TextBlock>({
      text: '- Erste Aufgabe bearbeiten\n- Zweite Aufgabe pruefen',
      type: 'list',
      y: 730,
    });
    expect(blocks[2]).toEqual<TextBlock>({
      text: '1. Erste nummerierte Frage\n2. Zweite nummerierte Frage',
      type: 'list',
      y: 690,
    });
    expect(blocks[3]).toEqual<TextBlock>({
      text: 'Abschliessender Fliesstext.',
      type: 'paragraph',
      y: 630,
    });
  });

  it('breaks paragraphs on significant vertical spacing gaps', () => {
    const items = [
      { str: 'Erster Absatz, Zeile 1.', transform: [12, 0, 0, 12, 72, 750], width: 120, height: 12, hasEOL: true },
      { str: 'Erster Absatz, Zeile 2.', transform: [12, 0, 0, 12, 72, 734], width: 120, height: 12, hasEOL: true },
      // Gap of 44pt (>> 16pt line height)
      { str: 'Zweiter Absatz nach Leerzeile.', transform: [12, 0, 0, 12, 72, 690], width: 160, height: 12, hasEOL: true },
    ];
    const blocks = extractTextBlocks(items);
    expect(blocks).toEqual<TextBlock[]>([
      {
        text: 'Erster Absatz, Zeile 1.\nErster Absatz, Zeile 2.',
        type: 'paragraph',
        y: 750,
      },
      {
        text: 'Zweiter Absatz nach Leerzeile.',
        type: 'paragraph',
        y: 690,
      },
    ]);
  });
});
