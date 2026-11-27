begin;
create schema dolbal_internal;
revoke all on schema dolbal_internal from public, anon, authenticated;
grant usage on schema dolbal_internal to authenticated;
create type public.dolbal_field as enum ('기획·PM','디자인','개발·데이터','기계·로봇','취업·진로','기타','기계설계·해석','전자회로·전력','임베디드·제어');
create table public.dolbal_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (length(btrim(nickname)) between 1 and 20),
  member_name text not null check (length(btrim(member_name)) between 1 and 32),
  department text check (department in ('기계공학과','전자전기공학과')),
  role text not null check (role in ('재학생','졸업생')),
  field public.dolbal_field,
  bio text not null default '' check (length(bio)<=160),
  listed boolean not null default false check (not listed or role='졸업생'),
  approved boolean not null default false
);
create function dolbal_internal.member_ok() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.dolbal_profiles where id=(select auth.uid()) and approved)
$$;
revoke all on function dolbal_internal.member_ok() from public, anon, authenticated;
grant execute on function dolbal_internal.member_ok() to authenticated;
create domain public.dolbal_photo as text check (
  value is null or (octet_length(value) between 35 and 650000 and value ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$')
);
create table public.dolbal_questions (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references public.dolbal_profiles(id) on delete cascade,
  target uuid references public.dolbal_profiles(id) on delete set null,
  field public.dolbal_field,
  title text not null check (length(btrim(title)) between 2 and 120),
  body text not null check (length(btrim(body)) between 1 and 5000),
  photo public.dolbal_photo,
  author_name text,
  author_department text,
  author_class text,
  constraint dolbal_questions_author_signature check (
      author_name is not null and length(btrim(author_name)) between 1 and 32 and author_name ~ '[^[:space:]]' and
      author_department is not null and author_department in ('기계공학과','전자전기공학과') and
      author_class is not null and author_class ~ '^[0-9]{2}$'
  ),
  created_at timestamptz not null default now()
);
create table public.dolbal_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.dolbal_questions(id) on delete cascade,
  author uuid not null references public.dolbal_profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 5000),
  photo public.dolbal_photo,
  author_name text,
  author_department text,
  author_class text,
  constraint dolbal_answers_author_signature check (
      author_name is not null and length(btrim(author_name)) between 1 and 32 and author_name ~ '[^[:space:]]' and
      author_department is not null and author_department in ('기계공학과','전자전기공학과') and
      author_class is not null and author_class ~ '^[0-9]{2}$'
  ),
  created_at timestamptz not null default now()
);
create index dolbal_questions_author on public.dolbal_questions(author);
create index dolbal_questions_target on public.dolbal_questions(target);
create index dolbal_answers_question on public.dolbal_answers(question_id,id);
create index dolbal_answers_author on public.dolbal_answers(author);
alter table public.dolbal_profiles enable row level security;
alter table public.dolbal_questions enable row level security;
alter table public.dolbal_answers enable row level security;
revoke all on public.dolbal_profiles, public.dolbal_questions, public.dolbal_answers from public, anon, authenticated;
grant select (id,nickname,role,department,field,bio,listed,approved), insert (id,nickname,member_name,role,department,field,bio,listed) on public.dolbal_profiles to authenticated;
grant select, insert (id,author,target,author_name,author_department,author_class,field,title,body,photo) on public.dolbal_questions to authenticated;
grant select, insert (id,author,question_id,author_name,author_department,author_class,body,photo) on public.dolbal_answers to authenticated;
create policy dolbal_profiles_read on public.dolbal_profiles for select to authenticated
using (id=(select auth.uid()) or (approved and (select dolbal_internal.member_ok())));
create policy dolbal_profiles_request on public.dolbal_profiles for insert to authenticated
with check (id=(select auth.uid()) and not approved);
create policy dolbal_questions_read on public.dolbal_questions for select to authenticated
using ((select dolbal_internal.member_ok()));
create policy dolbal_questions_write on public.dolbal_questions for insert to authenticated
with check (author=(select auth.uid()) and (select dolbal_internal.member_ok()) and
  (target is null or exists(select 1 from public.dolbal_profiles p where p.id=target and p.approved and p.listed and p.role='졸업생')));
create policy dolbal_answers_read on public.dolbal_answers for select to authenticated
using ((select dolbal_internal.member_ok()));
create policy dolbal_answers_write on public.dolbal_answers for insert to authenticated
with check (author=(select auth.uid()) and (select dolbal_internal.member_ok()));
create table dolbal_internal.signup_window (
  bucket timestamptz primary key,
  attempts int not null
);
revoke all on dolbal_internal.signup_window from public, anon, authenticated;
alter table dolbal_internal.signup_window enable row level security;
grant usage on schema dolbal_internal to service_role;
grant select,insert,update,delete on dolbal_internal.signup_window to service_role;
create function public.dolbal_allow_signup() returns boolean
language plpgsql security invoker set search_path='' as $$
declare current_hour timestamptz := date_trunc('hour',now()); accepted integer;
begin
  delete from dolbal_internal.signup_window where bucket < current_hour;
  insert into dolbal_internal.signup_window as s (bucket,attempts) values(current_hour,1)
    on conflict(bucket) do update set attempts=s.attempts+1 where s.attempts<40 returning attempts into accepted;
  return accepted is not null;
end;
$$;
revoke all on function public.dolbal_allow_signup() from public, anon, authenticated;
grant execute on function public.dolbal_allow_signup() to service_role;
commit;
