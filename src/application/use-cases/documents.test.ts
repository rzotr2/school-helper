import { describe, it, expect } from 'vitest';
import { MAX_FILE_SIZE_BYTES, normalizeDocumentName, uploadDocument } from './documents';

describe('normalizeDocumentName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeDocumentName('  Mathematik Skript.pdf  ')).toBe('Mathematik Skript.pdf');
  });

  it('keeps an existing .pdf suffix', () => {
    expect(normalizeDocumentName('Skript.pdf')).toBe('Skript.pdf');
  });

  it('appends .pdf when the suffix is missing', () => {
    expect(normalizeDocumentName('Skript')).toBe('Skript.pdf');
  });

  it('does not append .pdf when the suffix is uppercase', () => {
    expect(normalizeDocumentName('Skript.PDF')).toBe('Skript.PDF');
  });

  it('rejects an empty name', () => {
    expect(() => normalizeDocumentName('')).toThrow('Dateiname darf nicht leer sein');
    expect(() => normalizeDocumentName('   ')).toThrow('Dateiname darf nicht leer sein');
  });

  it('rejects a bare .pdf name', () => {
    expect(() => normalizeDocumentName('.pdf')).toThrow('Dateiname darf nicht leer sein');
  });

  it('accepts a name at the 255 character limit', () => {
    const atLimit = `${'a'.repeat(251)}.pdf`;
    expect(normalizeDocumentName(atLimit)).toBe(atLimit);
  });

  it('rejects a name longer than 255 characters', () => {
    expect(() => normalizeDocumentName(`${'a'.repeat(252)}.pdf`)).toThrow('Dateiname darf maximal 255 Zeichen lang sein');
  });
});

describe('uploadDocument validation', () => {
  // These validations run before any Supabase call, so the tests execute
  // without infrastructure. If the validation order ever changes, they fail.
  it('rejects a non-PDF file', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    await expect(uploadDocument('user-1', 'topic-1', file)).rejects.toThrow('Only PDF files are supported');
  });

  it('rejects a file larger than 10 MB', async () => {
    const file = new File([new Uint8Array(MAX_FILE_SIZE_BYTES + 1)], 'big.pdf', { type: 'application/pdf' });
    await expect(uploadDocument('user-1', 'topic-1', file)).rejects.toThrow('File exceeds the 10MB limit');
  });

  it('rejects a file with an empty name', async () => {
    const file = new File(['x'], '   ', { type: 'application/pdf' });
    await expect(uploadDocument('user-1', 'topic-1', file)).rejects.toThrow('File name cannot be empty');
  });

  it('rejects an unauthenticated user', async () => {
    const file = new File(['x'], 'ok.pdf', { type: 'application/pdf' });
    await expect(uploadDocument('', 'topic-1', file)).rejects.toThrow('User must be authenticated');
  });
});
