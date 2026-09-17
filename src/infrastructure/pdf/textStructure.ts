import type { DocumentSection, TextBlock, TextBlockType } from './types';
export type { DocumentSection, TextBlock, TextBlockType };

/**
 * Minimal interface representing a pdf.js TextItem or compatible item.
 */
export interface LayoutTextItem {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface NormalizedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  hasEOL: boolean;
}

interface AssembledLine {
  text: string;
  y: number;
  fontSize: number;
}

const LIST_MARKER_REGEX = /^([-*•–—▪▫✓]|\d+[\.\)]|[a-zA-Z][\.\)])\s+/;

function isListPattern(text: string): boolean {
  return LIST_MARKER_REGEX.test(text);
}

function getListMarkerStyle(text: string): 'bullet' | 'number' | 'letter' | null {
  if (/^[-*•–—▪▫✓]\s+/.test(text)) return 'bullet';
  if (/^\d+[\.\)]\s+/.test(text)) return 'number';
  if (/^[a-zA-Z][\.\)]\s+/.test(text)) return 'letter';
  return null;
}

function calculateMedian(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? fallback;
}

/**
 * Assembles raw pdf.js text items into structured text blocks (paragraphs, headings, lists).
 *
 * This function is deterministic and pure:
 * 1. Groups consecutive text runs on the same baseline into lines, inserting horizontal spaces where appropriate.
 * 2. Estimates document typographic metrics (median body font size, line height).
 * 3. Segments lines into blocks based on vertical spacing, list markers, and font size changes.
 *
 * Returns an empty array when items contain no printable text.
 */
export function extractTextBlocks(items: readonly unknown[]): TextBlock[] {
  const normalized: NormalizedItem[] = [];

  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('str' in item)) continue;
    const candidate = item as LayoutTextItem;
    if (typeof candidate.str !== 'string' || candidate.str.length === 0) continue;

    const transform = Array.isArray(candidate.transform) ? candidate.transform : [];
    const scaleX = typeof transform[0] === 'number' ? transform[0] : 12;
    const skewY = typeof transform[1] === 'number' ? transform[1] : 0;
    const scaleY = typeof transform[3] === 'number' ? transform[3] : 12;
    const tx = typeof transform[4] === 'number' ? transform[4] : 0;
    const ty = typeof transform[5] === 'number' ? transform[5] : 0;

    const fontSize = Math.round(
      Math.hypot(scaleX, skewY) || Math.abs(scaleY) || candidate.height || 12,
    );

    normalized.push({
      str: candidate.str,
      x: tx,
      y: ty,
      width: typeof candidate.width === 'number' ? candidate.width : 0,
      fontSize,
      hasEOL: Boolean(candidate.hasEOL),
    });
  }

  if (normalized.length === 0) return [];

  // Step 1: Assemble text items into lines
  const lines: AssembledLine[] = [];
  let currentLineItems: NormalizedItem[] = [];
  let currentY = normalized[0].y;
  let maxFontSizeInLine = normalized[0].fontSize;

  const flushLine = () => {
    if (currentLineItems.length === 0) return;
    let text = '';
    for (let i = 0; i < currentLineItems.length; i++) {
      const cur = currentLineItems[i];
      if (i > 0) {
        const prev = currentLineItems[i - 1];
        const gap = cur.x - (prev.x + prev.width);
        if (gap > 2 && !prev.str.endsWith(' ') && !cur.str.startsWith(' ')) {
          text += ' ';
        }
      }
      text += cur.str;
    }
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      lines.push({
        text: trimmed,
        y: currentY,
        fontSize: maxFontSizeInLine,
      });
    }
    currentLineItems = [];
  };

  for (const item of normalized) {
    if (currentLineItems.length === 0) {
      currentLineItems.push(item);
      currentY = item.y;
      maxFontSizeInLine = item.fontSize;
      if (item.hasEOL) {
        flushLine();
      }
      continue;
    }

    const onSameLine = Math.abs(item.y - currentY) <= 3;
    if (onSameLine) {
      currentLineItems.push(item);
      if (item.fontSize > maxFontSizeInLine) {
        maxFontSizeInLine = item.fontSize;
      }
      if (item.hasEOL) {
        flushLine();
      }
    } else {
      flushLine();
      currentLineItems = [item];
      currentY = item.y;
      maxFontSizeInLine = item.fontSize;
      if (item.hasEOL) {
        flushLine();
      }
    }
  }
  flushLine();

  if (lines.length === 0) return [];

  // Step 2: Compute typographic metrics (median font size & typical line height)
  const medianFontSize = calculateMedian(
    lines.map((line) => line.fontSize),
    12,
  );

  const verticalDeltas: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const delta = lines[i - 1].y - lines[i].y;
    if (delta > 0 && delta < medianFontSize * 3.5) {
      verticalDeltas.push(delta);
    }
  }
  const medianLineHeight = calculateMedian(verticalDeltas, medianFontSize * 1.3);

  // Step 3: Segment lines into TextBlocks
  const blocks: TextBlock[] = [];
  let currentBlockLines: AssembledLine[] = [lines[0]];

  const flushBlock = () => {
    if (currentBlockLines.length === 0) return;
    const firstLine = currentBlockLines[0];
    const text = currentBlockLines.map((l) => l.text).join('\n');

    const isHeading =
      currentBlockLines.length === 1 &&
      firstLine.fontSize >= medianFontSize * 1.25 &&
      firstLine.text.length < 150 &&
      (!isListPattern(firstLine.text) || firstLine.fontSize >= medianFontSize * 1.4);

    const isList =
      !isHeading &&
      (currentBlockLines.every((l) => isListPattern(l.text)) || isListPattern(firstLine.text));

    let type: TextBlockType = 'paragraph';
    if (isHeading) {
      type = 'heading';
    } else if (isList) {
      type = 'list';
    }

    blocks.push({ text, type });
    currentBlockLines = [];
  };

  for (let i = 1; i < lines.length; i++) {
    const prevLine = lines[i - 1];
    const currLine = lines[i];
    const deltaY = prevLine.y - currLine.y;

    const prevIsHeading =
      prevLine.fontSize >= medianFontSize * 1.25 && prevLine.text.length < 150;
    const currIsHeading =
      currLine.fontSize >= medianFontSize * 1.25 && currLine.text.length < 150;
    const prevIsList = isListPattern(prevLine.text);
    const currIsList = isListPattern(currLine.text);

    const isParagraphGap = deltaY > medianLineHeight * 1.6;
    const isDifferentListStyle =
      currIsList && prevIsList && getListMarkerStyle(prevLine.text) !== getListMarkerStyle(currLine.text);

    const shouldBreak =
      prevIsHeading ||
      currIsHeading ||
      (currIsList && !prevIsList) ||
      (!currIsList && prevIsList) ||
      isDifferentListStyle ||
      isParagraphGap;

    if (shouldBreak) {
      flushBlock();
    }
    currentBlockLines.push(currLine);
  }
  flushBlock();

  return blocks;
}

export interface SectionBuildingPage {
  pageNumber: number;
  blocks?: TextBlock[];
}

/**
 * Builds deterministic document sections from page-level TextBlocks.
 *
 * Rules:
 * 1. Iterates pages in ascending pageNumber order.
 * 2. Within each page, iterates blocks in order.
 * 3. A block with `type === 'heading'` starts a new section.
 * 4. Content before the first heading forms an untitled section (`title: null`).
 * 5. Sections can span multiple pages until the next heading is encountered.
 * 6. Pages without blocks are skipped and do not extend pageEnd or synthesize fake sections.
 * 7. Blocks and text content are preserved exactly without rewriting.
 *
 * Returns an empty array when there are no usable blocks.
 */
export function buildDocumentSections(
  pages: readonly SectionBuildingPage[] | null | undefined,
): DocumentSection[] {
  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return [];
  }

  // Defensive: sort by pageNumber ascending
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  const sections: DocumentSection[] = [];
  let currentSection: DocumentSection | null = null;

  for (const page of sortedPages) {
    if (!page || !Array.isArray(page.blocks) || page.blocks.length === 0) {
      continue;
    }

    for (const block of page.blocks) {
      if (!block || typeof block.text !== 'string' || typeof block.type !== 'string') {
        continue;
      }

      if (block.type === 'heading') {
        if (currentSection !== null && currentSection.blocks.length > 0) {
          sections.push(currentSection);
        }
        currentSection = {
          title: block.text,
          blocks: [block],
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
        };
      } else {
        if (currentSection === null) {
          currentSection = {
            title: null,
            blocks: [block],
            pageStart: page.pageNumber,
            pageEnd: page.pageNumber,
          };
        } else {
          currentSection.blocks.push(block);
          currentSection.pageEnd = page.pageNumber;
        }
      }
    }
  }

  if (currentSection !== null && currentSection.blocks.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}
