import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildUserTaxonomy,
  validateRoutingResponse,
  getDocumentRoutingRecommendations,
  assignDocumentToTopic,
  type UserTaxonomySubject,
} from './documentRouting';
import type { Subject } from './subjects';
import type { Topic } from './topics';

describe('buildUserTaxonomy', () => {
  it('groups topics under their respective subjects', () => {
    const subjects: Subject[] = [
      { id: 'sub-1', ownerId: 'user-1', name: 'Informatik', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'sub-2', ownerId: 'user-1', name: 'Mathematik', position: 1, createdAt: new Date(), updatedAt: new Date() },
    ];
    const topics: Topic[] = [
      { id: 'top-1', ownerId: 'user-1', subjectId: 'sub-1', name: 'Datenbanken', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'top-2', ownerId: 'user-1', subjectId: 'sub-1', name: 'Netzwerke', position: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 'top-3', ownerId: 'user-1', subjectId: 'sub-2', name: 'Lineare Algebra', position: 0, createdAt: new Date(), updatedAt: new Date() },
    ];

    const taxonomy = buildUserTaxonomy(subjects, topics);
    expect(taxonomy).toHaveLength(2);
    expect(taxonomy[0].id).toBe('sub-1');
    expect(taxonomy[0].topics).toEqual([
      { id: 'top-1', name: 'Datenbanken' },
      { id: 'top-2', name: 'Netzwerke' },
    ]);
    expect(taxonomy[1].id).toBe('sub-2');
    expect(taxonomy[1].topics).toEqual([
      { id: 'top-3', name: 'Lineare Algebra' },
    ]);
  });

  it('handles subjects without topics and empty taxonomies', () => {
    expect(buildUserTaxonomy([], [])).toEqual([]);
    const subjects: Subject[] = [
      { id: 'sub-1', ownerId: 'user-1', name: 'Deutsch', position: 0, createdAt: new Date(), updatedAt: new Date() },
    ];
    const taxonomy = buildUserTaxonomy(subjects, []);
    expect(taxonomy).toEqual([{ id: 'sub-1', name: 'Deutsch', topics: [] }]);
  });
});

describe('validateRoutingResponse', () => {
  const sampleTaxonomy: UserTaxonomySubject[] = [
    {
      id: 'sub-1',
      name: 'Wirtschaftsinformatik',
      topics: [
        { id: 'top-1', name: 'IT-Dienstleistungen' },
        { id: 'top-2', name: 'Cloud-Management' },
      ],
    },
    {
      id: 'sub-2',
      name: 'Mathematik',
      topics: [
        { id: 'top-3', name: 'Analysis' },
      ],
    },
  ];

  it('accepts valid recommendations matching the user taxonomy', () => {
    const raw = {
      subjectId: 'sub-1',
      topicRecommendations: [
        { topicId: 'top-1', reason: 'Behandelt SLAs und Service-Verträge' },
        { topicId: 'top-2', reason: 'Erwähnt Cloud-Infrastruktur' },
      ],
      newTopicSuggestion: null,
    };

    const result = validateRoutingResponse(raw, sampleTaxonomy);
    expect(result.subjectId).toBe('sub-1');
    expect(result.topicRecommendations).toHaveLength(2);
    expect(result.topicRecommendations[0].topicId).toBe('top-1');
    expect(result.newTopicSuggestion).toBeNull();
  });

  it('rejects unknown subject IDs (returns null subject and empty topics)', () => {
    const raw = {
      subjectId: 'sub-unknown',
      topicRecommendations: [{ topicId: 'top-1', reason: 'irrelevant' }],
    };

    const result = validateRoutingResponse(raw, sampleTaxonomy);
    expect(result.subjectId).toBeNull();
    expect(result.topicRecommendations).toEqual([]);
    expect(result.newTopicSuggestion).toBeNull();
  });

  it('filters out topics that do not belong to the resolved subject', () => {
    const raw = {
      subjectId: 'sub-1',
      topicRecommendations: [
        { topicId: 'top-1', reason: 'Valid' },
        { topicId: 'top-3', reason: 'Wrong subject (sub-2 topic)' },
        { topicId: 'top-unknown', reason: 'Does not exist' },
      ],
    };

    const result = validateRoutingResponse(raw, sampleTaxonomy);
    expect(result.subjectId).toBe('sub-1');
    expect(result.topicRecommendations).toHaveLength(1);
    expect(result.topicRecommendations[0].topicId).toBe('top-1');
  });

  it('filters duplicate topic recommendations and caps to max 3', () => {
    const raw = {
      subjectId: 'sub-1',
      topicRecommendations: [
        { topicId: 'top-1', reason: 'First' },
        { topicId: 'top-1', reason: 'Duplicate' },
        { topicId: 'top-2', reason: 'Second' },
      ],
    };

    const result = validateRoutingResponse(raw, sampleTaxonomy);
    expect(result.topicRecommendations).toHaveLength(2);
    expect(result.topicRecommendations.map(r => r.topicId)).toEqual(['top-1', 'top-2']);
  });

  it('accepts valid newTopicSuggestion that does not duplicate existing topics', () => {
    const raw = {
      subjectId: 'sub-1',
      topicRecommendations: [],
      newTopicSuggestion: {
        subjectId: 'sub-1',
        name: 'IT-Sicherheit',
        reason: 'Neues Thema für Security-Vorlesung',
      },
    };

    const result = validateRoutingResponse(raw, sampleTaxonomy);
    expect(result.newTopicSuggestion).not.toBeNull();
    expect(result.newTopicSuggestion?.name).toBe('IT-Sicherheit');
  });

  it('rejects newTopicSuggestion if name duplicates an existing topic (case-insensitive)', () => {
    const raw = {
      subjectId: 'sub-1',
      topicRecommendations: [],
      newTopicSuggestion: {
        subjectId: 'sub-1',
        name: 'it-dienstleistungen', // already exists
        reason: 'Duplicate name',
      },
    };

    const result = validateRoutingResponse(raw, sampleTaxonomy);
    expect(result.newTopicSuggestion).toBeNull();
  });

  it('handles null subjectId safely', () => {
    const raw = {
      subjectId: null,
      topicRecommendations: [],
      newTopicSuggestion: null,
    };

    const result = validateRoutingResponse(raw, sampleTaxonomy);
    expect(result.subjectId).toBeNull();
    expect(result.topicRecommendations).toEqual([]);
    expect(result.newTopicSuggestion).toBeNull();
  });
});

describe('getDocumentRoutingRecommendations', () => {
  it('rejects without authenticated user or documentId', async () => {
    await expect(getDocumentRoutingRecommendations('', 'doc-1')).rejects.toThrow(
      'User must be authenticated',
    );
    await expect(getDocumentRoutingRecommendations('user-1', '')).rejects.toThrow(
      'Document ID is required',
    );
  });
});
