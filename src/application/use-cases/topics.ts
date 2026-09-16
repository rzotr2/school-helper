import { supabase } from '../../infrastructure/supabase/client';
import type { Database } from '../../infrastructure/supabase/database.types';

export interface Topic {
  id: string;
  ownerId: string;
  subjectId: string;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

type TopicRow = Database['public']['Tables']['topics']['Row'];

const TOPIC_COLUMNS = 'id, owner_id, subject_id, name, position, created_at, updated_at';

function mapTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    ownerId: row.owner_id,
    subjectId: row.subject_id,
    name: row.name,
    position: row.position,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Returns all topics of the given user, ordered by position.
 */
export async function getAllTopics(userId: string): Promise<Topic[]> {
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const { data, error } = await supabase
    .from('topics')
    .select(TOPIC_COLUMNS)
    .eq('owner_id', userId)
    .order('position');

  if (error) throw new Error(error.message);

  return data.map(mapTopic);
}

/**
 * Returns all topics of the given subject, ordered by position.
 */
export async function getTopicsForSubject(userId: string, subjectId: string): Promise<Topic[]> {
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const { data, error } = await supabase
    .from('topics')
    .select(TOPIC_COLUMNS)
    .eq('owner_id', userId)
    .eq('subject_id', subjectId)
    .order('position');

  if (error) throw new Error(error.message);

  return data.map(mapTopic);
}

/**
 * Returns the topic with the given id. RLS hides rows owned by others, so
 * absence of the row is indistinguishable from "another user's topic".
 */
export async function getTopic(userId: string, topicId: string): Promise<Topic> {
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const { data, error } = await supabase
    .from('topics')
    .select(TOPIC_COLUMNS)
    .eq('id', topicId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Topic not found');

  return mapTopic(data);
}

/**
 * Creates a new topic in the given subject. The subject must belong to the
 * current user, and topic names must be unique within the subject.
 */
export async function createTopic(userId: string, subjectId: string, name: string): Promise<Topic> {
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Topic name cannot be empty');
  }
  if (trimmedName.length > 100) {
    throw new Error('Topic name must be 100 characters or less');
  }

  // Verify the subject exists and belongs to the user (RLS enforces this as
  // a backstop, but the UI needs the specific error message).
  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .maybeSingle();

  if (subjectError) throw new Error(subjectError.message);
  if (!subject) {
    throw new Error('Unauthorized: Subject does not exist or belong to user');
  }

  // Duplicate check (case-insensitive, as before)
  const existingTopics = await getTopicsForSubject(userId, subjectId);
  if (existingTopics.some((t) => t.name.toLowerCase() === trimmedName.toLowerCase())) {
    throw new Error('A topic with this name already exists in this subject');
  }

  const id = crypto.randomUUID();
  const { data: created, error } = await supabase
    .from('topics')
    .insert({
      id,
      owner_id: userId,
      subject_id: subjectId,
      name: trimmedName,
      position: existingTopics.length,
    })
    .select(TOPIC_COLUMNS)
    .single();

  if (error) throw new Error(error.message);

  return mapTopic(created);
}

/**
 * Renames the given topic. Duplicate names within the subject are rejected.
 */
export async function updateTopic(userId: string, topicId: string, name: string): Promise<void> {
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Topic name cannot be empty');
  }
  if (trimmedName.length > 100) {
    throw new Error('Topic name must be 100 characters or less');
  }

  const topic = await getTopic(userId, topicId);

  const existingTopics = await getTopicsForSubject(userId, topic.subjectId);
  if (
    existingTopics.some(
      (t) => t.id !== topicId && t.name.toLowerCase() === trimmedName.toLowerCase(),
    )
  ) {
    throw new Error('A topic with this name already exists in this subject');
  }

  const { error } = await supabase
    .from('topics')
    .update({ name: trimmedName })
    .eq('id', topicId);

  if (error) throw new Error(error.message);
}

/**
 * Deletes the topic, its documents' storage objects and their metadata rows.
 */
export async function deleteTopic(userId: string, topicId: string): Promise<void> {
  if (!userId) {
    throw new Error('User must be authenticated');
  }

  // Ownership check: RLS hides rows owned by others.
  const { data: topic, error: topicError } = await supabase
    .from('topics')
    .select('id')
    .eq('id', topicId)
    .maybeSingle();

  if (topicError) throw new Error(topicError.message);
  if (!topic) throw new Error('Topic not found');

  // Collect the topic's documents.
  const { data: documents, error: documentsError } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('topic_id', topicId);

  if (documentsError) throw new Error(documentsError.message);

  // Delete the storage objects first. If an object is already gone the
  // removal is treated as success; any other storage error aborts the
  // deletion before metadata rows disappear, avoiding orphaned files.
  for (const document of documents) {
    const { error: removeError } = await supabase.storage
      .from('documents')
      .remove([document.storage_path]);

    if (removeError && !/not found/i.test(removeError.message)) {
      throw new Error(`Failed to delete storage file: ${removeError.message}`);
    }
  }

  // Delete the metadata rows, then the topic itself.
  const { error: deleteDocumentsError } = await supabase
    .from('documents')
    .delete()
    .eq('topic_id', topicId);

  if (deleteDocumentsError) throw new Error(deleteDocumentsError.message);

  const { error: deleteTopicError } = await supabase
    .from('topics')
    .delete()
    .eq('id', topicId);

  if (deleteTopicError) throw new Error(deleteTopicError.message);
}
