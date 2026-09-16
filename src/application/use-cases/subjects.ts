import { supabase } from '../../infrastructure/supabase/client';
import type { Database } from '../../infrastructure/supabase/database.types';
import { deleteTopic } from './topics';

export interface Subject {
  id: string;
  ownerId: string;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

type SubjectRow = Database['public']['Tables']['subjects']['Row'];

function mapSubject(row: SubjectRow): Subject {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    position: row.position,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Returns all subjects of the given user, ordered by position.
 */
export async function getSubjects(userId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select('id, owner_id, name, position, created_at, updated_at')
    .eq('owner_id', userId)
    .order('position');

  if (error) throw new Error(error.message);

  return data.map(mapSubject);
}

/**
 * Creates a new subject and returns its id.
 */
export async function createSubject(userId: string, name: string, position: number): Promise<string> {
  if (!name.trim()) {
    throw new Error('Subject name cannot be empty');
  }
  if (name.length > 100) {
    throw new Error('Subject name is too long');
  }

  const id = crypto.randomUUID();
  const { error } = await supabase
    .from('subjects')
    .insert({ id, owner_id: userId, name: name.trim(), position });

  if (error) throw new Error(error.message);

  return id;
}

/**
 * Renames the given subject. Ownership is enforced by RLS (the update
 * silently affects no rows if the subject belongs to another user).
 */
export async function updateSubject(userId: string, subjectId: string, name: string): Promise<void> {
  if (!name.trim()) {
    throw new Error('Subject name cannot be empty');
  }
  if (name.length > 100) {
    throw new Error('Subject name is too long');
  }

  const { error } = await supabase
    .from('subjects')
    .update({ name: name.trim() })
    .eq('id', subjectId);

  if (error) throw new Error(error.message);
}

/**
 * Deletes the subject and all of its topics (including their documents).
 */
export async function deleteSubject(userId: string, subjectId: string): Promise<void> {
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  // Ownership check: RLS hides rows owned by others, so absence of the row
  // means either the subject does not exist or it belongs to another user.
  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .maybeSingle();

  if (subjectError) throw new Error(subjectError.message);
  if (!subject) throw new Error('Subject not found');

  // Cascade: delete each topic (which deletes its documents' storage objects
  // first, then their metadata rows).
  const { data: topics, error: topicsError } = await supabase
    .from('topics')
    .select('id')
    .eq('subject_id', subjectId);

  if (topicsError) throw new Error(topicsError.message);

  for (const topic of topics) {
    await deleteTopic(userId, topic.id);
  }

  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', subjectId);

  if (error) throw new Error(error.message);
}
