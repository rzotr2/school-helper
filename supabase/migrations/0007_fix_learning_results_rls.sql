-- Fix RLS on learning_results: replace the broad "for all" policy with
-- explicit separate policies so INSERT actually passes the WITH CHECK expression.
-- In Supabase/PostgreSQL, "for all using (...)" only applies the USING predicate
-- to SELECT/UPDATE/DELETE row visibility — for INSERT the engine needs a
-- WITH CHECK clause.  The safest fix is explicit per-command policies.

-- Remove the old catch-all policy
drop policy if exists "users can manage their own learning results" on public.learning_results;

-- Users may only read their own rows
create policy "users can select their own learning results"
  on public.learning_results
  for select
  using (auth.uid() = user_id);

-- Users may only insert rows that belong to themselves
create policy "users can insert their own learning results"
  on public.learning_results
  for insert
  with check (auth.uid() = user_id);
