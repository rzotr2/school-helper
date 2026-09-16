-- "Meine Schule": profiles, subjects, topics, documents + RLS.
-- Client generates UUID PKs (crypto.randomUUID); timestamps are DB-side.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name varchar(100) not null check (char_length(name) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subjects_owner_position_idx on public.subjects (owner_id, position);

create table if not exists public.topics (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name varchar(100) not null check (char_length(name) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists topics_owner_subject_position_idx on public.topics (owner_id, subject_id, position);

create table if not exists public.documents (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  original_name varchar(255) not null check (char_length(original_name) > 0),
  storage_path varchar(500) not null check (char_length(storage_path) > 0),
  mime_type text not null check (mime_type = 'application/pdf'),
  size bigint not null check (size > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_owner_idx on public.documents (owner_id);
create index if not exists documents_owner_topic_idx on public.documents (owner_id, topic_id);

-- updated_at (replaces the serverTimestamp discipline)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger subjects_set_updated_at before update on public.subjects for each row execute function public.set_updated_at();
create trigger topics_set_updated_at before update on public.topics for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();

-- Immutability (replicates the Firestore rules: only whitelisted columns are mutable)
create or replace function public.documents_check_immutable()
returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.storage_path is distinct from old.storage_path
     or new.mime_type is distinct from old.mime_type
     or new.size is distinct from old.size
     or new.created_at is distinct from old.created_at then
    raise exception 'documents: owner_id, storage_path, mime_type, size and created_at are immutable';
  end if;
  return new;
end;
$$;
create trigger documents_immutable before update on public.documents for each row execute function public.documents_check_immutable();

create or replace function public.topics_check_immutable()
returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.subject_id is distinct from old.subject_id
     or new.created_at is distinct from old.created_at then
    raise exception 'topics: owner_id, subject_id and created_at are immutable';
  end if;
  return new;
end;
$$;
create trigger topics_immutable before update on public.topics for each row execute function public.topics_check_immutable();

create or replace function public.subjects_check_immutable()
returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at then
    raise exception 'subjects: owner_id and created_at are immutable';
  end if;
  return new;
end;
$$;
create trigger subjects_immutable before update on public.subjects for each row execute function public.subjects_check_immutable();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.documents enable row level security;

-- profiles: own row only
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_own on public.profiles for delete to authenticated using (id = auth.uid());

-- subjects: own rows; create requires an own profile (Firebase parity)
create policy subjects_select_own on public.subjects for select to authenticated using (owner_id = auth.uid());
create policy subjects_insert_own on public.subjects for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid()));
create policy subjects_update_own on public.subjects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy subjects_delete_own on public.subjects for delete to authenticated using (owner_id = auth.uid());

-- topics: own rows; create only when the subject belongs to the current user
create policy topics_select_own on public.topics for select to authenticated using (owner_id = auth.uid());
create policy topics_insert_own on public.topics for insert to authenticated
  with check (owner_id = auth.uid()
    and exists (select 1 from public.subjects s where s.id = subject_id and s.owner_id = auth.uid()));
create policy topics_update_own on public.topics for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy topics_delete_own on public.topics for delete to authenticated using (owner_id = auth.uid());

-- documents: own rows; create only when the topic belongs to the current user;
-- update only when the (possibly new) topic belongs to the current user -> move into own topic only
create policy documents_select_own on public.documents for select to authenticated using (owner_id = auth.uid());
create policy documents_insert_own on public.documents for insert to authenticated
  with check (owner_id = auth.uid()
    and exists (select 1 from public.topics t where t.id = topic_id and t.owner_id = auth.uid()));
create policy documents_update_own on public.documents for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.topics t where t.id = topic_id and t.owner_id = auth.uid()));
create policy documents_delete_own on public.documents for delete to authenticated using (owner_id = auth.uid());

-- Grants (PostgREST roles)
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.subjects to authenticated;
grant select, insert, update, delete on public.topics to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
