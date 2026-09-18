// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearnPage } from './LearnPage';
import * as authContext from '../../infrastructure/auth/AuthContext';
import * as subjectsApi from '../../application/use-cases/subjects';
import * as topicsApi from '../../application/use-cases/topics';
import * as docsApi from '../../application/use-cases/documents';
import * as docRetApi from '../../application/use-cases/learning/documentRetrieval';
import * as webRetApi from '../../application/use-cases/learning/webRetrieval';
import * as generatorApi from '../../application/use-cases/learning/learnGenerator';
import type { WordBankTask } from '../../application/use-cases/learning/learningTypes';

// Configure React 19 act environment for jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LearnPage component', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'test-user', email: 'test@example.com' } as any,
      isLoading: false,
      signIn: vi.fn(),
      logOut: vi.fn(),
    });

    vi.spyOn(subjectsApi, 'getSubjects').mockResolvedValue([
      { id: 'sub-1', ownerId: 'test-user', name: 'Informatik', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'sub-2', ownerId: 'test-user', name: 'Mathematik', position: 1, createdAt: new Date(), updatedAt: new Date() },
    ]);

    vi.spyOn(topicsApi, 'getAllTopics').mockResolvedValue([
      { id: 'top-1', ownerId: 'test-user', subjectId: 'sub-1', name: 'Cloud-Management', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'top-2', ownerId: 'test-user', subjectId: 'sub-1', name: 'Netzwerke', position: 1, createdAt: new Date(), updatedAt: new Date() },
    ]);

    // top-1 has 1 completed document, top-2 has 0 documents (empty topic)
    vi.spyOn(docsApi, 'getAllDocuments').mockResolvedValue([
      {
        id: 'doc-1',
        ownerId: 'test-user',
        topicId: 'top-1',
        originalName: 'Cloud_Skript.pdf',
        storagePath: 'path/1',
        mimeType: 'application/pdf',
        size: 1024,
        createdAt: new Date(),
        updatedAt: new Date(),
        content: null,
        processingStatus: 'completed',
        understanding: null,
      },
    ]);

    vi.spyOn(docRetApi, 'retrieveTopicDocuments').mockResolvedValue([
      {
        id: 'doc-1',
        type: 'document',
        title: 'Cloud_Skript.pdf (Seite 1)',
        documentId: 'doc-1',
        documentName: 'Cloud_Skript.pdf',
        topicId: 'top-1',
        pageNumber: 1,
        content: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
      },
    ]);

    vi.spyOn(webRetApi, 'retrieveWebSources').mockResolvedValue([
      {
        id: 'web-1',
        type: 'web',
        title: 'AWS Docs',
        domain: 'aws.amazon.com',
        content: 'AWS Cloud Grundlagen.',
      },
    ]);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  const renderComponent = async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <LearnPage />
        </MemoryRouter>,
      );
    });
    return root;
  };

  it('renders subject and topic selection steps properly with topic count badges', async () => {
    await renderComponent();

    expect(container.textContent).toContain('Lernen');
    expect(container.textContent).toContain('1. Fach auswählen');
    expect(container.textContent).toContain('Informatik');
    expect(container.textContent).toContain('Mathematik');

    // Subject topic count badges: Informatik has 2 topics, Mathematik has 0 topics
    const infoSubjectBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Informatik'),
    );
    expect(infoSubjectBtn).toBeDefined();
    expect(infoSubjectBtn?.textContent).toContain('2');

    const mathSubjectBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Mathematik'),
    );
    expect(mathSubjectBtn).toBeDefined();
    expect(mathSubjectBtn?.textContent).toContain('0');

    expect(container.textContent).toContain('2. Themen auswählen');
    expect(container.textContent).toContain('Cloud-Management');
    expect(container.textContent).toContain('Netzwerke');
  });

  it('prevents selecting empty topics without documents', async () => {
    await renderComponent();

    const emptyTopicBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Netzwerke'),
    ) as HTMLButtonElement | undefined;

    expect(emptyTopicBtn).toBeDefined();
    expect(emptyTopicBtn?.disabled).toBe(true);
    expect(emptyTopicBtn?.textContent).toContain('0 Dok.');

    // Clicking empty topic should not trigger selection
    await act(async () => {
      emptyTopicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Quiz steps should NOT be visible
    expect(container.textContent).not.toContain('3. Schwierigkeit');
    expect(container.textContent).not.toContain('Lernsession starten');
  });

  it('allows toggling topics with documents and shows start session button', async () => {
    await renderComponent();

    const validTopicBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Cloud-Management'),
    ) as HTMLButtonElement | undefined;

    expect(validTopicBtn).toBeDefined();
    expect(validTopicBtn?.disabled).toBe(false);
    expect(validTopicBtn?.textContent).toContain('1 Dok.');

    await act(async () => {
      validTopicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('3. Schwierigkeit');
    expect(container.textContent).toContain('4. Lernmodus');
    expect(container.textContent).toContain('Multiple-Choice Quiz');
    expect(container.textContent).toContain('Karteikarten');
    expect(container.textContent).toContain('Lernsession starten');
  });

  it('allows selecting Flashcards mode and shows updated button text', async () => {
    await renderComponent();

    const validTopicBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Cloud-Management'),
    );
    await act(async () => {
      validTopicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const flashcardsModeBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Karteikarten'),
    );
    expect(flashcardsModeBtn).toBeDefined();

    await act(async () => {
      flashcardsModeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(flashcardsModeBtn?.textContent).toContain('Ausgewählt');
    expect(container.textContent).toContain('Lernsession starten (5 Karten)');
  });

  it('runs interactive Flashcard session: front shown, flip reveals answer and sources', async () => {
    const mockFlashcard = {
      id: 'f-1',
      mode: 'flashcards' as const,
      topicId: 'top-1',
      difficulty: 'mittel' as const,
      question: 'Was versteht man unter Cloud-Management?',
      answer: 'Cloud-Management umfasst Steuerung und Überwachung von Ressourcen.',
      evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
      sourceIds: ['doc-1', 'web-1'],
    };

    const mockGenFlashcard = vi
      .spyOn(generatorApi, 'generateFlashcardTask')
      .mockResolvedValue(mockFlashcard);

    await renderComponent();

    // Select topic
    const topicBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Cloud-Management'),
    );
    await act(async () => {
      topicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Select flashcards mode
    const flashcardsBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Karteikarten'),
    );
    await act(async () => {
      flashcardsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Click start session
    const startBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Lernsession starten'),
    );
    await act(async () => {
      startBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockGenFlashcard).toHaveBeenCalledTimes(1);

    // Initial state: Front (Question) displayed, Answer is hidden
    expect(container.textContent).toContain('Karte 1 von 5');
    expect(container.textContent).toContain('Vorderseite · Frage');
    expect(container.textContent).toContain('Was versteht man unter Cloud-Management?');
    expect(container.textContent).not.toContain('Cloud-Management umfasst Steuerung');
    expect(container.textContent).toContain('Karte umdrehen');

    // Click flip button
    const flipBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Karte umdrehen'),
    );
    expect(flipBtn).toBeDefined();

    await act(async () => {
      flipBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // After flipping: Answer and Evidence are revealed
    expect(container.textContent).toContain('Rückseite · Antwort');
    expect(container.textContent).toContain('Cloud-Management umfasst Steuerung und Überwachung');
    expect(container.textContent).toContain('Beleg aus den Quellen');
    expect(container.textContent).toContain('IaaS bietet grundlegende Rechen- und Speicherressourcen.');

    // Sources displayed below the card
    expect(container.textContent).toContain('Verifizierte Quellen dieser Aufgabe');
    expect(container.textContent).toContain('Cloud_Skript.pdf');
    expect(container.textContent).toContain('AWS Docs');

    // "Nächste Karte" button is visible
    expect(container.textContent).toContain('Nächste Karte');
  });

  it('keeps Quiz mode fully functional', async () => {
    const mockQuiz = {
      id: 'q-1',
      topicId: 'top-1',
      difficulty: 'mittel' as const,
      question: 'Was ist IaaS?',
      options: ['Infrastruktur', 'Software', 'Plattform', 'Keines'],
      correctAnswer: 'Infrastruktur',
      explanation: 'IaaS steht für Infrastructure as a Service.',
      evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
      sourceIds: ['doc-1'],
    };

    const mockGenQuiz = vi.spyOn(generatorApi, 'generateQuizTask').mockResolvedValue(mockQuiz);

    await renderComponent();

    const topicBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Cloud-Management'),
    );
    await act(async () => {
      topicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const startBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Lernsession starten'),
    );
    await act(async () => {
      startBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockGenQuiz).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Frage 1 von 5');
    expect(container.textContent).toContain('Was ist IaaS?');
    expect(container.textContent).toContain('Infrastruktur');

    // Select correct answer
    const optionBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Infrastruktur',
    );
    await act(async () => {
      optionBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Erklärung');
    expect(container.textContent).toContain('IaaS steht für Infrastructure as a Service.');
    expect(container.textContent).toContain('Nächste Frage');
  });

  it('selects and runs Lückentext (fill-in-the-blank) mode with deterministic answer checking', async () => {
    const mockFillInBlank = {
      id: 'fb-1',
      mode: 'fill-in-the-blank' as const,
      topicId: 'top-1',
      difficulty: 'mittel' as const,
      sentenceWithBlank: 'Cloud-Management umfasst die {{blank}}, Überwachung und Verwaltung von IT-Ressourcen.',
      answer: 'Steuerung',
      evidence: 'Cloud-Management umfasst die Steuerung, Überwachung und Verwaltung von IT-Ressourcen.',
      sourceIds: ['doc-1', 'web-1'],
    };

    const mockGenFillBlank = vi
      .spyOn(generatorApi, 'generateFillInBlankTask')
      .mockResolvedValue(mockFillInBlank);

    await renderComponent();

    // Select topic
    const topicBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Cloud-Management'),
    );
    await act(async () => {
      topicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Select Lückentext mode
    const fillBlankBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Lückentext'),
    );
    expect(fillBlankBtn).toBeDefined();
    await act(async () => {
      fillBlankBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Click start session
    const startBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Lernsession starten'),
    );
    await act(async () => {
      startBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockGenFillBlank).toHaveBeenCalledTimes(1);

    // Initial state: Question sentence rendered with placeholder, Answer hidden
    expect(container.textContent).toContain('Aufgabe 1 von 5');
    expect(container.textContent).toContain('Lückentext · Vervollständige den Satz');
    expect(container.textContent).toContain('Cloud-Management umfasst die');
    expect(container.textContent).toContain('Überwachung und Verwaltung');
    expect(container.textContent).not.toContain('Richtige Antwort:');
    expect(container.textContent).not.toContain('Richtig!');

    // Find input field
    const inputEl = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(inputEl).toBeDefined();

    // Enter answer (with whitespace and case difference to verify normalization)
    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(inputEl, '  steuerung  ');
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit answer via form submit
    const formEl = container.querySelector('form');
    expect(formEl).toBeDefined();

    await act(async () => {
      formEl?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // Verified correct state displayed
    expect(container.textContent).toContain('Richtig!');
    expect(container.textContent).toContain('Beleg aus den Quellen');
    expect(container.textContent).toContain(
      'Cloud-Management umfasst die Steuerung, Überwachung und Verwaltung von IT-Ressourcen.',
    );

    // Sources displayed
    expect(container.textContent).toContain('Verifizierte Quellen dieser Aufgabe');
    expect(container.textContent).toContain('Cloud_Skript.pdf');
    expect(container.textContent).toContain('AWS Docs');

    // Next action button
    expect(container.textContent).toContain('Nächste Aufgabe');
  });

  it('selects and runs Zuordnen (matching) mode with tactile matching and completion', async () => {
    const mockMatchingTask = {
      id: 'match-1',
      mode: 'matching' as const,
      topicId: 'top-1',
      difficulty: 'mittel' as const,
      instruction: 'Ordne die Cloud-Begriffe den passenden Erläuterungen zu.',
      pairs: [
        {
          id: 'p1',
          left: 'IaaS',
          right: 'Bereitstellung von virtualisierter Recheninfrastruktur',
          sourceIds: ['doc-1'],
          evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
        },
        {
          id: 'p2',
          left: 'PaaS',
          right: 'Plattform für Entwickler ohne Server-Management',
          sourceIds: ['web-1'],
          evidence: 'PaaS Plattform für Entwickler ohne Server-Management.',
        },
        {
          id: 'p3',
          left: 'SaaS',
          right: 'Anwendungssoftware direkt über den Webbrowser nutzen',
          sourceIds: ['doc-1'],
          evidence: 'SaaS ermöglicht direkte Anwendungssoftware im Browser.',
        },
      ],
      evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
      sourceIds: ['doc-1', 'web-1'],
    };

    const mockGenMatching = vi
      .spyOn(generatorApi, 'generateMatchingTask')
      .mockResolvedValue(mockMatchingTask);

    await renderComponent();

    // Select topic
    const topicBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Cloud-Management'),
    );
    await act(async () => {
      topicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Select Zuordnen mode
    const matchingModeBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Zuordnen'),
    );
    expect(matchingModeBtn).toBeDefined();
    await act(async () => {
      matchingModeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Verify button label
    expect(container.textContent).toContain('Lernsession starten (5 Aufgaben)');

    // Start session
    const startBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Lernsession starten'),
    );
    await act(async () => {
      startBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockGenMatching).toHaveBeenCalledTimes(1);

    // Initial matching view
    expect(container.textContent).toContain('Aufgabe 1 von 5');
    expect(container.textContent).toContain('Ordne die Cloud-Begriffe den passenden Erläuterungen zu.');
    expect(container.textContent).toContain('0 von 3 zugeordnet');
    expect(container.textContent).toContain('IaaS');
    expect(container.textContent).toContain('PaaS');
    expect(container.textContent).toContain('SaaS');

    // Find left button for IaaS
    const iaasBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'IaaS',
    );
    expect(iaasBtn).toBeDefined();

    // Click IaaS (left)
    await act(async () => {
      iaasBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // IaaS should have aria-pressed true
    expect(iaasBtn?.getAttribute('aria-pressed')).toBe('true');

    // Find mismatched right button: PaaS right description
    const paasRightBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Plattform für Entwickler'),
    );
    expect(paasRightBtn).toBeDefined();

    // Click wrong right match
    await act(async () => {
      paasRightBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Still 0 of 3 pairs matched
    expect(container.textContent).toContain('0 von 3 zugeordnet');

    // Click IaaS again to select it
    await act(async () => {
      iaasBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Find correct right button for IaaS
    const iaasRightBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Bereitstellung von virtualisierter Recheninfrastruktur'),
    );
    expect(iaasRightBtn).toBeDefined();

    // Click correct match
    await act(async () => {
      iaasRightBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Now 1 of 3 pairs matched
    expect(container.textContent).toContain('1 von 3 zugeordnet');
    expect(iaasBtn?.disabled).toBe(true);
    expect(iaasRightBtn?.disabled).toBe(true);

    // Match 2nd pair (PaaS)
    const paasBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'PaaS',
    );
    const activePaasRightBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Plattform für Entwickler'),
    );
    await act(async () => {
      paasBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      activePaasRightBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('2 von 3 zugeordnet');

    // Match 3rd pair (SaaS)
    const saasBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'SaaS',
    );
    await act(async () => {
      saasBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const saasRightBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Anwendungssoftware direkt'),
    );
    await act(async () => {
      saasRightBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // All pairs matched! Task completed state should render
    expect(container.textContent).toContain('3 von 3 zugeordnet');
    expect(container.textContent).toContain('Alles richtig zugeordnet!');
    expect(container.textContent).toContain('Belege aus den Quellen:');
    expect(container.textContent).toContain('Verifizierte Quellen dieser Aufgabe');
    expect(container.textContent).toContain('Cloud_Skript.pdf');
    expect(container.textContent).toContain('AWS Docs');
    expect(container.textContent).toContain('Nächste Aufgabe');
  });

  it('handles WordBank (Lückentext mit Wörtern) mode: placing words, checking, correction, and verification', async () => {
    const mockWordBankTask: WordBankTask = {
      id: 'wb-task-1',
      mode: 'word-bank',
      topicId: 'top-1',
      difficulty: 'mittel',
      instruction: 'Setze die passenden Cloud-Konzepte in die Lücken ein.',
      textWithBlanks: 'Eine {{blank-1}} bietet Basisinfrastruktur, während {{blank-2}} Anwendungssoftware bereitstellt.',
      blanks: [
        {
          id: 'blank-1',
          answer: 'IaaS-Lösung',
          evidence: 'IaaS bietet grundlegende Rechen- und Speicherressourcen.',
          sourceIds: ['doc-1'],
        },
        {
          id: 'blank-2',
          answer: 'SaaS',
          evidence: 'SaaS liefert fertige Software.',
          sourceIds: ['web-1'],
        },
      ],
      words: ['IaaS-Lösung', 'SaaS', 'On-Premises', 'Blockchain'],
      sourceIds: ['doc-1', 'web-1'],
    };

    const mockGenWordBank = vi
      .spyOn(generatorApi, 'generateWordBankTask')
      .mockResolvedValue(mockWordBankTask);

    await renderComponent();

    // Select topic
    const topicBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Cloud-Management'),
    );
    await act(async () => {
      topicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Select "Wortbank" mode
    const wordBankModeBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Wortbank'),
    );
    expect(wordBankModeBtn).toBeDefined();

    await act(async () => {
      wordBankModeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Lernsession starten (5 Aufgaben)');

    // Start session
    const startBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Lernsession starten'),
    );
    await act(async () => {
      startBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockGenWordBank).toHaveBeenCalledTimes(1);

    // Verify task rendering
    expect(container.textContent).toContain('Aufgabe 1 von 5');
    expect(container.textContent).toContain('Setze die passenden Cloud-Konzepte in die Lücken ein.');
    expect(container.textContent).toContain('Wortbank · 0 von 2 Lücken gefüllt');
    expect(container.textContent).toContain('[ Lücke 1 ]');
    expect(container.textContent).toContain('[ Lücke 2 ]');
    expect(container.textContent).toContain('Verfügbare Wörter (4 übrig)');
    expect(container.textContent).toContain('IaaS-Lösung');
    expect(container.textContent).toContain('SaaS');
    expect(container.textContent).toContain('On-Premises');
    expect(container.textContent).toContain('Blockchain');

    // Prüfen button should be disabled because not all blanks are filled
    const checkBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Prüfen',
    ) as HTMLButtonElement | undefined;
    expect(checkBtn).toBeDefined();
    expect(checkBtn?.disabled).toBe(true);

    // Test Tap/Click interaction: select word chip 'Blockchain' (incorrect distractor)
    const blockchainChip = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Blockchain',
    );
    expect(blockchainChip).toBeDefined();
    await act(async () => {
      blockchainChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(blockchainChip?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('Ausgewählt: „Blockchain“');

    // Click on blank 1 to place 'Blockchain'
    const blank1Slot = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.getAttribute('aria-label')?.includes('Lücke 1'),
    );
    expect(blank1Slot).toBeDefined();
    await act(async () => {
      blank1Slot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Blank 1 now contains 'Blockchain'
    expect(container.textContent).toContain('Wortbank · 1 von 2 Lücken gefüllt');
    expect(container.textContent).toContain('Blockchain');

    // Now test drag-and-drop interaction for blank 2: drop 'SaaS' into blank 2
    const blank2Slot = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.getAttribute('aria-label')?.includes('Lücke 2'),
    );
    expect(blank2Slot).toBeDefined();

    const mockDataTransfer = {
      data: {} as Record<string, string>,
      setData(format: string, val: string) {
        this.data[format] = val;
      },
      getData(format: string) {
        return this.data[format] || '';
      },
      dropEffect: 'none',
      effectAllowed: 'all',
    };

    const dropEvent = new Event('drop', { bubbles: true }) as any;
    dropEvent.dataTransfer = mockDataTransfer;
    mockDataTransfer.setData('text/plain', 'SaaS');

    await act(async () => {
      blank2Slot?.dispatchEvent(dropEvent);
    });

    // Both blanks are now filled (2 of 2)
    expect(container.textContent).toContain('Wortbank · 2 von 2 Lücken gefüllt');
    expect(checkBtn?.disabled).toBe(false);

    // Check answers: blank 1 has 'Blockchain' (wrong), blank 2 has 'SaaS' (correct)
    await act(async () => {
      checkBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should show the amber error banner and reveal correct answers — always reveals on check now
    expect(container.textContent).toContain('Einige Lücken sind noch fehlerhaft');
    expect(container.textContent).not.toContain('Alles richtig ausgefüllt!');
    // Evidence/correct-answer section should be shown
    expect(container.textContent).toContain('Richtige Antworten:');
    // "Nächste Aufgabe" button should appear even after a wrong answer
    expect(container.textContent).toContain('Nächste Aufgabe');
  });
});


