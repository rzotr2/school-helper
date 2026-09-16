import { supabase } from '../../infrastructure/supabase/client';

export interface SchoolProfile {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Returns the profile for the given user, or null if it does not exist.
 * The profile row is created lazily on first sign-in by the bootstrap flow.
 */
export async function getSchoolProfile(userId: string): Promise<SchoolProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Idempotently creates the profile row for the given user.
 */
export async function createSchoolProfile(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

  if (error) throw new Error(error.message);
}
