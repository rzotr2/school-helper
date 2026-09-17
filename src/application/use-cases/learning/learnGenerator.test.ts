import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatSourcesForPrompt,
  validateQuizTask,
  generateQuizTask,
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
        generateQuizTask(emptyContext, 'fake-key'),
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

      const task = await generateQuizTask(context, 'valid-api-key', mockFetch as any);

      expect(mockFetch).toHaveBeenCalled();
      expect(task.question).toBe('Was bietet IaaS laut dem Skript?');
      expect(task.sourceIds).toEqual(['doc-1']);
      expect(task.evidence).toContain('IaaS bietet grundlegende Rechen- und Speicherressourcen');
    });
  });
});
