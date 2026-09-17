/**
 * Real-pipeline integration tests (Node).
 *
 * These tests run the actual pdf.js + Tesseract.js pipeline against
 * hand-crafted PDF fixtures. They download Tesseract language data on the
 * first run and take longer than unit tests, so they are opt-in:
 *
 *   PDF_VERIFY=1 npx vitest run src/infrastructure/pdf/integration.test.ts
 *
 * The fixtures live in pdfFixtures.ts and are built from raw PDF syntax
 * (no PDF libraries or sample files involved). Nothing leaves the machine.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PdfCancellationError, PdfInspectionError } from './errors';
import { inspectPdf, inspectPdfDocument } from './inspect';
import { loadPdfDocument, releasePdfDocument } from './load';
import { ocrPdfPages } from './ocr';
import { renderPdfPage } from './render';
import type { OcrCanvasFactory } from './types';
import {
  annotatedTypesPdf,
  fullPageTextPdf,
  linkAppearancePdf,
  linkedTextPdf,
  mixedPdf,
  multilingualPdf,
  nodeCanvasFactory,
  scannedPdf,
  textPdf,
  unusableNativeTextPdf,
} from './pdfFixtures';

// ── Tests ──────────────────────────────────────────────────────────────────

// Records every createWorker call across the file while passing through to
// the real implementation — the module namespace of the CommonJS tesseract
// build cannot be spied on directly (not configurable in ESM).
const { createWorkerCalls } = vi.hoisted(() => ({ createWorkerCalls: [] as unknown[][] }));
vi.mock('tesseract.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tesseract.js')>();
  return {
    ...actual,
    createWorker: (...args: unknown[]) => {
      createWorkerCalls.push(args);
      return actual.createWorker(...(args as Parameters<typeof actual.createWorker>));
    },
  };
});

const runIntegration = process.env.PDF_VERIFY === '1';

// 600 s: cold-cache runs download three language files from the CDN, and
// a transient network stall has taken a single file past five minutes.
describe.skipIf(!runIntegration)(
  'inspectPdf (real pdf.js + Tesseract.js pipeline)',
  { timeout: 600_000 },
  () => {
    it('extracts the native text layer of a text PDF and still OCRs the page automatically', async () => {
      const phases: string[] = [];
      const result = await inspectPdf(textPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
        onProgress: (progress) => phases.push(progress.phase),
      });

      expect(result.pageCount).toBe(1);
      expect(result.hasUsableText).toBe(true);
      expect(result.annotations).toEqual([]);
      // Automatic processing runs BOTH passes — native extraction first,
      // then OCR — even though the native text is perfectly usable.
      expect(phases).toEqual(['text-extraction', 'ocr']);

      // TEST 1, native page with automatic OCR: both representations
      // exist independently.
      const page = result.pages[0];
      expect(page.ocrStatus).toBe('completed');
      expect((page.ocrText ?? '').length).toBeGreaterThan(0);
      expect(page.quality.usable).toBe(true);
      expect(page.nativeText).toContain('Hallo Welt!');
      expect(page.nativeText).toContain('Inspektion');
      expect(page.nativeText).toContain('\n');
    });

    it('detects a scanned PDF and OCRs it locally, preserving the page boundary', async () => {
      const result = await inspectPdf(scannedPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
      });

      expect(result.pageCount).toBe(1);
      expect(result.hasUsableText).toBe(true);

      // TEST 2, missing native text: the (empty) native layer stays as it
      // is and OCR lands in its own representation.
      const page = result.pages[0];
      expect(page.pageNumber).toBe(1);
      expect(page.nativeText.trim()).toBe('');
      expect(page.quality.usable).toBe(false);
      expect(page.ocrStatus).toBe('completed');
      expect((page.ocrText ?? '').toLowerCase()).toContain('mathematik');
    });

    it('recognizes German, English and Ukrainian in one worker with the combined default language set', async () => {
      createWorkerCalls.length = 0;
      const result = await inspectPdf(multilingualPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
      });

      // One worker runs the whole page with the full default language set
      // (ukr first — the order decides the script of ambiguous words, see
      // the comparison test below) — one worker proves the models were
      // active in the same pass (separate per-language passes would not
      // share one worker).
      expect(createWorkerCalls).toHaveLength(1);
      expect(createWorkerCalls[0]?.[0]).toEqual(['ukr', 'deu', 'eng']);
      expect(createWorkerCalls[0]?.[1]).toBe(1);

      const page = result.pages[0];
      expect(page.ocrStatus).toBe('completed');
      expect(page.nativeText.trim()).toBe('');
      expect(page.quality.usable).toBe(false);

      // Normalized fragments — glyph-level recognition varies slightly
      // across Tesseract versions, so each language gets its own loose
      // assertion instead of an exact-output comparison.
      const text = (page.ocrText ?? '').toLowerCase();
      expect(text).toContain('deutsch');
      expect(text).toContain('annotation');
      // The printed Ukrainian line must come back as genuine Cyrillic
      // (in practice 'Анотаціхія'). A Latin transliteration such as
      // 'AHoTaußa' — what the deu+eng+ukr order produces for the same
      // image — is a recognition failure, not an acceptable equivalent.
      expect(text).toContain('анота');
      expect(text).not.toContain('ahotau');
      // The handwritten line is recognized approximately ('привіх)т').
      expect(text).toContain('приві');
    });

    it('recognizes the Ukrainian line in Cyrillic like the single ukr model (no script-mixing interference)', async () => {
      // Diagnostic comparison on the SAME rendered image: the fixture is
      // OCRable by the ukr model alone, and the combined default language
      // set must match that on the printed Ukrainian line. This guards
      // against language-order regressions that transliterate Cyrillic
      // into Latin lookalikes while still "recognizing" the other lines.
      const { task, doc } = await loadPdfDocument(multilingualPdf());
      try {
        const ukrOnly = await ocrPdfPages(doc, [1], { canvasFactory: nodeCanvasFactory, language: 'ukr' });
        const combined = await ocrPdfPages(doc, [1], { canvasFactory: nodeCanvasFactory });

        const ukrText = (ukrOnly.textByPage.get(1)?.text ?? '').toLowerCase();
        const combinedText = (combined.textByPage.get(1)?.text ?? '').toLowerCase();
        expect(ukrOnly.failedPages.size).toBe(0);
        expect(combined.failedPages.size).toBe(0);
        expect(ukrText).toContain('анота');
        expect(combinedText).toContain('анота');
        expect(combinedText).toContain('deutsch');
        expect(combinedText).toContain('annotation');
      } finally {
        await releasePdfDocument(task);
      }
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

      expect(result.pages[0].ocrStatus).toBe('completed');
      expect(result.pages[0].nativeText).toContain('Hallo Welt!');
    });

    it('combines native text and OCR into a result with both representations on every page', async () => {
      const result = await inspectPdf(mixedPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
      });

      expect(result.pageCount).toBe(2);
      expect(result.hasUsableText).toBe(true);

      // Both representations coexist on EVERY page, each with its own
      // status — automatic OCR runs for usable native pages too.
      const [first, second] = result.pages;
      expect(first.pageNumber).toBe(1);
      expect(first.ocrStatus).toBe('completed');
      expect((first.ocrText ?? '').length).toBeGreaterThan(0);
      expect(first.nativeText).toContain('Textebene');
      expect(second.pageNumber).toBe(2);
      expect(second.ocrStatus).toBe('completed');
      expect((second.ocrText ?? '').toLowerCase()).toContain('analysis');
    });

    it('keeps the native representation intact when OCR runs again explicitly on a page with good native text', async () => {
      const { task, doc } = await loadPdfDocument(textPdf());
      try {
        const inspection = await inspectPdfDocument(doc, { ocrCanvasFactory: nodeCanvasFactory });
        const before = inspection.pages[0];
        // Automatic processing already OCRed this page although its native
        // text is good.
        expect(before.ocrStatus).toBe('completed');
        expect(before.ocrText).not.toBeNull();
        expect(before.quality.usable).toBe(true);

        // TEST 3: an explicit re-run still operates on the rendered page
        // and lands in its own field — the native text and its quality
        // stay exactly as they were.
        const outcome = await ocrPdfPages(doc, [1], { canvasFactory: nodeCanvasFactory });
        expect(outcome.failedPages.size).toBe(0);
        const ocrText = outcome.textByPage.get(1)?.text ?? '';
        expect(ocrText).not.toBe('');

        expect(before.nativeText).toContain('Hallo Welt!');
        expect(before.nativeText).toBe(inspection.pages[0].nativeText);
        expect(before.quality).toEqual(inspection.pages[0].quality);
        expect(inspection.pages[0].ocrText).not.toBeNull();
      } finally {
        await releasePdfDocument(task);
      }
    });

    it('runs OCR on the rendered page of an annotated document and stores it independently of the native text', async () => {
      const { task, doc } = await loadPdfDocument(annotatedTypesPdf());
      try {
        const inspection = await inspectPdfDocument(doc, { ocrCanvasFactory: nodeCanvasFactory });
        const page = inspection.pages[0];
        expect(page.ocrStatus).toBe('completed');
        expect(page.nativeText).toContain('Hallo Welt!');
        // Annotation contents stay out of the native text layer.
        expect(page.nativeText).not.toContain('Freitext Notiz');

        // TEST 4: OCR receives the RENDERED page image (annotation
        // appearances included). No wording assertions against Tesseract —
        // recognition of painted content is not deterministic. What is
        // guaranteed: OCR output exists, is stored separately and never
        // modifies the native representation.
        const outcome = await ocrPdfPages(doc, [1], { canvasFactory: nodeCanvasFactory });
        expect(outcome.failedPages.size).toBe(0);
        const ocrText = outcome.textByPage.get(1)?.text ?? '';
        expect(ocrText).not.toBe('');
        expect(page.nativeText).toContain('Hallo Welt!');
        expect(page.ocrText).not.toBeNull();
      } finally {
        await releasePdfDocument(task);
      }
    });

    it('keeps the native text available and marks the page failed when OCR fails', async () => {
      const failingCanvasFactory: OcrCanvasFactory = () => {
        throw new Error('canvas unavailable');
      };

      // TEST 5: unusable (but non-empty) native text + failing OCR. The
      // native layer is preserved and the OCR side fails cleanly without
      // aborting the whole inspection.
      const result = await inspectPdf(unusableNativeTextPdf(), {
        ocrCanvasFactory: failingCanvasFactory,
      });

      const page = result.pages[0];
      expect(page.nativeText).not.toBe('');
      expect(page.quality.usable).toBe(false);
      expect(page.ocrText).toBeNull();
      expect(page.ocrStatus).toBe('failed');
      expect(result.hasUsableText).toBe(false);
    });

    it('aborts a running OCR pass with a PdfCancellationError (cancellation is not a page failure)', async () => {
      // TEST 6: cancellation still aborts the whole run — it must never be
      // recorded as a per-page failure.
      const controller = new AbortController();
      let aborted = false;
      const promise = inspectPdf(scannedPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
        signal: controller.signal,
        onProgress: (progress) => {
          // Abort as soon as the OCR phase starts — the worker is running.
          if (progress.phase === 'ocr' && !aborted) {
            aborted = true;
            controller.abort();
          }
        },
      });
      await expect(promise).rejects.toBeInstanceOf(PdfCancellationError);
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

    it('captures link annotation targets (external URL and internal page)', async () => {
      const result = await inspectPdf(linkedTextPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
      });

      const links = result.annotations.filter((annotation) => annotation.type === 'LINK');
      expect(links).toHaveLength(2);

      const external = links.find((link) => link.url !== null);
      expect(external).toBeDefined();
      expect(external?.url).toBe('https://example.com/notiz');
      expect(external?.targetPageNumber).toBeNull();

      const internal = links.find((link) => link.targetPageNumber !== null);
      expect(internal).toBeDefined();
      expect(internal?.url).toBeNull();
      expect(internal?.targetPageNumber).toBe(2);

      // Annotation metadata stays separate from the extracted text.
      expect(result.pages[0].nativeText).toContain('Hallo Welt!');
      expect(result.pages[0].nativeText).not.toContain('https://example.com');
    });

    it('returns the exact pdf.js annotation objects (Text, Link, FreeText, Ink, Highlight, Stamp) and maps them without touching the text', async () => {
      const { task, doc } = await loadPdfDocument(annotatedTypesPdf());
      try {
        const page = await doc.getPage(1);
        // Assert the raw objects pdf.js returns for intent display — the
        // ground truth the pipeline consumes.
        const raw = await page.getAnnotations({ intent: 'display' });

        // /Annots order is preserved; every annotation carries a stable id.
        expect(raw.map((annotation) => annotation.subtype)).toEqual([
          'Text',
          'Link',
          'Link',
          'FreeText',
          'FreeText',
          'FreeText',
          'Ink',
          'Highlight',
          'Stamp',
        ]);
        for (const annotation of raw) {
          expect(typeof annotation.id).toBe('string');
          expect(annotation.id.length).toBeGreaterThan(0);
        }

        // Text: pdf.js substitutes a 22x22 icon rect for appearance-less
        // Text annotations, keeps the /Name icon name and exposes the
        // contents under contentsObj.
        const text = raw[0];
        expect(text.annotationType).toBe(pdfjs.AnnotationType.TEXT);
        expect(text.rect).toEqual([100, 618, 122, 640]);
        expect(text.name).toBe('Note');
        expect(text.contentsObj.str).toBe('Wichtige Notiz: Kapitel 2 nachlesen!');
        expect(text.url).toBeUndefined();
        expect(text.dest).toBeUndefined();

        // Link (URI action): the URL lands in url, no dest for URI links.
        const externalLink = raw[1];
        expect(externalLink.annotationType).toBe(pdfjs.AnnotationType.LINK);
        expect(externalLink.rect).toEqual([72, 700, 272, 730]);
        expect(externalLink.url).toBe('https://example.com/ziel');
        expect(externalLink.dest).toBeUndefined();

        // Link (GoTo action): no url; dest is the explicit destination
        // array — the target page reference followed by the parsed name
        // object pdf.js returns for the destination type.
        const internalLink = raw[2];
        expect(internalLink.annotationType).toBe(pdfjs.AnnotationType.LINK);
        expect(internalLink.rect).toEqual([72, 640, 272, 670]);
        expect(internalLink.url).toBeUndefined();
        expect(Array.isArray(internalLink.dest)).toBe(true);
        expect(typeof internalLink.dest[0]).toBe('object');
        expect(internalLink.dest[0].num).toBeTypeOf('number');
        expect(internalLink.dest[1]).toEqual({ name: 'FitH' });

        // FreeText keeps its own rect and contents.
        const freeText = raw[3];
        expect(freeText.annotationType).toBe(pdfjs.AnnotationType.FREETEXT);
        expect(freeText.rect).toEqual([120, 560, 320, 590]);
        expect(freeText.contentsObj.str).toBe('Freitext Notiz');
        expect(freeText.url).toBeUndefined();
        expect(freeText.dest).toBeUndefined();

        // FreeText with UTF-16BE /Contents decodes exactly like real
        // annotation tools write non-ASCII text.
        const freeTextUtf16 = raw[4];
        expect(freeTextUtf16.annotationType).toBe(pdfjs.AnnotationType.FREETEXT);
        expect(freeTextUtf16.rect).toEqual([120, 520, 320, 550]);
        expect(freeTextUtf16.contentsObj.str).toBe('привіт');
        expect(freeTextUtf16.contentsObj.dir).toBe('ltr');

        // FreeText with a /AP appearance: same metadata shape as the other
        // FreeTexts. pdf.js does not expose the appearance stream on the
        // annotation object — it is a rendering concern (painted by the
        // canvas) — but it does flag the presence of an /AP via
        // hasAppearance, which is what the layer uses to avoid duplicating
        // the canvas text.
        const freeTextAp = raw[5];
        expect(freeTextAp.annotationType).toBe(pdfjs.AnnotationType.FREETEXT);
        expect(freeTextAp.rect).toEqual([320, 560, 520, 590]);
        expect(freeTextAp.contentsObj.str).toBe('Mit Erscheinungsbild');
        expect(freeTextAp.hasAppearance).toBe(true);
        expect(freeText.hasAppearance).toBe(false);

        // Ink exposes its strokes as Float32Arrays under inkLists. For an
        // appearance-less Ink annotation pdf.js replaces the rect with the
        // stroke bounding box (default border width 1 -> +-2 padding):
        // strokes [10 10 .. 30 10] and [15 15 .. 25 25] -> [8 8 32 27].
        const ink = raw[6];
        expect(ink.annotationType).toBe(pdfjs.AnnotationType.INK);
        expect(ink.rect).toEqual([8, 8, 32, 27]);
        expect(ink.inkLists).toHaveLength(2);
        expect(ink.inkLists[0]).toBeInstanceOf(Float32Array);
        expect(Array.from(ink.inkLists[0])).toEqual([10, 10, 20, 20, 30, 10]);
        expect(Array.from(ink.inkLists[1])).toEqual([15, 15, 25, 25]);

        // Highlight carries its quad points (as a Float32Array) and contents.
        const highlight = raw[7];
        expect(highlight.annotationType).toBe(pdfjs.AnnotationType.HIGHLIGHT);
        expect(highlight.rect).toEqual([120, 400, 320, 430]);
        expect(highlight.quadPoints).toBeInstanceOf(Float32Array);
        expect(Array.from(highlight.quadPoints)).toEqual([120, 430, 320, 430, 120, 400, 320, 400]);
        expect(highlight.contentsObj.str).toBe('Wichtig!');

        // Stamp keeps its rect and contents; pdf.js does not attach an icon
        // name to Stamp annotations (Text annotations are the ones with a
        // /Name-driven icon).
        const stamp = raw[8];
        expect(stamp.annotationType).toBe(pdfjs.AnnotationType.STAMP);
        expect(stamp.rect).toEqual([320, 400, 420, 460]);
        expect(stamp.contentsObj.str).toBe('Geprüft');
        expect(stamp.name).toBeUndefined();
      } finally {
        await releasePdfDocument(task);
      }

      // The inspection pipeline maps the same objects and keeps annotation
      // content out of the extracted text.
      const result = await inspectPdf(annotatedTypesPdf(), {
        ocrCanvasFactory: nodeCanvasFactory,
      });
      expect(result.annotations.map((annotation) => annotation.type)).toEqual([
        'TEXT',
        'LINK',
        'LINK',
        'FREETEXT',
        'FREETEXT',
        'FREETEXT',
        'INK',
        'HIGHLIGHT',
        'STAMP',
      ]);
      expect(result.annotations[1]?.url).toBe('https://example.com/ziel');
      expect(result.annotations[2]?.targetPageNumber).toBe(2);
      expect(result.annotations[3]?.content).toBe('Freitext Notiz');
      expect(result.annotations[4]?.content).toBe('привіт');
      expect(result.annotations[5]?.content).toBe('Mit Erscheinungsbild');
      expect(result.annotations[5]?.rect).toEqual({ x: 320, y: 560, width: 200, height: 30 });
      expect(result.annotations[7]?.content).toBe('Wichtig!');
      expect(result.annotations[8]?.content).toBe('Geprüft');
      expect(result.annotations[8]?.rect).toEqual({ x: 320, y: 400, width: 100, height: 60 });
      expect(result.pages[0].ocrStatus).toBe('completed');
      expect(result.pages[0].nativeText).toContain('Hallo Welt!');
      expect(result.pages[0].nativeText).not.toContain('Freitext Notiz');
      expect(result.pages[0].nativeText).not.toContain('привіт');
      expect(result.pages[0].nativeText).not.toContain('Mit Erscheinungsbild');
      expect(result.pages[0].nativeText).not.toContain('Wichtig!');
      expect(result.pages[0].nativeText).not.toContain('Geprüft');
      expect(result.pages[0].nativeText).not.toContain('https://example.com');
    });

    it('renders the link annotation appearance into the canvas (annotationMode ENABLE)', async () => {
      const { task, doc } = await loadPdfDocument(linkAppearancePdf());
      try {
        const page = await doc.getPage(1);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(
          Math.floor(viewport.width),
          Math.floor(viewport.height),
        ) as unknown as HTMLCanvasElement;

        const renderTask = renderPdfPage(page, canvas, scale);
        await renderTask.promise;

        // The link rect [72 700 272 730] (PDF, bottom-left origin) maps to
        // backing y 124..184 at scale 2 (1584 - 2*730 .. 1584 - 2*700),
        // x 144..544. The interior of that region must carry the red /AP
        // fill.
        const context = canvas.getContext('2d');
        if (context === null) {
          throw new Error('Failed to create canvas context for the annotation render test');
        }
        const probe = context.getImageData(200, 140, 150, 30).data;
        const hasRedFill = Array.from({ length: probe.length / 4 }, (_, index) => index * 4).some(
          (index) => probe[index] > 200 && probe[index + 1] < 100 && probe[index + 2] < 100,
        );
        expect(hasRedFill).toBe(true);
      } finally {
        await releasePdfDocument(task);
      }
    });

    it('renders the FreeText /AP appearance into the canvas (annotationMode ENABLE)', async () => {
      const { task, doc } = await loadPdfDocument(annotatedTypesPdf());
      try {
        const page = await doc.getPage(1);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(
          Math.floor(viewport.width),
          Math.floor(viewport.height),
        ) as unknown as HTMLCanvasElement;

        const renderTask = renderPdfPage(page, canvas, scale);
        await renderTask.promise;

        // The FreeText rect [320 560 520 590] maps to backing y 404..464
        // at scale 2 (1584 - 2*590 .. 1584 - 2*560), x 640..1040. Only
        // this annotation carries a /AP in the fixture — the other fixture
        // content sits elsewhere on the page — so probing the interior of
        // that region isolates the appearance ink.
        const context = canvas.getContext('2d');
        if (context === null) {
          throw new Error('Failed to create canvas context for the FreeText /AP render test');
        }
        const probe = context.getImageData(700, 420, 150, 30).data;
        const hasRedFill = Array.from({ length: probe.length / 4 }, (_, index) => index * 4).some(
          (index) => probe[index] > 200 && probe[index + 1] < 100 && probe[index + 2] < 100,
        );
        expect(hasRedFill).toBe(true);
      } finally {
        await releasePdfDocument(task);
      }
    });
  },
);
