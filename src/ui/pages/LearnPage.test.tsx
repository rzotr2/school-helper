// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearnPage } from './LearnPage';
import * as authContext from '../../infrastructure/auth/AuthContext';
import * as subjectsApi from '../../application/use-cases/subjects';
import * as topicsApi from '../../application/use-cases/topics';

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
    ]);

    vi.spyOn(topicsApi, 'getAllTopics').mockResolvedValue([
      { id: 'top-1', ownerId: 'test-user', subjectId: 'sub-1', name: 'Cloud-Management', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'top-2', ownerId: 'test-user', subjectId: 'sub-1', name: 'Netzwerke', position: 1, createdAt: new Date(), updatedAt: new Date() },
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

  it('renders subject and topic selection steps properly', async () => {
    await renderComponent();

    expect(container.textContent).toContain('Lernen');
    expect(container.textContent).toContain('1. Fach auswählen');
    expect(container.textContent).toContain('Informatik');
    expect(container.textContent).toContain('2. Themen auswählen');
    expect(container.textContent).toContain('Cloud-Management');
    expect(container.textContent).toContain('Netzwerke');
  });

  it('allows toggling topics and shows start session button', async () => {
    await renderComponent();

    const topicButtons = Array.from(container.querySelectorAll('button')).filter((btn) =>
      btn.textContent?.includes('Cloud-Management'),
    );
    expect(topicButtons.length).toBeGreaterThan(0);

    await act(async () => {
      topicButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('3. Lernmodus');
    expect(container.textContent).toContain('Multiple-Choice Quiz');
    expect(container.textContent).toContain('Lernsession starten');
  });
});
