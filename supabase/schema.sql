create table if not exists public.leaderboard (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 16),
  score integer not null check (score between 1 and 100000),
  mode text not null check (mode in ('Classic', 'Time attack')),
  created_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

create policy "Anyone can read leaderboard"
  on public.leaderboard for select
  using (true);

create policy "Players can submit their own scores"
  on public.leaderboard for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and char_length(nickname) between 1 and 16
    and score between 1 and 100000
    and mode in ('Classic', 'Time attack')
  );

grant select on public.leaderboard to anon, authenticated;
grant insert on public.leaderboard to authenticated;
grant usage, select on sequence public.leaderboard_id_seq to authenticated;
