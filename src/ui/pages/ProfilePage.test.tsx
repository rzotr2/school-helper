// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProfilePage } from './ProfilePage';
import * as authContext from '../../infrastructure/auth/AuthContext';
import * as subjectsApi from '../../application/use-cases/subjects';
import * as topicsApi from '../../application/use-cases/topics';
import * as progressApi from '../../application/use-cases/learning/learningProgress';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ProfilePage component', () => {
  let container: HTMLDivElement;
  const mockLogOut = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'user-123', email: 'alex@example.com' } as any,
      isLoading: false,
      signIn: vi.fn(),
      logOut: mockLogOut,
    });

    vi.spyOn(subjectsApi, 'getSubjects').mockResolvedValue([
      { id: 'sub-1', ownerId: 'user-123', name: 'Mathematik', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'sub-2', ownerId: 'user-123', name: 'Informatik', position: 1, createdAt: new Date(), updatedAt: new Date() },
    ]);

    vi.spyOn(topicsApi, 'getAllTopics').mockResolvedValue([
      { id: 'top-1', ownerId: 'user-123', subjectId: 'sub-1', name: 'Analysis', position: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 'top-2', ownerId: 'user-123', subjectId: 'sub-1', name: 'Lineare Algebra', position: 1, createdAt: new Date(), updatedAt: new Date() },
      { id: 'top-3', ownerId: 'user-123', subjectId: 'sub-2', name: 'Algorithmen', position: 0, createdAt: new Date(), updatedAt: new Date() },
    ]);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('renders empty learning activity state when no results exist', async () => {
    vi.spyOn(progressApi, 'getLearningResultsForUser').mockResolvedValue([]);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain('alex@example.com');
    expect(container.textContent).toContain('Gesamtübersicht');
    expect(container.textContent).toContain('Lernfortschritt nach Fächern');
    expect(container.textContent).toContain('Noch keine Lernaktivität');
    expect(container.textContent).toContain('Bearbeite deine erste Übung');
  });

  it('renders overall statistics, subject progress, and learning history when results exist', async () => {
    const mockResults: progressApi.LearningResult[] = [
      {
        id: 'res-1',
        userId: 'user-123',
        subjectId: 'sub-1',
        topicId: 'top-1',
        sessionId: 'sess-1',
        exerciseType: 'quiz',
        isCorrect: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'res-2',
        userId: 'user-123',
        subjectId: 'sub-1',
        topicId: 'top-1',
        sessionId: 'sess-1',
        exerciseType: 'quiz',
        isCorrect: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'res-3',
        userId: 'user-123',
        subjectId: 'sub-1',
        topicId: 'top-1',
        sessionId: 'sess-1',
        exerciseType: 'quiz',
        isCorrect: false,
        createdAt: new Date().toISOString(),
      },
    ];

    vi.spyOn(progressApi, 'getLearningResultsForUser').mockResolvedValue(mockResults);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );
    });

    // Overview numbers: 3 total exercises, 2 correct, 1 incorrect
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('67%'); // 2/3 = 67%

    // Subject listed
    expect(container.textContent).toContain('Mathematik');
    expect(container.textContent).toContain('Üben'); // 67% is 'ueben'
    expect(container.textContent).toContain('Analysis');
  });
});
