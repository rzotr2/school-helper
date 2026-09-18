// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LandingPage } from './LandingPage';
import * as authContext from '../../infrastructure/auth/AuthContext';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LandingPage component', () => {
  let container: HTMLDivElement;
  const mockSignIn = vi.fn();
  const mockLogOut = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      signIn: mockSignIn,
      logOut: mockLogOut,
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('renders landing page with Materia branding and hero headline', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LandingPage />);
    });

    // Branding
    expect(container.textContent).toContain('Materia');

    // Headline
    expect(container.textContent).toContain('Deine Schule.');
    expect(container.textContent).toContain('Alles an einem Ort.');

    // Sections
    expect(container.textContent).toContain('Vom Dokument zum Lernerfolg');
    expect(container.textContent).toContain('Fächer, Themen und Dokumente klar strukturiert');
    expect(container.textContent).toContain('5 interaktive Lernmodi für deine Unterlagen');
    expect(container.textContent).toContain('Quellenbasiertes Lernen statt Spekulation');
    expect(container.textContent).toContain('Bereit für mehr Ordnung in deinem Schulalltag?');
  });

  it('triggers signIn when clicking "Mit Google starten" or "Jetzt starten"', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LandingPage />);
    });

    const startButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('starten'),
    );
    expect(startButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      startButtons[0].click();
    });

    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('allows switching tabs in the product preview window', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LandingPage />);
    });

    // Find tab 2 button
    const buttons = Array.from(container.querySelectorAll('button'));
    const learnTab = buttons.find((b) => b.textContent?.includes('Interaktives Lernen'));
    expect(learnTab).toBeDefined();

    await act(async () => {
      learnTab?.click();
    });

    expect(container.textContent).toContain('Wann gerät der Lieferant beim Fixkauf');

    // Find tab 3 button
    const analysisTab = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Dokumenten-Analyse'),
    );
    expect(analysisTab).toBeDefined();

    await act(async () => {
      analysisTab?.click();
    });

    expect(container.textContent).toContain('Inhaltliche Zusammenfassung');
    expect(container.textContent).toContain('Erfasste Kernkonzepte & Themen');
  });

  it('allows exploring the 5 learning modes in the showcase section', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LandingPage />);
    });

    // Default Quiz
    expect(container.textContent).toContain(
      'Welche Voraussetzung muss für den Eintritt des Schuldnerverzugs',
    );

    // Switch to Flashcards
    const flashcardsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Karteikarten'),
    );
    expect(flashcardsBtn).toBeDefined();
    await act(async () => {
      flashcardsBtn?.click();
    });
    expect(container.textContent).toContain('Was versteht man unter einer „Gattungsschuld“?');

    // Switch to Lückentext
    const fillBlankBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Lückentext'),
    );
    expect(fillBlankBtn).toBeDefined();
    await act(async () => {
      fillBlankBtn?.click();
    });
    expect(container.textContent).toContain('Fehlertolerante Rechtschreibprüfung aktiv');

    // Switch to Zuordnen
    const matchingBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Zuordnen'),
    );
    expect(matchingBtn).toBeDefined();
    await act(async () => {
      matchingBtn?.click();
    });
    expect(container.textContent).toContain('Begriffe & Bedeutungen');

    // Switch to Wortbank
    const wordBankBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Wortbank'),
    );
    expect(wordBankBtn).toBeDefined();
    await act(async () => {
      wordBankBtn?.click();
    });
    expect(container.textContent).toContain('Verfügbare Wort-Tokens');
  });

  it('shows "Zum Workspace" CTA when user is already authenticated', async () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'test-user', email: 'student@example.com' } as any,
      isLoading: false,
      signIn: mockSignIn,
      logOut: mockLogOut,
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(<LandingPage />);
    });

    const workspaceButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Zum Workspace'),
    );
    expect(workspaceButtons.length).toBeGreaterThanOrEqual(1);
  });
});
