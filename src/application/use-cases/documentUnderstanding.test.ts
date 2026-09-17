import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prepareUnderstandingInput,
  validateDocumentUnderstanding,
  understandDocument,
  type DocumentUnderstanding,
} from './documentUnderstanding';
import type { DocumentContent } from './documentContent';

describe('prepareUnderstandingInput', () => {
  it('returns empty string for null or empty content', () => {
    expect(prepareUnderstandingInput(null)).toBe('');
    expect(prepareUnderstandingInput({ pages: [] })).toBe('');
  });

  it('prefers structural blocks formatted cleanly as markdown', () => {
    const content: DocumentContent = {
      pages: [
        {
          pageNumber: 1,
          nativeText: 'Ignored raw text',
          quality: {
            usable: true,
            charCount: 16,
            printableRatio: 1,
            whitespaceRatio: 0.1,
            alphanumericRatio: 0.9,
            wordCount: 3,
            replacementCharCount: 0,
            reasons: [],
          },
          ocrText: null,
          ocrStatus: 'not-generated',
          blocks: [
            { type: 'heading', text: 'Einführung in SQL' },
            { type: 'paragraph', text: 'SQL steht für Structured Query Language.' },
            { type: 'list', text: 'SELECT Abfragen' },
            { type: 'list', text: 'INSERT Anweisungen' },
          ],
        },
      ],
    };

    const input = prepareUnderstandingInput(content);
    expect(input).toContain('--- Seite 1 ---');
    expect(input).toContain('## Einführung in SQL');
    expect(input).toContain('SQL steht für Structured Query Language.');
    expect(input).toContain('- SELECT Abfragen');
    expect(input).toContain('- INSERT Anweisungen');
    expect(input).not.toContain('Ignored raw text');
  });

  it('falls back to nativeText when blocks are absent or empty', () => {
    const content: DocumentContent = {
      pages: [
        {
          pageNumber: 1,
          nativeText: 'Das ist nativer Seitentext ohne Strukturblöcke.',
          quality: {
            usable: true,
            charCount: 45,
            printableRatio: 1,
            whitespaceRatio: 0.15,
            alphanumericRatio: 0.85,
            wordCount: 7,
            replacementCharCount: 0,
            reasons: [],
          },
          ocrText: 'OCR Text',
          ocrStatus: 'completed',
        },
      ],
    };

    const input = prepareUnderstandingInput(content);
    expect(input).toContain('--- Seite 1 ---');
    expect(input).toContain('Das ist nativer Seitentext ohne Strukturblöcke.');
    expect(input).not.toContain('OCR Text');
  });

  it('uses ocrText when native text is unusable', () => {
    const content: DocumentContent = {
      pages: [
        {
          pageNumber: 1,
          nativeText: '?? ### ???',
          quality: {
            usable: false,
            charCount: 10,
            printableRatio: 0.2,
            whitespaceRatio: 0.3,
            alphanumericRatio: 0,
            wordCount: 3,
            replacementCharCount: 0,
            reasons: ['unusable'],
          },
          ocrText: 'Gescannter Text aus OCR Erkennung',
          ocrStatus: 'completed',
        },
      ],
    };

    const input = prepareUnderstandingInput(content);
    expect(input).toContain('--- Seite 1 ---');
    expect(input).toContain('Gescannter Text aus OCR Erkennung');
    expect(input).not.toContain('?? ### ???');
  });

  it('respects maxChars and appends truncation notice', () => {
    const content: DocumentContent = {
      pages: [
        {
          pageNumber: 1,
          nativeText: 'A'.repeat(200),
          quality: {
            usable: true,
            charCount: 200,
            printableRatio: 1,
            whitespaceRatio: 0,
            alphanumericRatio: 1,
            wordCount: 1,
            replacementCharCount: 0,
            reasons: [],
          },
          ocrText: null,
          ocrStatus: 'not-generated',
        },
      ],
    };

    const input = prepareUnderstandingInput(content, 100);
    expect(input.length).toBeLessThanOrEqual(150);
    expect(input).toContain('[Inhalt gekürzt]');
  });
});

describe('validateDocumentUnderstanding', () => {
  it('validates a complete, well-formed understanding payload', () => {
    const raw = {
      title: 'IT-Dienstleistungen Aufgaben',
      documentType: 'worksheet',
      subject: 'Informatik',
      summary: 'Ein Aufgabenblatt zu IT-Dienstleistungen und Service Level Agreements.',
      keyTopics: ['SLA', 'ITIL', 'Helpdesk', 'Dienstleistungen'],
      analyzedAt: '2026-09-17T12:00:00.000Z',
    };

    const result = validateDocumentUnderstanding(raw);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('IT-Dienstleistungen Aufgaben');
    expect(result?.documentType).toBe('worksheet');
    expect(result?.subject).toBe('Informatik');
    expect(result?.summary).toBe(raw.summary);
    expect(result?.keyTopics).toEqual(['SLA', 'ITIL', 'Helpdesk', 'Dienstleistungen']);
    expect(result?.analyzedAt).toBe('2026-09-17T12:00:00.000Z');
  });

  it('normalizes unknown documentType to "other"', () => {
    const raw = {
      title: 'Test Doc',
      documentType: 'unknown-category',
      summary: 'Some summary',
      keyTopics: ['Topic A', 'Topic B', 'Topic C'],
    };

    const result = validateDocumentUnderstanding(raw);
    expect(result?.documentType).toBe('other');
  });

  it('trims strings, filters duplicate topics, clamps to 10 topics', () => {
    const raw = {
      title: '   Trimmed Title   ',
      documentType: 'exam',
      summary: '   Valid summary   ',
      keyTopics: [
        'Topic 1',
        'Topic 2',
        'Topic 1', // duplicate
        'Topic 3',
        'Topic 4',
        'Topic 5',
        'Topic 6',
        'Topic 7',
        'Topic 8',
        'Topic 9',
        'Topic 10',
        'Topic 11', // extra
      ],
    };

    const result = validateDocumentUnderstanding(raw);
    expect(result?.title).toBe('Trimmed Title');
    expect(result?.summary).toBe('Valid summary');
    expect(result?.keyTopics.length).toBe(10);
    expect(result?.keyTopics).not.toContain('Topic 11');
  });

  it('returns null if summary is missing or empty', () => {
    expect(validateDocumentUnderstanding({ title: 'T', summary: '' })).toBeNull();
    expect(validateDocumentUnderstanding({ title: 'T' })).toBeNull();
    expect(validateDocumentUnderstanding(null)).toBeNull();
    expect(validateDocumentUnderstanding('string')).toBeNull();
  });
});

describe('understandDocument', () => {
  it('rejects without authenticated user or documentId', async () => {
    await expect(understandDocument('', 'doc-1')).rejects.toThrow('User must be authenticated');
    await expect(understandDocument('user-1', '')).rejects.toThrow('Document ID is required');
  });
});

describe('understandDocument idempotency & caching', () => {
  it('reuses existing valid understanding if force is not set', async () => {
    const existingUnderstanding: DocumentUnderstanding = {
      title: 'Existing',
      documentType: 'summary',
      subject: 'Bio',
      summary: 'Short summary',
      keyTopics: ['Topic A', 'Topic B', 'Topic C'],
      analyzedAt: '2026-09-17T10:00:00.000Z',
    };

    const fromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'doc-1',
              owner_id: 'user-1',
              original_name: 'Bio.pdf',
              content: null,
              understanding: existingUnderstanding,
            },
            error: null,
          }),
        }),
      }),
    });

    const { supabase } = await import('../../infrastructure/supabase/client');
    vi.spyOn(supabase, 'from').mockImplementation(fromMock as any);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await understandDocument('user-1', 'doc-1');
    expect(result).toEqual(existingUnderstanding);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
