/**
 * Test-only PDF fixtures and support (not part of the application).
 *
 * Hand-crafted PDFs built from raw PDF syntax — no PDF libraries, no
 * sample files, nothing leaves the machine. Shared by the Node
 * integration tests (integration.test.ts) and the jsdom annotation
 * layer tests (annotationLayer.test.ts).
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { OcrCanvasFactory } from './types';

// The realistic mixed-language fixture needs predictable Ukrainian glyphs:
// the macOS generic sans-serif/serif fallback renders є/і/ї/ґ in shapes the
// ukr LSTM model systematically confuses (measured: every Ukrainian word
// with є or і came back corrupted at all sizes and encodings, while the
// same text in Arial reads correctly). Register Arial so the fixture is
// font-stable across machines; on systems without the file the family
// string falls back to the system resolver.
try {
  GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Arial.ttf', 'Arial');
} catch {
  // Not fatal: 'Arial' then resolves through the system font manager.
}

// ── Node canvas adapter ────────────────────────────────────────────────────
//
// @napi-rs/canvas implements the drawing calls pdf.js uses, but its TS types
// differ from the DOM's: SKRSContext2D has its own TextMetrics etc., and
// Canvas is not an HTMLCanvasElement. The casts below exist only to bridge
// that type gap in Node tests.

export const nodeCanvasFactory: OcrCanvasFactory = (width, height) => {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  // toImage is deferred: the PNG must be captured after pdf.js has rendered.
  return { context, toImage: () => canvas.toBuffer('image/png') };
};

// ── Minimal PDF builder ────────────────────────────────────────────────────
// Objects: 1 Catalog, 2 Pages, 3 shared Helvetica font, then per page:
// page object, content stream, optional image XObject, optional Text,
// Link, FreeText (optionally with /AP appearance), Ink, Highlight and
// Stamp annotations (links with optional /AP appearance forms).

export interface ImageFixture {
  jpeg: Buffer;
  width: number;
  height: number;
}

export interface LinkFixture {
  /** External link target (/A /URI). */
  uri?: string;
  /** Internal link target: 1-based page within the fixture document (/Dest). */
  destPage?: number;
  /** Link rectangle in PDF coordinates (origin bottom-left). */
  rect: [number, number, number, number];
  /** Also writes a red-filled /AP appearance stream (for render tests). */
  withAppearance?: boolean;
}

export interface FreeTextFixture {
  /** FreeText rectangle in PDF coordinates. */
  rect: [number, number, number, number];
  /** Annotation contents (/Contents). */
  contents: string;
  /**
   * Write /Contents as a UTF-16BE hex string (FEFF-prefixed) instead of a
   * PDF literal string — the encoding real annotation tools emit for
   * non-ASCII text. The builder derives the hex from `contents`.
   */
  contentsAsUtf16Hex?: boolean;
  /**
   * Also writes a red-filled /AP appearance stream. The canvas paints it
   * (annotationMode ENABLE); the annotation layer must not paint it a
   * second time.
   */
  withAppearance?: boolean;
}

export interface InkFixture {
  /** Ink rectangle in PDF coordinates. */
  rect: [number, number, number, number];
  /** Strokes (/InkList): each stroke is [x1 y1 x2 y2 ...]. */
  inkList: number[][];
}

export interface HighlightFixture {
  /** Highlight rectangle in PDF coordinates. */
  rect: [number, number, number, number];
  /** /QuadPoints: four points as a flat array, written as given. */
  quadPoints: number[];
  /** Annotation contents (/Contents). */
  contents: string;
}

export interface StampFixture {
  /** Stamp rectangle in PDF coordinates. */
  rect: [number, number, number, number];
  /** Annotation contents (/Contents). */
  contents: string;
  /** Stamp icon name (/Name), e.g. 'Approved'. */
  name?: string;
  /**
   * Write /Contents as a UTF-16BE hex string (FEFF-prefixed) instead of a
   * PDF literal string — the encoding real annotation tools emit for
   * non-ASCII text. The builder derives the hex from `contents`.
   */
  contentsAsUtf16Hex?: boolean;
}

export interface FixturePage {
  textLines?: string[];
  /** Text drawn near the bottom-right corner of the page. */
  bottomTextLines?: string[];
  image?: ImageFixture;
  withAnnotation?: boolean;
  linkAnnotations?: LinkFixture[];
  freeTextAnnotations?: FreeTextFixture[];
  inkAnnotations?: InkFixture[];
  highlightAnnotations?: HighlightFixture[];
  stampAnnotations?: StampFixture[];
}

/** The red appearance fill shared by /AP fixture annotations. */
function redFillAppearanceStream(width: number, height: number): Buffer {
  // Solid red fill over the whole rect: render tests probe for exactly
  // this ink.
  return Buffer.from(`1 0 0 rg 0 0 ${width} ${height} re f`);
}

export function buildPdf(pages: FixturePage[]): Buffer {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;

  chunks.push(Buffer.from('%PDF-1.4\n'));
  length += chunks[0].length;

  const pushObject = (num: number, body: Buffer): void => {
    offsets[num] = length;
    const header = Buffer.from(`${num} 0 obj\n`);
    const footer = Buffer.from('\nendobj\n');
    chunks.push(header, body, footer);
    length += header.length + body.length + footer.length;
  };

  /** Pushes a Form XObject filled solid red over [x1 y1 x2 y2]. */
  const pushAppearanceForm = (x1: number, y1: number, x2: number, y2: number): number => {
    const formNumber = nextObject++;
    const stream = redFillAppearanceStream(x2 - x1, y2 - y1);
    pushObject(
      formNumber,
      Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Form /BBox [0 0 ${x2 - x1} ${y2 - y1}] /Resources << >> /Length ${stream.length} >>\nstream\n`,
        ),
        stream,
        Buffer.from('\nendstream'),
      ]),
    );
    return formNumber;
  };

  const pageObjectNumbers: number[] = [];
  let nextObject = 4;

  pushObject(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));

  // Page objects get their numbers first, so a link annotation can
  // reference any page of the document (including later ones).
  for (let i = 0; i < pages.length; i++) {
    pageObjectNumbers.push(nextObject++);
  }

  for (const [pageIndex, page] of pages.entries()) {
    const pageNumber = pageObjectNumbers[pageIndex];
    const contentNumber = nextObject++;
    const resources: string[] = [];
    const annotationReferences: number[] = [];
    let contentsReference = '';

    if (page.textLines) {
      const topLines = page.textLines
        .map((line, index) => `BT /F1 14 Tf 72 ${760 - index * 24} Td (${line}) Tj ET`)
        .join('\n');
      const bottomLines = (page.bottomTextLines ?? [])
        .map((line, index) => `BT /F1 14 Tf 420 ${40 + index * 20} Td (${line}) Tj ET`)
        .join('\n');
      const content = Buffer.from([topLines, bottomLines].filter(Boolean).join('\n'), 'latin1');
      pushObject(
        contentNumber,
        Buffer.concat([
          Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
          content,
          Buffer.from('\nendstream'),
        ]),
      );
      resources.push('/Font << /F1 3 0 R >>');
      contentsReference = ` /Contents ${contentNumber} 0 R`;
    }

    if (page.image) {
      const imageNumber = nextObject++;
      const { jpeg, width, height } = page.image;
      pushObject(
        imageNumber,
        Buffer.concat([
          Buffer.from(
            `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
          ),
          jpeg,
          Buffer.from('\nendstream'),
        ]),
      );
      // Draw at half size so the OCR render (2x) matches the source resolution.
      const draw = Buffer.from(`q ${width / 2} 0 0 ${height / 2} 0 0 cm /Im1 Do Q`);
      pushObject(
        contentNumber,
        Buffer.concat([
          Buffer.from(`<< /Length ${draw.length} >>\nstream\n`),
          draw,
          Buffer.from('\nendstream'),
        ]),
      );
      resources.push(`/XObject << /Im1 ${imageNumber} 0 R >>`);
      contentsReference = ` /Contents ${contentNumber} 0 R`;
    }

    if (page.withAnnotation) {
      const annotationNumber = nextObject++;
      annotationReferences.push(annotationNumber);
      pushObject(
        annotationNumber,
        Buffer.from(
          '<< /Type /Annot /Subtype /Text /Rect [100 600 300 640] /Name /Note /Contents (Wichtige Notiz: Kapitel 2 nachlesen!) /T (Note) >>',
        ),
      );
    }

    if (page.linkAnnotations) {
      for (const link of page.linkAnnotations) {
        const linkNumber = nextObject++;
        const [x1, y1, x2, y2] = link.rect;
        let action = '';
        if (link.uri !== undefined) {
          action = ` /A << /S /URI /URI (${link.uri}) >>`;
        }
        if (link.destPage !== undefined) {
          action = ` /Dest [${pageObjectNumbers[link.destPage - 1]} 0 R /FitH null]`;
        }
        let appearance = '';
        if (link.withAppearance === true) {
          appearance = ` /AP << /N ${pushAppearanceForm(x1, y1, x2, y2)} 0 R >>`;
        }
        annotationReferences.push(linkNumber);
        pushObject(
          linkNumber,
          Buffer.from(
            `<< /Type /Annot /Subtype /Link /Rect [${x1} ${y1} ${x2} ${y2}] /Border [0 0 1]${action}${appearance} >>`,
          ),
        );
      }
    }

    if (page.freeTextAnnotations) {
      for (const freeText of page.freeTextAnnotations) {
        const annotationNumber = nextObject++;
        const [x1, y1, x2, y2] = freeText.rect;
        // Non-ASCII contents go through the same UTF-16BE hex encoding real
        // tools write; ASCII stays a simple literal string.
        const contents =
          freeText.contentsAsUtf16Hex === true
            ? `<FEFF${Buffer.from(freeText.contents, 'utf16le').swap16().toString('hex').toUpperCase()}>`
            : `(${freeText.contents})`;
        let appearance = '';
        if (freeText.withAppearance === true) {
          appearance = ` /AP << /N ${pushAppearanceForm(x1, y1, x2, y2)} 0 R >>`;
        }
        annotationReferences.push(annotationNumber);
        pushObject(
          annotationNumber,
          Buffer.from(
            `<< /Type /Annot /Subtype /FreeText /Rect [${x1} ${y1} ${x2} ${y2}] /Contents ${contents} /DA (/Helv 12 Tf 1 0 0 rg)${appearance} >>`,
          ),
        );
      }
    }

    if (page.inkAnnotations) {
      for (const ink of page.inkAnnotations) {
        const annotationNumber = nextObject++;
        const [x1, y1, x2, y2] = ink.rect;
        const inkList = ink.inkList.map((stroke) => `[${stroke.join(' ')}]`).join(' ');
        annotationReferences.push(annotationNumber);
        pushObject(
          annotationNumber,
          Buffer.from(
            `<< /Type /Annot /Subtype /Ink /Rect [${x1} ${y1} ${x2} ${y2}] /InkList [${inkList}] /Color [1 0 0] >>`,
          ),
        );
      }
    }

    if (page.highlightAnnotations) {
      for (const highlight of page.highlightAnnotations) {
        const annotationNumber = nextObject++;
        const [x1, y1, x2, y2] = highlight.rect;
        annotationReferences.push(annotationNumber);
        pushObject(
          annotationNumber,
          Buffer.from(
            `<< /Type /Annot /Subtype /Highlight /Rect [${x1} ${y1} ${x2} ${y2}] /QuadPoints [${highlight.quadPoints.join(' ')}] /Contents (${highlight.contents}) /T (pl) >>`,
          ),
        );
      }
    }

    if (page.stampAnnotations) {
      for (const stamp of page.stampAnnotations) {
        const annotationNumber = nextObject++;
        const [x1, y1, x2, y2] = stamp.rect;
        const name = stamp.name === undefined ? '' : ` /Name /${stamp.name}`;
        // Non-ASCII contents go through the same UTF-16BE hex encoding real
        // tools write; ASCII stays a simple literal string.
        const contents =
          stamp.contentsAsUtf16Hex === true
            ? `<FEFF${Buffer.from(stamp.contents, 'utf16le').swap16().toString('hex').toUpperCase()}>`
            : `(${stamp.contents})`;
        annotationReferences.push(annotationNumber);
        pushObject(
          annotationNumber,
          Buffer.from(
            `<< /Type /Annot /Subtype /Stamp /Rect [${x1} ${y1} ${x2} ${y2}]${name} /Contents ${contents} /T (pl) >>`,
          ),
        );
      }
    }

    const mediaWidth = page.image ? page.image.width / 2 : 612;
    const mediaHeight = page.image ? page.image.height / 2 : 792;
    const annotationsEntry =
      annotationReferences.length > 0
        ? ` /Annots [${annotationReferences.map((n) => `${n} 0 R`).join(' ')}]`
        : '';

    pushObject(
      pageNumber,
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mediaWidth} ${mediaHeight}] /Resources << ${resources.join(' ')} >>${contentsReference}${annotationsEntry} >>`,
      ),
    );
  }

  pushObject(
    2,
    Buffer.from(
      `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ),
  );
  pushObject(3, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));

  const objectCount = nextObject - 1;
  const xrefOffset = length;
  chunks.push(Buffer.from(`xref\n0 ${objectCount + 1}\n`));
  chunks.push(Buffer.from('0000000000 65535 f \n'));
  for (let num = 1; num <= objectCount; num++) {
    chunks.push(Buffer.from(`${String(offsets[num]).padStart(10, '0')} 00000 n \n`));
  }
  chunks.push(
    Buffer.from(
      `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );

  return Buffer.concat(chunks);
}

// ── Fixtures ───────────────────────────────────────────────────────────────

export const TEXT_LINES = [
  'Hallo Welt!',
  'Dies ist ein Testdokument fuer die PDF-Inspektion.',
  'Es enthaelt mehrere Zeilen Text.',
  'Damit die Qualitaetsbewertung genug zu tun hat.',
];

export function textPdf(withAnnotation = false): Buffer {
  return buildPdf([{ textLines: TEXT_LINES, withAnnotation }]);
}

/** Text spread over the whole page: top-left and bottom-right lines. */
export function fullPageTextPdf(): Buffer {
  return buildPdf([
    {
      textLines: ['Oben links: erste Zeile.'],
      bottomTextLines: ['Unten rechts: letzte Zeile.'],
    },
  ]);
}

/** Two text pages; page 1 carries an external and an internal link. */
export function linkedTextPdf(): Buffer {
  return buildPdf([
    {
      textLines: TEXT_LINES,
      linkAnnotations: [
        { uri: 'https://example.com/notiz', rect: [72, 700, 272, 730] },
        { destPage: 2, rect: [72, 660, 272, 690] },
      ],
    },
    { textLines: ['Zweite Seite.'] },
  ]);
}

/** One text page with a link whose /AP appearance fills the rect red. */
export function linkAppearancePdf(): Buffer {
  return buildPdf([
    {
      textLines: ['Seite mit Link.'],
      linkAnnotations: [
        { uri: 'https://example.com/notiz', rect: [72, 700, 272, 730], withAppearance: true },
      ],
    },
  ]);
}

/**
 * One text page carrying one annotation of each relevant type — Text,
 * external and internal Link, ASCII, UTF-16 and appearance-bearing
 * FreeText, Ink, Highlight and Stamp — plus a second page as the
 * internal link target. Used to assert the exact objects pdf.js returns,
 * not just the mapped pipeline result.
 */
export function annotatedTypesPdf(): Buffer {
  return buildPdf([
    {
      textLines: TEXT_LINES,
      withAnnotation: true,
      linkAnnotations: [
        { uri: 'https://example.com/ziel', rect: [72, 700, 272, 730] },
        { destPage: 2, rect: [72, 640, 272, 670] },
      ],
      freeTextAnnotations: [
        { rect: [120, 560, 320, 590], contents: 'Freitext Notiz' },
        { rect: [120, 520, 320, 550], contents: 'привіт', contentsAsUtf16Hex: true },
        // With a red-filled appearance stream: the canvas paints it, the
        // annotation layer must not paint it a second time.
        { rect: [320, 560, 520, 590], contents: 'Mit Erscheinungsbild', withAppearance: true },
      ],
      inkAnnotations: [
        {
          rect: [400, 300, 500, 400],
          inkList: [
            [10, 10, 20, 20, 30, 10],
            [15, 15, 25, 25],
          ],
        },
      ],
      highlightAnnotations: [
        {
          rect: [120, 400, 320, 430],
          quadPoints: [120, 430, 320, 430, 120, 400, 320, 400],
          contents: 'Wichtig!',
        },
      ],
      stampAnnotations: [
        { rect: [320, 400, 420, 460], contents: 'Geprüft', contentsAsUtf16Hex: true, name: 'Approved' },
      ],
    },
    { textLines: ['Zweite Seite.'] },
  ]);
}

/**
 * One text page whose native text layer exists but is unusable by the
 * quality heuristic: a single character is too little text (and too few
 * words), so the pipeline routes the page to OCR while the native text
 * stays preserved. Used to prove that an OCR failure still leaves the
 * (unusable but non-empty) native text available.
 */
export function unusableNativeTextPdf(): Buffer {
  return buildPdf([{ textLines: ['X'] }]);
}

export function scannedPdf(): Buffer {
  const width = 1240;
  const height = 1754;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#111111';
  context.font = '56px sans-serif';
  context.fillText('MATHEMATIK SKRIPT', 100, 200);
  context.font = '40px sans-serif';
  context.fillText('Kapitel Eins: Grundlagen der Analysis', 100, 300);
  context.font = '36px sans-serif';
  context.fillText('Dieses Dokument wurde gescannt und enthaelt', 100, 400);
  context.fillText('keine eingebettete Textebene.', 100, 456);
  return buildPdf([{ image: { jpeg: canvas.toBuffer('image/jpeg', 92), width, height } }]);
}

/**
 * One image-only page carrying visible German, English and Ukrainian
 * text — the three default OCR languages. Used to prove that a single
 * OCR run with the combined language set recognizes all of them.
 */
export function multilingualPdf(): Buffer {
  const width = 1240;
  const height = 1754;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#111111';
  context.font = '64px sans-serif';
  context.fillText('Deutsch ÄÖÜ', 100, 200);
  context.font = '56px sans-serif';
  context.fillText('Annotation', 100, 320);
  context.font = '56px sans-serif';
  context.fillText('Анотація', 100, 440);
  context.font = '48px sans-serif';
  context.fillText('привіт :)', 100, 560);
  return buildPdf([{ image: { jpeg: canvas.toBuffer('image/jpeg', 92), width, height } }]);
}

/**
 * A realistic mixed-language printed page: three physically separated
 * paragraphs — German, English technical, Ukrainian — and deliberately no
 * handwriting, so handwriting cannot influence the OCR architecture
 * evaluation. Each block is drawn at a known rectangle (source-canvas
 * coordinates, which equal the scale-2 OCR render) so experiments can
 * crop individual blocks and score per-block recognition against ground
 * truth.
 */
export interface MixedParagraphBlock {
  /** Block rectangle in source-canvas (and scale-2 render) coordinates. */
  readonly rect: readonly [number, number, number, number];
  /** The printed lines of the block. */
  readonly lines: readonly string[];
  /** Ground-truth words used to score recognition of this block. */
  readonly words: readonly string[];
}

export const MIXED_PARAGRAPH_BLOCKS = {
  de: {
    rect: [80, 170, 1160, 400],
    lines: [
      'Dieser Abschnitt beschreibt die Grundlagen',
      'der Analysis. Für die Ableitung wird die',
      'Änderungsrate gemessen. Die größte Steigung',
      'zeigt die größte Änderung. Übungen folgen.',
    ],
    words: ['abschnitt', 'änderungsrate', 'für', 'größte', 'übungen'],
  },
  en: {
    rect: [80, 510, 1160, 740],
    lines: [
      'This section explains the derivative of a',
      'function. The annotation layer marks the',
      'slope at each point. The average rate of',
      'change follows the tangent line.',
    ],
    words: ['derivative', 'annotation', 'slope', 'function', 'tangent'],
  },
  uk: {
    rect: [80, 850, 1160, 1080],
    lines: [
      'Цей розділ пояснює основи математичного',
      'аналізу. Похідна функції описує швидкість',
      'зміни величини. Нахил дотичної показує',
      'цю швидкість у точці.',
    ],
    words: ['похідна', 'функції', 'аналізу', 'швидкість', 'дотичної'],
  },
} as const satisfies Record<string, MixedParagraphBlock>;

/** Three separated printed paragraphs (de/en/uk), no handwriting. */
export function mixedParagraphsPdf(): Buffer {
  const width = 1240;
  const height = 1754;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#111111';
  context.font = '40px Arial';
  const firstBaselines = { de: 220, en: 560, uk: 900 } as const;
  for (const [key, block] of Object.entries(MIXED_PARAGRAPH_BLOCKS)) {
    const baseline = firstBaselines[key as keyof typeof firstBaselines];
    block.lines.forEach((line, index) => {
      context.fillText(line, 100, baseline + index * 48);
    });
  }
  return buildPdf([{ image: { jpeg: canvas.toBuffer('image/jpeg', 92), width, height } }]);
}

export function mixedPdf(): Buffer {
  const width = 1240;
  const height = 1754;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#111111';
  context.font = '48px sans-serif';
  context.fillText('ANALYSIS UEBUNGEN', 100, 200);
  return buildPdf([
    { textLines: ['Erste Seite mit Textebene.', 'Diese Seite braucht kein OCR.'] },
    { image: { jpeg: canvas.toBuffer('image/jpeg', 92), width, height } },
  ]);
}
