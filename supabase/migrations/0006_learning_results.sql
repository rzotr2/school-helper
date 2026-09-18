-- "Materia": persisted learning results + RLS
-- Stores immutable records of completed learning exercises for progress and statistics.

create table if not exists public.learning_results (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  session_id uuid,
  exercise_type varchar(50) not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists learning_results_user_idx on public.learning_results (user_id);
create index if not exists learning_results_user_topic_idx on public.learning_results (user_id, topic_id);
create index if not exists learning_results_user_subject_idx on public.learning_results (user_id, subject_id);
create index if not exists learning_results_user_created_idx on public.learning_results (user_id, created_at desc);

-- Immutability: learning records cannot be altered after insertion
create or replace function public.learning_results_check_immutable()
returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.subject_id is distinct from old.subject_id
     or new.topic_id is distinct from old.topic_id
     or new.session_id is distinct from old.session_id
     or new.exercise_type is distinct from old.exercise_type
     or new.is_correct is distinct from old.is_correct
     or new.created_at is distinct from old.created_at then
    raise exception 'learning_results: records are immutable';
  end if;
  return new;
end;
$$;

create trigger learning_results_immutable
  before update on public.learning_results
  for each row execute function public.learning_results_check_immutable();

-- Row Level Security
alter table public.learning_results enable row level security;

create policy "users can manage their own learning results" on public.learning_results
  for all using (auth.uid() = user_id);
