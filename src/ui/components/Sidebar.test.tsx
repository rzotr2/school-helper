// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import * as authContext from '../../infrastructure/auth/AuthContext';
import * as subjectsApi from '../../application/use-cases/subjects';
import * as topicsApi from '../../application/use-cases/topics';
import * as schoolProfileApi from '../../application/use-cases/schoolProfile';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Sidebar component expandable navigation', () => {
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

    vi.spyOn(schoolProfileApi, 'getSchoolProfile').mockResolvedValue({
      id: 'profile-1',
      userId: 'test-user',
      schoolName: 'Berufsschule',
      federalState: 'BY',
      schoolType: 'Berufsschule',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.spyOn(subjectsApi, 'getSubjects').mockResolvedValue([
      { id: 'sub-1', ownerId: 'test-user', name: 'PuG Bedacht', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'sub-2', ownerId: 'test-user', name: 'Deutsch', position: 1, createdAt: new Date(), updatedAt: new Date() },
    ]);

    vi.spyOn(topicsApi, 'getAllTopics').mockResolvedValue([
      { id: 'top-1', ownerId: 'test-user', subjectId: 'sub-1', name: 'Wiederholung', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'top-2', ownerId: 'test-user', subjectId: 'sub-1', name: 'Netzwerke', position: 1, createdAt: new Date(), updatedAt: new Date() },
    ]);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  const renderComponent = async (initialEntries = ['/']) => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={initialEntries}>
          <Sidebar />
        </MemoryRouter>,
      );
    });
    return root;
  };

  it('renders subjects, shows chevron only for subjects with topics, and keeps zero-topic subjects non-expandable', async () => {
    await renderComponent();

    // Subjects rendered
    expect(container.textContent).toContain('PuG Bedacht');
    expect(container.textContent).toContain('Deutsch');

    // PuG Bedacht has topics -> chevron button exists
    const expandBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.includes('PuG Bedacht Themen'),
    );
    expect(expandBtn).toBeDefined();
    expect(expandBtn?.getAttribute('aria-expanded')).toBe('false');

    // Deutsch has 0 topics -> no expand button
    const deutschExpandBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.includes('Deutsch Themen'),
    );
    expect(deutschExpandBtn).toBeUndefined();

    // Topics initially collapsed
    expect(container.textContent).not.toContain('Wiederholung');
    expect(container.textContent).not.toContain('Netzwerke');
  });

  it('expands and collapses topics when clicking the chevron toggle without navigating', async () => {
    await renderComponent();

    const expandBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.includes('PuG Bedacht Themen'),
    );
    expect(expandBtn).toBeDefined();

    // Click chevron to expand
    await act(async () => {
      expandBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(expandBtn?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Wiederholung');
    expect(container.textContent).toContain('Netzwerke');

    // Click chevron again to collapse
    await act(async () => {
      expandBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(expandBtn?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Wiederholung');
    expect(container.textContent).not.toContain('Netzwerke');
  });

  it('automatically expands the parent subject when on a topic route and marks topic as active', async () => {
    await renderComponent(['/subject/sub-1/topic/top-1']);

    // Parent subject should be auto-expanded
    expect(container.textContent).toContain('Wiederholung');
    expect(container.textContent).toContain('Netzwerke');

    // Topic link should have active styling / href
    const topicLink = Array.from(container.querySelectorAll('a')).find((a) =>
      a.getAttribute('href') === '/subject/sub-1/topic/top-1',
    );
    expect(topicLink).toBeDefined();
    expect(topicLink?.textContent).toContain('Wiederholung');
    expect(topicLink?.className).toContain('text-blue-700');
  });
});
