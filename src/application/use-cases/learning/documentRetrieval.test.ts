import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retrieveTopicDocuments } from './documentRetrieval';
import { supabase } from '../../../infrastructure/supabase/client';

vi.mock('../../../infrastructure/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('retrieveTopicDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when user is not authenticated', async () => {
    await expect(retrieveTopicDocuments('', ['topic-1'])).rejects.toThrow(
      'User must be authenticated',
    );
  });

  it('returns empty array when topicIds list is empty', async () => {
    const res = await retrieveTopicDocuments('user-1', []);
    expect(res).toEqual([]);
  });

  it('queries supabase with ownership and status filters', async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEqOwner = vi.fn().mockReturnThis();
    const mockInTopics = vi.fn().mockReturnThis();
    const mockEqStatus = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'doc-1',
          topic_id: 'topic-a',
          original_name: '01_Cloud_Einfuehrung.pdf',
          owner_id: 'user-1',
          processing_status: 'completed',
          content: {
            pages: [
              {
                pageNumber: 1,
                nativeText: 'Nativer Text',
                quality: { usable: true, charCount: 12, printableRatio: 1, whitespaceRatio: 0.1, alphanumericRatio: 0.9, wordCount: 2, replacementCharCount: 0, reasons: [] },
                ocrText: null,
                ocrStatus: 'not-generated',
                blocks: [
                  { type: 'heading', text: 'Cloud Architekturen' },
                  { type: 'paragraph', text: 'Cloud Architekturen basieren auf IaaS, PaaS und SaaS.' },
                ],
                annotations: [
                  { content: 'Wichtig für die Klausur', type: 'TEXT', y: 500 },
                ],
              },
            ],
          },
        },
      ],
      error: null,
    });

    (supabase.from as any).mockReturnValue({
      select: mockSelect,
    });
    mockSelect.mockReturnValue({
      eq: mockEqOwner,
    });
    mockEqOwner.mockReturnValue({
      in: mockInTopics,
    });
    mockInTopics.mockReturnValue({
      eq: mockEqStatus,
    });

    const sources = await retrieveTopicDocuments('user-1', ['topic-a']);

    expect(supabase.from).toHaveBeenCalledWith('documents');
    expect(mockEqOwner).toHaveBeenCalledWith('owner_id', 'user-1');
    expect(mockInTopics).toHaveBeenCalledWith('topic_id', ['topic-a']);
    expect(mockEqStatus).toHaveBeenCalledWith('processing_status', 'completed');

    expect(sources).toHaveLength(1);
    const src = sources[0];
    expect(src.id).toBe('doc-1');
    expect(src.type).toBe('document');
    expect(src.documentId).toBe('doc-1');
    expect(src.documentName).toBe('01_Cloud_Einfuehrung.pdf');
    expect(src.pageNumber).toBe(1);
    expect(src.content).toContain('### Cloud Architekturen');
    expect(src.content).toContain('Cloud Architekturen basieren auf IaaS, PaaS und SaaS.');
    expect(src.content).toContain('[Anmerkungen/Notizen: Wichtig für die Klausur]');
  });
});
