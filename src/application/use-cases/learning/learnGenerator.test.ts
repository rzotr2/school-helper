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
  validateMatchingTask,
  generateMatchingTask,
  checkWordBankAnswer,
  validateWordBankTask,
  generateWordBankTask,
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

  describe('validateMatchingTask (Hallucination Prevention)', () => {
    const allowedIds = new Set(['doc-1', 'web-1']);

    it('accepts valid, fully source-grounded matching task with 4 pairs', () => {
      const validRaw = {
        topicId: 'top-1',
        instruction: 'Ordne die Begriffe zu.',
        pairs: [
          {
            id: 'pair-1',
            left: 'IaaS',
            right: 'Bereitstellung von Rechen- und Speicherressourcen',
            evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
            sourceIds: ['doc-1'],
          },
          {
            id: 'pair-2',
            left: 'PaaS',
            right: 'Plattform für Entwicklung von Software',
            evidence: 'PaaS umfasst Plattformen.',
            sourceIds: ['doc-1'],
          },
          {
            id: 'pair-3',
            left: 'SaaS',
            right: 'Nutzung fertiger Software über das Web',
            evidence: 'SaaS stellt fertige Software bereit.',
            sourceIds: ['doc-1'],
          },
          {
            id: 'pair-4',
            left: 'NIST',
            right: 'Standardisierungsorganisation für Cloud Computing',
            evidence: 'NIST definiert Charakteristiken.',
            sourceIds: ['web-1'],
          },
        ],
      };

      const task = validateMatchingTask(validRaw, allowedIds, 'top-1');
      expect(task).not.toBeNull();
      expect(task?.mode).toBe('matching');
      expect(task?.pairs.length).toBe(4);
      expect(task?.pairs[0].left).toBe('IaaS');
      expect(task?.pairs[0].right).toBe('Bereitstellung von Rechen- und Speicherressourcen');
      expect(task?.sourceIds).toContain('doc-1');
      expect(task?.sourceIds).toContain('web-1');
    });

    it('rejects task if pairs array has fewer than 3 pairs', () => {
      const tooFewPairs = {
        pairs: [
          {
            id: 'p-1',
            left: 'IaaS',
            right: 'Infrastruktur',
            evidence: 'Beweis 1',
            sourceIds: ['doc-1'],
          },
          {
            id: 'p-2',
            left: 'PaaS',
            right: 'Plattform',
            evidence: 'Beweis 2',
            sourceIds: ['doc-1'],
          },
        ],
      };

      expect(validateMatchingTask(tooFewPairs, allowedIds, 'top-1')).toBeNull();
    });

    it('rejects task if pairs array has more than 6 pairs', () => {
      const tooManyPairs = {
        pairs: Array.from({ length: 7 }, (_, i) => ({
          id: `p-${i + 1}`,
          left: `Begriff ${i + 1}`,
          right: `Definition ${i + 1}`,
          evidence: `Beweis ${i + 1}`,
          sourceIds: ['doc-1'],
        })),
      };

      expect(validateMatchingTask(tooManyPairs, allowedIds, 'top-1')).toBeNull();
    });

    it('rejects task with duplicate pair IDs', () => {
      const duplicateIds = {
        pairs: [
          { id: 'p-1', left: 'A', right: '1', evidence: 'E1', sourceIds: ['doc-1'] },
          { id: 'p-1', left: 'B', right: '2', evidence: 'E2', sourceIds: ['doc-1'] },
          { id: 'p-3', left: 'C', right: '3', evidence: 'E3', sourceIds: ['doc-1'] },
        ],
      };

      expect(validateMatchingTask(duplicateIds, allowedIds, 'top-1')).toBeNull();
    });

    it('rejects task with empty left or right values', () => {
      const emptyLeft = {
        pairs: [
          { id: 'p-1', left: '', right: '1', evidence: 'E1', sourceIds: ['doc-1'] },
          { id: 'p-2', left: 'B', right: '2', evidence: 'E2', sourceIds: ['doc-1'] },
          { id: 'p-3', left: 'C', right: '3', evidence: 'E3', sourceIds: ['doc-1'] },
        ],
      };
      expect(validateMatchingTask(emptyLeft, allowedIds, 'top-1')).toBeNull();

      const emptyRight = {
        pairs: [
          { id: 'p-1', left: 'A', right: '', evidence: 'E1', sourceIds: ['doc-1'] },
          { id: 'p-2', left: 'B', right: '2', evidence: 'E2', sourceIds: ['doc-1'] },
          { id: 'p-3', left: 'C', right: '3', evidence: 'E3', sourceIds: ['doc-1'] },
        ],
      };
      expect(validateMatchingTask(emptyRight, allowedIds, 'top-1')).toBeNull();
    });

    it('rejects task with trivial/identical wording between left and right', () => {
      const trivialPair = {
        pairs: [
          { id: 'p-1', left: 'Firewall', right: 'Firewall', evidence: 'E1', sourceIds: ['doc-1'] },
          { id: 'p-2', left: 'Router', right: 'Netzwerkgerät', evidence: 'E2', sourceIds: ['doc-1'] },
          { id: 'p-3', left: 'Switch', right: 'Verteiler', evidence: 'E3', sourceIds: ['doc-1'] },
        ],
      };

      expect(validateMatchingTask(trivialPair, allowedIds, 'top-1')).toBeNull();
    });

    it('rejects task with duplicate left or duplicate right items', () => {
      const dupLeft = {
        pairs: [
          { id: 'p-1', left: 'Cloud', right: 'Def 1', evidence: 'E1', sourceIds: ['doc-1'] },
          { id: 'p-2', left: 'Cloud', right: 'Def 2', evidence: 'E2', sourceIds: ['doc-1'] },
          { id: 'p-3', left: 'Server', right: 'Def 3', evidence: 'E3', sourceIds: ['doc-1'] },
        ],
      };
      expect(validateMatchingTask(dupLeft, allowedIds, 'top-1')).toBeNull();
    });

    it('rejects task if any source ID is hallucinated/invalid', () => {
      const fakeSource = {
        pairs: [
          { id: 'p-1', left: 'A', right: '1', evidence: 'E1', sourceIds: ['doc-1'] },
          { id: 'p-2', left: 'B', right: '2', evidence: 'E2', sourceIds: ['hallucinated-doc-99'] },
          { id: 'p-3', left: 'C', right: '3', evidence: 'E3', sourceIds: ['doc-1'] },
        ],
      };

      expect(validateMatchingTask(fakeSource, allowedIds, 'top-1')).toBeNull();
    });

    it('rejects task if pair is missing evidence', () => {
      const missingEvidence = {
        pairs: [
          { id: 'p-1', left: 'A', right: '1', evidence: '', sourceIds: ['doc-1'] },
          { id: 'p-2', left: 'B', right: '2', evidence: 'E2', sourceIds: ['doc-1'] },
          { id: 'p-3', left: 'C', right: '3', evidence: 'E3', sourceIds: ['doc-1'] },
        ],
      };

      expect(validateMatchingTask(missingEvidence, allowedIds, 'top-1')).toBeNull();
    });

    it('enforces allowed topic IDs boundary if specified', () => {
      const allowedTopics = new Set(['top-allowed']);
      const valid = {
        topicId: 'top-forbidden',
        pairs: [
          { id: 'p-1', left: 'A', right: '1', evidence: 'E1', sourceIds: ['doc-1'] },
          { id: 'p-2', left: 'B', right: '2', evidence: 'E2', sourceIds: ['doc-1'] },
          { id: 'p-3', left: 'C', right: '3', evidence: 'E3', sourceIds: ['doc-1'] },
        ],
      };

      expect(validateMatchingTask(valid, allowedIds, 'top-allowed', allowedTopics)).toBeNull();
    });
  });

  describe('generateMatchingTask', () => {
    it('successfully generates a matching task with mocked DeepSeek response', async () => {
      const context: GroundedKnowledgeContext = {
        subjectId: 'sub-1',
        subjectName: 'Informatik',
        topicIds: ['top-1'],
        topicNames: ['Cloud-Management'],
        sources: [
          {
            id: 'doc-1',
            type: 'document',
            title: 'Cloud Skript',
            content: 'IaaS bietet Rechen- und Speicherressourcen. PaaS bietet Entwicklungsplattformen. SaaS bietet fertige Anwendungen.',
          },
        ],
      };

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                topicId: 'top-1',
                instruction: 'Ordne die Servicemodelle ihren Beschreibungen zu.',
                pairs: [
                  {
                    id: 'pair-1',
                    left: 'IaaS',
                    right: 'Rechen- und Speicherressourcen',
                    evidence: 'IaaS bietet Rechen- und Speicherressourcen.',
                    sourceIds: ['doc-1'],
                  },
                  {
                    id: 'pair-2',
                    left: 'PaaS',
                    right: 'Entwicklungsplattformen',
                    evidence: 'PaaS bietet Entwicklungsplattformen.',
                    sourceIds: ['doc-1'],
                  },
                  {
                    id: 'pair-3',
                    left: 'SaaS',
                    right: 'Fertige Anwendungen',
                    evidence: 'SaaS bietet fertige Anwendungen.',
                    sourceIds: ['doc-1'],
                  },
                ],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const task = await generateMatchingTask(context, {
        apiKey: 'valid-api-key',
        targetTopicId: 'top-1',
        targetTopicName: 'Cloud-Management',
        difficulty: 'mittel',
        fetchFn: mockFetch as any,
      });

      expect(task).toBeDefined();
      expect(task.mode).toBe('matching');
      expect(task.pairs.length).toBe(3);
      expect(task.pairs[0].left).toBe('IaaS');
      expect(task.pairs[0].right).toBe('Rechen- und Speicherressourcen');
      expect(task.sourceIds).toEqual(['doc-1']);

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages[0].content).toContain('Matching (Zuordnen)');
      expect(calledBody.messages[1].content).toContain('SCHWERPUNKT-THEMA FÜR DIESE ZUORDNUNG: Cloud-Management');
    });
  });

  describe('checkWordBankAnswer', () => {
    it('matches identical strings with case and whitespace insensitivity', () => {
      expect(checkWordBankAnswer('Filtert', 'filtert')).toBe(true);
      expect(checkWordBankAnswer('  filtert  ', 'filtert')).toBe(true);
      expect(checkWordBankAnswer('Verschlüsselung', 'verschlüsselung')).toBe(true);
    });

    it('rejects differing strings or empty inputs', () => {
      expect(checkWordBankAnswer('filtert', 'blockieren')).toBe(false);
      expect(checkWordBankAnswer('', 'filtert')).toBe(false);
      expect(checkWordBankAnswer('filtert', '')).toBe(false);
    });
  });

  describe('validateWordBankTask (Hallucination Prevention)', () => {
    const allowedIds = new Set(['doc-1', 'web-1']);

    const validWordBankRaw = {
      instruction: 'Setze die passenden Begriffe in die Lücken ein.',
      textWithBlanks: 'Eine Firewall {{blank-1}} den Datenverkehr und kann Verbindungen {{blank-2}}. Zudem sorgt Verschlüsselung für {{blank-3}}.',
      blanks: [
        {
          id: 'blank-1',
          answer: 'filtert',
          evidence: 'Eine Firewall filtert den Datenverkehr.',
          sourceIds: ['doc-1'],
        },
        {
          id: 'blank-2',
          answer: 'blockieren',
          evidence: 'Firewalls können Verbindungen blockieren.',
          sourceIds: ['doc-1'],
        },
        {
          id: 'blank-3',
          answer: 'Vertraulichkeit',
          evidence: 'Verschlüsselung garantiert Vertraulichkeit.',
          sourceIds: ['web-1'],
        },
      ],
      words: ['blockieren', 'filtert', 'Authentifizierung', 'Vertraulichkeit', 'Routing'],
    };

    it('accepts valid, fully source-grounded word bank task', () => {
      const task = validateWordBankTask(validWordBankRaw, allowedIds, 'top-1');
      expect(task).not.toBeNull();
      expect(task?.mode).toBe('word-bank');
      expect(task?.blanks.length).toBe(3);
      expect(task?.words.length).toBe(5);
      expect(task?.sourceIds).toEqual(expect.arrayContaining(['doc-1', 'web-1']));
    });

    it('rejects task with fewer than 3 blanks', () => {
      const task = validateWordBankTask(
        {
          ...validWordBankRaw,
          blanks: validWordBankRaw.blanks.slice(0, 2),
        },
        allowedIds,
        'top-1',
      );
      expect(task).toBeNull();
    });

    it('rejects task with more than 5 blanks', () => {
      const task = validateWordBankTask(
        {
          ...validWordBankRaw,
          blanks: [
            ...validWordBankRaw.blanks,
            { id: 'blank-4', answer: 'Authentifizierung', evidence: 'ev4', sourceIds: ['doc-1'] },
            { id: 'blank-5', answer: 'Routing', evidence: 'ev5', sourceIds: ['doc-1'] },
            { id: 'blank-6', answer: 'Schutz', evidence: 'ev6', sourceIds: ['doc-1'] },
          ],
        },
        allowedIds,
        'top-1',
      );
      expect(task).toBeNull();
    });

    it('rejects task if a blank placeholder is missing from text', () => {
      const task = validateWordBankTask(
        {
          ...validWordBankRaw,
          textWithBlanks: 'Hier fehlt der Platzhalter für blank-3. {{blank-1}} und {{blank-2}}.',
        },
        allowedIds,
        'top-1',
      );
      expect(task).toBeNull();
    });

    it('rejects task if a blank answer is NOT in the word bank', () => {
      const task = validateWordBankTask(
        {
          ...validWordBankRaw,
          words: ['blockieren', 'filtert', 'Authentifizierung', 'Routing'], // 'Vertraulichkeit' missing
        },
        allowedIds,
        'top-1',
      );
      expect(task).toBeNull();
    });

    it('rejects task with hallucinated source IDs', () => {
      const task = validateWordBankTask(
        {
          ...validWordBankRaw,
          blanks: [
            validWordBankRaw.blanks[0],
            validWordBankRaw.blanks[1],
            {
              ...validWordBankRaw.blanks[2],
              sourceIds: ['hallucinated-doc-99'],
            },
          ],
        },
        allowedIds,
        'top-1',
      );
      expect(task).toBeNull();
    });

    it('rejects task with duplicate blank IDs', () => {
      const task = validateWordBankTask(
        {
          ...validWordBankRaw,
          blanks: [
            validWordBankRaw.blanks[0],
            validWordBankRaw.blanks[1],
            {
              ...validWordBankRaw.blanks[2],
              id: 'blank-1', // duplicate
            },
          ],
        },
        allowedIds,
        'top-1',
      );
      expect(task).toBeNull();
    });

    it('rejects task with duplicate words in word bank', () => {
      const task = validateWordBankTask(
        {
          ...validWordBankRaw,
          words: ['filtert', 'filtert', 'blockieren', 'Vertraulichkeit', 'Routing'],
        },
        allowedIds,
        'top-1',
      );
      expect(task).toBeNull();
    });

    it('rejects task if text contains raw HTML tags', () => {
      const task = validateWordBankTask(
        {
          ...validWordBankRaw,
          textWithBlanks: '<script>alert(1)</script> Eine Firewall {{blank-1}}...',
        },
        allowedIds,
        'top-1',
      );
      expect(task).toBeNull();
    });
  });

  describe('generateWordBankTask', () => {
    const context: GroundedKnowledgeContext = {
      subjectId: 'sub-1',
      subjectName: 'Informatik',
      topicIds: ['top-1'],
      topicNames: ['Netzwerke'],
      sources: sampleSources,
    };

    it('calls DeepSeek API and validates response into WordBankTask', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                topicId: 'top-1',
                instruction: 'Setze die Begriffe ein.',
                textWithBlanks: 'Eine Firewall {{blank-1}} Datenströme und kann Pakete {{blank-2}}. NIST beschreibt essentielle {{blank-3}}.',
                blanks: [
                  {
                    id: 'blank-1',
                    answer: 'filtert',
                    evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
                    sourceIds: ['doc-1'],
                  },
                  {
                    id: 'blank-2',
                    answer: 'blockieren',
                    evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
                    sourceIds: ['doc-1'],
                  },
                  {
                    id: 'blank-3',
                    answer: 'Charakteristiken',
                    evidence: 'NIST definiert 5 essentielle Charakteristiken von Cloud Computing.',
                    sourceIds: ['web-1'],
                  },
                ],
                words: ['blockieren', 'filtert', 'Charakteristiken', 'Speicherressourcen', 'Routing'],
              }),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const task = await generateWordBankTask(context, {
        apiKey: 'valid-api-key',
        targetTopicId: 'top-1',
        targetTopicName: 'Netzwerke',
        difficulty: 'mittel',
        fetchFn: mockFetch as any,
      });

      expect(task).toBeDefined();
      expect(task.mode).toBe('word-bank');
      expect(task.blanks.length).toBe(3);
      expect(task.words.length).toBe(5);
      expect(task.sourceIds).toContain('doc-1');
      expect(task.sourceIds).toContain('web-1');

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(calledBody.messages[0].content).toContain('Wortbank / Lückentext mit Wörtern');
      expect(calledBody.messages[1].content).toContain('SCHWERPUNKT-THEMA FÜR DIESE WORTBANK: Netzwerke');
    });
  });
});

