-- Fix permissions, column types, and defaults for public.learning_results

-- 1. Ensure id column has gen_random_uuid() default
alter table public.learning_results alter column id set default gen_random_uuid();

-- 2. Allow session_id to accept any text or UUID string safely without syntax errors
alter table public.learning_results alter column session_id type text;

-- 3. CRITICAL: Grant PostgREST permissions to authenticated role
-- Without this, Supabase rejects queries with "permission denied for table learning_results"
grant select, insert on public.learning_results to authenticated;

-- 4. Recreate explicit RLS policies for authenticated users
drop policy if exists "users can manage their own learning results" on public.learning_results;
drop policy if exists "users can select their own learning results" on public.learning_results;
drop policy if exists "users can insert their own learning results" on public.learning_results;

create policy "users can select their own learning results"
  on public.learning_results
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own learning results"
  on public.learning_results
  for insert
  to authenticated
  with check (auth.uid() = user_id);
