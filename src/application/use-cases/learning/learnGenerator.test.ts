import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatSourcesForPrompt,
  validateQuizTask,
  generateQuizTask,
  validateFlashcardTask,
  generateFlashcardTask,
  BLANK_MARKER,
  checkFillInBlankAnswer,
  validateFillInBlankTask,
  generateFillInBlankTask,
} from './learnGenerator';
import type { GroundedKnowledgeContext, GroundedSource } from './learningTypes';

describe('learnGenerator', () => {
  const sampleSources: GroundedSource[] = [
    {
      id: 'doc-1',
      type: 'document',
      title: 'Cloud Skript (Seite 1)',
      documentId: 'd-1',
      documentName: 'Cloud_Skript.pdf',
      pageNumber: 1,
      content: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
    },
    {
      id: 'web-1',
      type: 'web',
      title: 'NIST Cloud Definition',
      url: 'https://csrc.nist.gov/publications/detail/sp/800-145/final',
      domain: 'csrc.nist.gov',
      content: 'NIST definiert 5 essentielle Charakteristiken von Cloud Computing.',
    },
  ];

  describe('formatSourcesForPrompt', () => {
    it('formats sources with clear demarcation and IDs', () => {
      const formatted = formatSourcesForPrompt(sampleSources);
      expect(formatted).toContain('--- [SOURCE ID: doc-1] (DOCUMENT) ---');
      expect(formatted).toContain('Dokument: Cloud_Skript.pdf, Seite: 1');
      expect(formatted).toContain('IaaS bietet grundlegende Rechen- und Speicherressourcen.');
      expect(formatted).toContain('--- [SOURCE ID: web-1] (WEB) ---');
      expect(formatted).toContain('Domain: csrc.nist.gov');
      expect(formatted).toContain('NIST definiert 5 essentielle Charakteristiken von Cloud Computing.');
    });

    it('handles empty sources defensively', () => {
      expect(formatSourcesForPrompt([])).toContain('KEINE QUELLEN VERFÜGBAR');
    });
  });

  describe('validateQuizTask (Hallucination Prevention)', () => {
    const allowedIds = new Set(['doc-1', 'web-1']);

    it('accepts valid, fully source-grounded quiz task', () => {
      const validRaw = {
        question: 'Was bietet das IaaS-Modell?',
        options: [
          'Grundlegende Rechen- und Speicherressourcen',
          'Vollständig verwaltete Endanwendungen',
          'Ausschließlich Datenbankabfragen',
          'Keine Hardwarevirtualisierung',
        ],
        correctAnswer: 'Grundlegende Rechen- und Speicherressourcen',
        explanation: 'Laut Skript umfasst IaaS Basis-Ressourcen wie Rechenleistung und Speicher.',
        evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
        sourceIds: ['doc-1'],
      };

      const task = validateQuizTask(validRaw, allowedIds, 'topic-1');
      expect(task).not.toBeNull();
      expect(task?.question).toBe(validRaw.question);
      expect(task?.correctAnswer).toBe(validRaw.correctAnswer);
      expect(task?.evidence).toBe(validRaw.evidence);
      expect(task?.sourceIds).toEqual(['doc-1']);
    });

    it('rejects task if AI hallucinated/invented an unknown source ID', () => {
      const fakeSourceRaw = {
        question: 'Was ist Kubernetes?',
        options: ['Orchestrierung', 'Compiler', 'Datenbank', 'Netzwerk'],
        correctAnswer: 'Orchestrierung',
        explanation: 'Kubernetes orchestriert Container.',
        evidence: 'Orchestrierung von Containern',
        sourceIds: ['doc-1', 'web-fake-99'], // 'web-fake-99' was NOT provided!
      };

      const task = validateQuizTask(fakeSourceRaw, allowedIds, 'topic-1');
      expect(task).toBeNull();
    });

    it('rejects task without evidence', () => {
      const noEvidenceRaw = {
        question: 'Was bietet das IaaS-Modell?',
        options: ['Option A', 'Option B'],
        correctAnswer: 'Option A',
        explanation: 'Erklärung',
        evidence: '', // Missing evidence!
        sourceIds: ['doc-1'],
      };

      const task = validateQuizTask(noEvidenceRaw, allowedIds, 'topic-1');
      expect(task).toBeNull();
    });

    it('rejects task when correctAnswer is not present in options', () => {
      const invalidOptionsRaw = {
        question: 'Frage',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option X', // Not in options
        explanation: 'Erklärung',
        evidence: 'Evidenz',
        sourceIds: ['doc-1'],
      };

      const task = validateQuizTask(invalidOptionsRaw, allowedIds, 'topic-1');
      expect(task).toBeNull();
    });
  });

  describe('validateFlashcardTask (Hallucination Prevention)', () => {
    const allowedIds = new Set(['doc-1', 'web-1']);
    const allowedTopicIds = new Set(['top-1', 'top-2']);

    it('accepts valid, fully source-grounded flashcard task', () => {
      const validRaw = {
        question: 'Was versteht man unter Cloud-Management?',
        answer:
          'Cloud-Management umfasst die Steuerung, Überwachung und Verwaltung von Cloud-Ressourcen.',
        evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
        sourceIds: ['doc-1'],
        topicId: 'top-1',
      };

      const task = validateFlashcardTask(validRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).not.toBeNull();
      expect(task?.mode).toBe('flashcards');
      expect(task?.question).toBe(validRaw.question);
      expect(task?.answer).toBe(validRaw.answer);
      expect(task?.evidence).toBe(validRaw.evidence);
      expect(task?.sourceIds).toEqual(['doc-1']);
      expect(task?.topicId).toBe('top-1');
    });

    it('rejects flashcard if AI referenced an unknown or invented source ID', () => {
      const fakeSourceRaw = {
        question: 'Was ist ein Hypervisor?',
        answer: 'Software zur Verwaltung virtueller Maschinen.',
        evidence: 'Virtualisierungsschicht',
        sourceIds: ['doc-1', 'web-invented-404'],
        topicId: 'top-1',
      };

      const task = validateFlashcardTask(fakeSourceRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });

    it('rejects flashcard with no source IDs', () => {
      const noSourcesRaw = {
        question: 'Was ist SaaS?',
        answer: 'Software as a Service.',
        evidence: 'SaaS Definition',
        sourceIds: [],
        topicId: 'top-1',
      };

      const task = validateFlashcardTask(noSourcesRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });

    it('rejects flashcard with empty evidence', () => {
      const noEvidenceRaw = {
        question: 'Was ist PaaS?',
        answer: 'Platform as a Service.',
        evidence: '   ',
        sourceIds: ['doc-1'],
        topicId: 'top-1',
      };

      const task = validateFlashcardTask(noEvidenceRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });

    it('rejects flashcard with malformed fields (missing question or answer)', () => {
      expect(
        validateFlashcardTask(
          { question: '', answer: 'Antwort', evidence: 'Beleg', sourceIds: ['doc-1'] },
          allowedIds,
          'top-1',
        ),
      ).toBeNull();

      expect(
        validateFlashcardTask(
          { question: 'Frage', answer: '', evidence: 'Beleg', sourceIds: ['doc-1'] },
          allowedIds,
          'top-1',
        ),
      ).toBeNull();

      expect(validateFlashcardTask(null, allowedIds, 'top-1')).toBeNull();
      expect(validateFlashcardTask('not-an-object', allowedIds, 'top-1')).toBeNull();
    });

    it('rejects invalid topic ID outside the allowed topic set', () => {
      const invalidTopicRaw = {
        question: 'Was ist Cloud-Management?',
        answer: 'Erklärung...',
        evidence: 'Beleg...',
        sourceIds: ['doc-1'],
        topicId: 'unrelated-topic-999',
      };

      const task = validateFlashcardTask(
        invalidTopicRaw,
        allowedIds,
        'fallback-invalid',
        allowedTopicIds,
      );
      expect(task).toBeNull();
    });

    it('preserves valid document and web source references', () => {
      const multiSourceRaw = {
        question: 'Wie unterscheiden sich Cloud-Modelle?',
        answer: 'IaaS bietet Infrastruktur, PaaS Entwicklungsplattformen.',
        evidence: 'NIST definiert essentielle Charakteristiken.',
        sourceIds: ['doc-1', 'web-1'],
        topicId: 'top-2',
      };

      const task = validateFlashcardTask(multiSourceRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).not.toBeNull();
      expect(task?.sourceIds).toEqual(['doc-1', 'web-1']);
      expect(task?.topicId).toBe('top-2');
    });
  });

  describe('generateQuizTask', () => {
    it('throws error when knowledge context has no sources', async () => {
      const emptyContext: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud'],
        sources: [],
      };

      await expect(
        generateQuizTask(emptyContext, { apiKey: 'fake-key' }),
      ).rejects.toThrow('Nicht genügend Quellenmaterial vorhanden');
    });

    it('calls DeepSeek API and validates response', async () => {
      const context: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud'],
        sources: sampleSources,
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                question: 'Was bietet IaaS laut dem Skript?',
                options: [
                  'Grundlegende Rechen- und Speicherressourcen',
                  'Nur E-Mail-Dienste',
                  'Fertige SaaS-Software',
                  'Ausschließlich mobile Apps',
                ],
                correctAnswer: 'Grundlegende Rechen- und Speicherressourcen',
                explanation: 'IaaS deckt die infrastrukturelle Basisschicht ab.',
                evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
                sourceIds: ['doc-1'],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const task = await generateQuizTask(context, {
        apiKey: 'valid-api-key',
        fetchFn: mockFetch as any,
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(task.question).toBe('Was bietet IaaS laut dem Skript?');
      expect(task.sourceIds).toEqual(['doc-1']);
      expect(task.evidence).toContain('IaaS bietet grundlegende Rechen- und Speicherressourcen');
    });

    it('passes targeted topic and difficulty level into prompt', async () => {
      const context: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1', 'top-2'],
        topicNames: ['Cloud', 'Sicherheit'],
        sources: sampleSources,
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                topicId: 'top-2',
                question: 'Was unterscheidet Cloud-Sicherheit von traditioneller Sicherheit?',
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: 'Option A',
                explanation: 'Erklärung',
                evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
                sourceIds: ['doc-1'],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const task = await generateQuizTask(context, {
        apiKey: 'valid-api-key',
        targetTopicId: 'top-2',
        targetTopicName: 'Sicherheit',
        difficulty: 'schwer',
        fetchFn: mockFetch as any,
      });

      expect(task.topicId).toBe('top-2');
      expect(task.difficulty).toBe('schwer');

      // Check that system prompt contains difficulty instruction
      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages[0].content).toContain('SCHWIERIGKEITSGRAD: SCHWER');
      expect(calledBody.messages[1].content).toContain('SCHWERPUNKT-THEMA FÜR DIESE FRAGE: Sicherheit');
    });

    it('throws error when context has no document sources', async () => {
      const contextWithoutDocs: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud'],
        sources: [
          {
            id: 'web-1',
            type: 'web',
            title: 'Web Info',
            content: 'Web source content',
          },
        ],
      };

      await expect(
        generateQuizTask(contextWithoutDocs, {
          apiKey: 'valid-api-key',
        }),
      ).rejects.toThrow('Die Erstellung von Lernaufgaben erfordert mindestens ein eigenes Dokument');
    });
  });

  describe('generateFlashcardTask', () => {
    it('throws error when knowledge context has no sources', async () => {
      const emptyContext: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud'],
        sources: [],
      };

      await expect(
        generateFlashcardTask(emptyContext, { apiKey: 'fake-key' }),
      ).rejects.toThrow('Nicht genügend Quellenmaterial vorhanden');
    });

    it('throws error when context has no document sources (only web sources)', async () => {
      const contextWithoutDocs: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud'],
        sources: [
          {
            id: 'web-1',
            type: 'web',
            title: 'Web Info',
            content: 'Web source content',
          },
        ],
      };

      await expect(
        generateFlashcardTask(contextWithoutDocs, {
          apiKey: 'valid-api-key',
        }),
      ).rejects.toThrow('Die Erstellung von Lernaufgaben erfordert mindestens ein eigenes Dokument');
    });

    it('successfully calls DeepSeek, parses JSON, and validates flashcard task', async () => {
      const context: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud-Management'],
        sources: sampleSources,
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                topicId: 'top-1',
                question: 'Was versteht man unter dem IaaS-Modell?',
                answer: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
                evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
                sourceIds: ['doc-1'],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const task = await generateFlashcardTask(context, {
        apiKey: 'valid-api-key',
        targetTopicId: 'top-1',
        targetTopicName: 'Cloud-Management',
        difficulty: 'mittel',
        fetchFn: mockFetch as any,
      });

      expect(task).toBeDefined();
      expect(task.mode).toBe('flashcards');
      expect(task.topicId).toBe('top-1');
      expect(task.question).toBe('Was versteht man unter dem IaaS-Modell?');
      expect(task.answer).toBe('IaaS bietet grundlegende Rechen- und Speicherressourcen.');
      expect(task.evidence).toBe('IaaS bietet grundlegende Rechen- und Speicherressourcen.');
      expect(task.sourceIds).toEqual(['doc-1']);

      // Check request payload sent to DeepSeek
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages[0].content).toContain('AI IS NOT A KNOWLEDGE SOURCE');
      expect(calledBody.messages[0].content).toContain('Karteikarte');
      expect(calledBody.messages[1].content).toContain('SCHWERPUNKT-THEMA FÜR DIESE KARTEIKARTE: Cloud-Management');
    });
  });

  describe('checkFillInBlankAnswer (Deterministic Answer Checking)', () => {
    it('accepts exact matching answer', () => {
      expect(checkFillInBlankAnswer('Steuerung', 'Steuerung')).toBe(true);
    });

    it('ignores leading and trailing whitespace', () => {
      expect(checkFillInBlankAnswer('  Steuerung   ', 'Steuerung')).toBe(true);
      expect(checkFillInBlankAnswer('Steuerung', '   Steuerung ')).toBe(true);
    });

    it('ignores case differences', () => {
      expect(checkFillInBlankAnswer('steuerung', 'Steuerung')).toBe(true);
      expect(checkFillInBlankAnswer('STEUERUNG', 'steuerung')).toBe(true);
      expect(checkFillInBlankAnswer('iaas', 'IaaS')).toBe(true);
    });

    it('handles German umlauts and ß correctly', () => {
      expect(checkFillInBlankAnswer('Großrechner', 'großrechner')).toBe(true);
      expect(checkFillInBlankAnswer('Überwachung', 'überwachung')).toBe(true);
      expect(checkFillInBlankAnswer('Änderung', 'änderung')).toBe(true);
    });

    it('normalizes internal multiple whitespace into single space', () => {
      expect(checkFillInBlankAnswer('Public   Cloud', 'Public Cloud')).toBe(true);
    });

    it('rejects incorrect answer', () => {
      expect(checkFillInBlankAnswer('Infrastruktur', 'Steuerung')).toBe(false);
    });

    it('rejects empty or whitespace-only answer', () => {
      expect(checkFillInBlankAnswer('', 'Steuerung')).toBe(false);
      expect(checkFillInBlankAnswer('   ', 'Steuerung')).toBe(false);
      expect(checkFillInBlankAnswer('Steuerung', '')).toBe(false);
    });
  });

  describe('validateFillInBlankTask (Hallucination Prevention & Schema)', () => {
    const allowedIds = new Set(['doc-1', 'web-1']);
    const allowedTopicIds = new Set(['top-1', 'top-2']);

    it('accepts valid, fully source-grounded fill-in-the-blank task', () => {
      const validRaw = {
        sentenceWithBlank: `Cloud-Management umfasst die ${BLANK_MARKER}, Überwachung und Verwaltung von IT-Ressourcen.`,
        answer: 'Steuerung',
        evidence: 'Cloud-Management umfasst die Steuerung, Überwachung und Verwaltung von IT-Ressourcen.',
        sourceIds: ['doc-1'],
        topicId: 'top-1',
      };

      const task = validateFillInBlankTask(validRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).not.toBeNull();
      expect(task?.mode).toBe('fill-in-the-blank');
      expect(task?.sentenceWithBlank).toBe(validRaw.sentenceWithBlank);
      expect(task?.answer).toBe(validRaw.answer);
      expect(task?.evidence).toBe(validRaw.evidence);
      expect(task?.sourceIds).toEqual(['doc-1']);
      expect(task?.topicId).toBe('top-1');
    });

    it('rejects task if blank placeholder is missing', () => {
      const noBlankRaw = {
        sentenceWithBlank: 'Cloud-Management umfasst die Steuerung und Überwachung.',
        answer: 'Steuerung',
        evidence: 'Cloud-Management umfasst die Steuerung.',
        sourceIds: ['doc-1'],
        topicId: 'top-1',
      };

      const task = validateFillInBlankTask(noBlankRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });

    it('rejects task if HTML tags are present', () => {
      const htmlRaw = {
        sentenceWithBlank: `Cloud-Management umfasst <b>${BLANK_MARKER}</b>.`,
        answer: 'Steuerung',
        evidence: 'Cloud-Management umfasst die Steuerung.',
        sourceIds: ['doc-1'],
        topicId: 'top-1',
      };

      const task = validateFillInBlankTask(htmlRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });

    it('rejects task if unknown/hallucinated source ID is referenced', () => {
      const fakeSourceRaw = {
        sentenceWithBlank: `IaaS bietet ${BLANK_MARKER} und Speicherressourcen.`,
        answer: 'Rechen-',
        evidence: 'IaaS bietet Rechen- und Speicherressourcen.',
        sourceIds: ['doc-1', 'web-fake-404'],
        topicId: 'top-1',
      };

      const task = validateFillInBlankTask(fakeSourceRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });

    it('rejects task if sourceIds array is empty', () => {
      const noSourcesRaw = {
        sentenceWithBlank: `IaaS bietet ${BLANK_MARKER}.`,
        answer: 'Speicher',
        evidence: 'IaaS bietet Speicher.',
        sourceIds: [],
        topicId: 'top-1',
      };

      const task = validateFillInBlankTask(noSourcesRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });

    it('rejects task if answer is not meaningfully present in evidence', () => {
      const ungroundedAnswerRaw = {
        sentenceWithBlank: `IaaS bietet ${BLANK_MARKER}.`,
        answer: 'Quantencomputer',
        evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
        sourceIds: ['doc-1'],
        topicId: 'top-1',
      };

      const task = validateFillInBlankTask(ungroundedAnswerRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });

    it('rejects task if topicId is outside selected topic set', () => {
      const outsideTopicRaw = {
        sentenceWithBlank: `IaaS bietet ${BLANK_MARKER}.`,
        answer: 'Rechenressourcen',
        evidence: 'IaaS bietet Rechenressourcen.',
        sourceIds: ['doc-1'],
        topicId: 'unrelated-topic-99',
      };

      const task = validateFillInBlankTask(outsideTopicRaw, allowedIds, 'top-1', allowedTopicIds);
      expect(task).toBeNull();
    });
  });

  describe('generateFillInBlankTask (Grounded AI Flow)', () => {
    it('throws error if context has no sources', async () => {
      const emptyContext: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud'],
        sources: [],
      };

      await expect(
        generateFillInBlankTask(emptyContext, { apiKey: 'key' }),
      ).rejects.toThrow('Nicht genügend Quellenmaterial vorhanden');
    });

    it('throws error if context has no document sources', async () => {
      const webOnlyContext: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud'],
        sources: [sampleSources[1]], // only web-1
      };

      await expect(
        generateFillInBlankTask(webOnlyContext, { apiKey: 'key' }),
      ).rejects.toThrow('mindestens ein eigenes Dokument');
    });

    it('successfully calls DeepSeek, validates response, and returns FillInBlankTask', async () => {
      const context: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud-Management'],
        sources: sampleSources,
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                topicId: 'top-1',
                sentenceWithBlank: `IaaS bietet grundlegende ${BLANK_MARKER}- und Speicherressourcen.`,
                answer: 'Rechen',
                evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
                sourceIds: ['doc-1'],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const task = await generateFillInBlankTask(context, {
        apiKey: 'valid-api-key',
        targetTopicId: 'top-1',
        targetTopicName: 'Cloud-Management',
        difficulty: 'mittel',
        fetchFn: mockFetch as any,
      });

      expect(task).toBeDefined();
      expect(task.mode).toBe('fill-in-the-blank');
      expect(task.topicId).toBe('top-1');
      expect(task.sentenceWithBlank).toContain(BLANK_MARKER);
      expect(task.answer).toBe('Rechen');
      expect(task.evidence).toBe('IaaS bietet grundlegende Rechen- und Speicherressourcen.');
      expect(task.sourceIds).toEqual(['doc-1']);

      // Verify prompt instruction
      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages[0].content).toContain('AI IS NOT A KNOWLEDGE SOURCE');
      expect(calledBody.messages[0].content).toContain('Lückentext');
      expect(calledBody.messages[0].content).toContain(BLANK_MARKER);
      expect(calledBody.messages[1].content).toContain('SCHWERPUNKT-THEMA FÜR DIESEN LÜCKENTEXT: Cloud-Management');
    });
  });
});
