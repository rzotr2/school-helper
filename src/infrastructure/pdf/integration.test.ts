/**
 * Real-pipeline integration tests (Node).
 *
 * These tests run the actual pdf.js + Tesseract.js pipeline against
 * hand-crafted PDF fixtures. They download Tesseract language data on the
 * first run and take longer than unit tests, so they are opt-in:
 *
 *   PDF_VERIFY=1 npx vitest run src/infrastructure/pdf/integration.test.ts
 *
 * The fixtures are built below from raw PDF syntax (no PDF libraries or
 * sample files involved). Nothing leaves the machine.
 */
import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { PdfCancellationError, PdfInspectionError } from './errors';
import { inspectPdf } from './inspect';
import { loadPdfDocument, releasePdfDocument } from './load';
import { renderPdfPage } from './render';
import type { OcrCanvasFactory } from './types';

// ── Node canvas adapter ────────────────────────────────────────────────────
//
// @napi-rs/canvas implements the drawing calls pdf.js uses, but its TS types
// differ from the DOM's: SKRSContext2D has its own TextMetrics etc., and
// Canvas is not an HTMLCanvasElement. The casts below exist only to bridge
// that type gap in Node tests.

const nodeCanvasFactory: OcrCanvasFactory = (width, height) => {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  // toImage is deferred: the PNG must be captured after pdf.js has rendered.
  return { context, toImage: () => canvas.toBuffer('image/png') };
};

// ── Minimal PDF builder ────────────────────────────────────────────────────
// Objects: 1 Catalog, 2 Pages, 3 shared Helvetica font, then per page:
// page object, content stream, optional image XObject, optional annotation.

interface ImageFixture {
  jpeg: Buffer;
  width: number;
  height: number;
}

interface FixturePage {
  textLines?: string[];
  /** Text drawn near the bottom-right corner of the page. */
  bottomTextLines?: string[];
  image?: ImageFixture;
  withAnnotation?: boolean;
}

function buildPdf(pages: FixturePage[]): Buffer {
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

  const pageObjectNumbers: number[] = [];
  let nextObject = 4;

  pushObject(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));

  for (const page of pages) {
    const pageNumber = nextObject++;
    pageObjectNumbers.push(pageNumber);
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
          '<< /Type /Annot /Subtype /Text /Rect [100 600 300 640] /Contents (Wichtige Notiz: Kapitel 2 nachlesen!) /T (Note) >>',
        ),
      );
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

const TEXT_LINES = [
  'Hallo Welt!',
  'Dies ist ein Testdokument fuer die PDF-Inspektion.',
  'Es enthaelt mehrere Zeilen Text.',
  'Damit die Qualitaetsbewertung genug zu tun hat.',
];

function textPdf(withAnnotation = false): Buffer {
  return buildPdf([{ textLines: TEXT_LINES, withAnnotation }]);
}

/** Text spread over the whole page: top-left and bottom-right lines. */
function fullPageTextPdf(): Buffer {
  return buildPdf([
    {
      textLines: ['Oben links: erste Zeile.'],
      bottomTextLines: ['Unten rechts: letzte Zeile.'],
    },
  ]);
}

function scannedPdf(): Buffer {
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

function mixedPdf(): Buffer {
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

// ── Tests ──────────────────────────────────────────────────────────────────

const runIntegration = process.env.PDF_VERIFY === '1';

describe.skipIf(!runIntegration)(
  'inspectPdf (real pdf.js + Tesseract.js pipeline)',
  { timeout: 300_000 },
  () => {
    it('uses the native text layer of a text PDF and never triggers OCR', async () => {
      const phases: string[] = [];
      const result = await inspectPdf(textPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
        onProgress: (progress) => phases.push(progress.phase),
      });

      expect(result.pageCount).toBe(1);
      expect(result.extractionMethod).toBe('native-text');
      expect(result.hasUsableText).toBe(true);
      expect(result.annotations).toEqual([]);
      // OCR progress only fires when pages are actually OCRed.
      expect(phases).toEqual(['text-extraction']);

      const page = result.pages[0];
      expect(page.extractionMethod).toBe('native-text');
      expect(page.quality.usable).toBe(true);
      expect(page.text).toContain('Hallo Welt!');
      expect(page.text).toContain('Inspektion');
      expect(page.text).toContain('\n');
    });

    it('detects a scanned PDF and OCRs it locally, preserving the page boundary', async () => {
      const result = await inspectPdf(scannedPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
      });

      expect(result.pageCount).toBe(1);
      expect(result.extractionMethod).toBe('ocr');
      expect(result.hasUsableText).toBe(true);

      const page = result.pages[0];
      expect(page.pageNumber).toBe(1);
      expect(page.extractionMethod).toBe('ocr');
      expect(page.nativeText.trim()).toBe('');
      expect(page.text.toLowerCase()).toContain('mathematik');
      expect(page.quality.usable).toBe(true);
    });

    it('collects annotations without touching the page text', async () => {
      const result = await inspectPdf(textPdf(true), {
        ocrCanvasFactory: nodeCanvasFactory,
      });

      expect(result.annotations).toHaveLength(1);
      const annotation = result.annotations[0];
      expect(annotation.pageNumber).toBe(1);
      expect(annotation.type).toBe('TEXT');
      expect(annotation.subtype).toBe('Text');
      expect(annotation.content).toContain('Wichtige Notiz');
      // pdf.js substitutes a 22x22 icon rect for appearance-less Text
      // annotations; the pipeline captures the rect pdf.js provides.
      expect(annotation.rect).toEqual({ x: 100, y: 618, width: 22, height: 22 });

      expect(result.pages[0].extractionMethod).toBe('native-text');
      expect(result.pages[0].text).toContain('Hallo Welt!');
    });

    it('combines native text and OCR pages into a mixed result', async () => {
      const result = await inspectPdf(mixedPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
      });

      expect(result.pageCount).toBe(2);
      expect(result.extractionMethod).toBe('mixed');
      expect(result.hasUsableText).toBe(true);

      const [first, second] = result.pages;
      expect(first.pageNumber).toBe(1);
      expect(first.extractionMethod).toBe('native-text');
      expect(first.text).toContain('Textebene');
      expect(second.pageNumber).toBe(2);
      expect(second.extractionMethod).toBe('ocr');
      expect(second.text.toLowerCase()).toContain('analysis');
    });

    it('rejects invalid input with a PdfInspectionError', async () => {
      await expect(
        inspectPdf(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), {
          ocrCanvasFactory: nodeCanvasFactory,
        }),
      ).rejects.toBeInstanceOf(PdfInspectionError);
    });

    it('honours an already-aborted signal with a PdfCancellationError', async () => {
      await expect(
        inspectPdf(textPdf(), {
          ocrCanvasFactory: nodeCanvasFactory,
          signal: AbortSignal.abort(),
        }),
      ).rejects.toBeInstanceOf(PdfCancellationError);
    });

    it('sizes the canvas backing store to the render viewport (full-page render)', async () => {
      const { task, doc } = await loadPdfDocument(fullPageTextPdf());
      try {
        const page = await doc.getPage(1);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        // Starts at the HTML default size, like a fresh <canvas> element in
        // the browser. Cast bridges the @napi-rs Canvas type (see adapter).
        const canvas = createCanvas(300, 150) as unknown as HTMLCanvasElement;

        const renderTask = renderPdfPage(page, canvas, scale);
        await renderTask.promise;

        // The backing store must match the render viewport, not the default.
        expect(canvas.width).toBe(Math.floor(viewport.width));
        expect(canvas.height).toBe(Math.floor(viewport.height));

        // Content near the bottom-right of the page (far beyond the default
        // 300x150 bitmap) must actually be painted: probe the region around
        // the bottom-right text line for ink.
        const context = canvas.getContext('2d');
        if (context === null) {
          throw new Error('Failed to create canvas context for the render test');
        }
        const probe = context.getImageData(
          Math.floor(viewport.width * 0.55),
          Math.floor(viewport.height * 0.88),
          Math.floor(viewport.width * 0.4),
          Math.floor(viewport.height * 0.1),
        ).data;
        const hasInk = Array.from({ length: probe.length / 4 }, (_, index) => probe[index * 4]).some(
          (red) => red < 200,
        );
        expect(hasInk).toBe(true);
      } finally {
        await releasePdfDocument(task);
      }
    });
  },
);
