// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubjectPage } from './SubjectPage';
import * as authContext from '../../infrastructure/auth/AuthContext';
import * as subjectsApi from '../../application/use-cases/subjects';
import * as topicsApi from '../../application/use-cases/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SubjectPage component topic card navigation', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    });

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'test-user', email: 'test@example.com' } as any,
      isLoading: false,
      signIn: vi.fn(),
      logOut: vi.fn(),
    });

    vi.spyOn(subjectsApi, 'getSubjects').mockResolvedValue([
      { id: 'sub-1', ownerId: 'test-user', name: 'PuG Bedacht', position: 0, createdAt: new Date(), updatedAt: new Date() },
    ]);

    vi.spyOn(topicsApi, 'getTopicsForSubject').mockResolvedValue([
      { id: 'top-1', ownerId: 'test-user', subjectId: 'sub-1', name: 'Wiederholung', position: 0, createdAt: new Date(), updatedAt: new Date() },
    ]);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('renders topic card with a full-card link and independent rename/delete buttons', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/subject/sub-1']}>
          <Routes>
            <Route path="/subject/:subjectId" element={<SubjectPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    // Topic title rendered
    expect(container.textContent).toContain('Wiederholung');
    expect(container.textContent).toContain('Thema öffnen & Unterlagen ansehen');

    // Primary link covers topic card
    const topicLink = container.querySelector('a[href="/subject/sub-1/topic/top-1"]');
    expect(topicLink).toBeDefined();
    expect(topicLink?.className).toContain('after:absolute');
    expect(topicLink?.className).toContain('after:inset-0');

    // Independent action buttons exist
    const renameBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.includes('umbenennen'),
    );
    expect(renameBtn).toBeDefined();

    const deleteBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.includes('löschen'),
    );
    expect(deleteBtn).toBeDefined();

    // Clicking Rename sets editingTopic and renders dialog
    await act(async () => {
      renameBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const editHeading = Array.from(container.querySelectorAll('h2')).find((h) =>
      h.textContent?.includes('Thema umbenennen'),
    );
    expect(editHeading).toBeDefined();
  });

  it('allows clicking delete button independently to trigger topic delete dialog', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/subject/sub-1']}>
          <Routes>
            <Route path="/subject/:subjectId" element={<SubjectPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const deleteBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label') === 'Thema "Wiederholung" löschen',
    );
    expect(deleteBtn).toBeDefined();

    // Click Delete button
    await act(async () => {
      deleteBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const deleteHeading = Array.from(container.querySelectorAll('h2')).find((h) =>
      h.textContent === 'Thema löschen?',
    );
    expect(deleteHeading).toBeDefined();
  });
});
