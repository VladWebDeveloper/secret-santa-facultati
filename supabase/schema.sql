-- Secret Santa Campus — rulează integral în SQL Editor în proiectul TĂU Supabase.
-- Necesită extensia pgcrypto (de regulă instalată implicit pe Supabase).
create extension if not exists pgcrypto;

create table if not exists public.event_settings (
  id integer primary key default 1 check (id = 1),
  name text not null default 'Secret Santa Campus',
  registration_open boolean not null default true,
  draw_done boolean not null default false,
  budget_min integer not null default 100 check (budget_min >= 100),
  exchange_at timestamptz,
  exchange_place text not null default '' check (char_length(exchange_place) <= 220),
  drawn_at timestamptz
);
insert into public.event_settings(id) values(1) on conflict(id) do nothing;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.participants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null check (char_length(full_name) between 3 and 90),
  university text not null check (char_length(university) between 2 and 120),
  faculty text not null check (char_length(faculty) between 2 and 120),
  wishlist text not null check (char_length(wishlist) between 4 and 1000),
  avoid_gifts text not null default '' check (char_length(avoid_gifts) <= 600),
  assigned_to uuid references public.participants(user_id) on delete restrict,
  gift_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  constraint no_self_assignment check (assigned_to is distinct from user_id)
);
create unique index if not exists recipients_only_once
  on public.participants(assigned_to) where assigned_to is not null;

alter table public.event_settings enable row level security;
alter table public.admins enable row level security;
alter table public.participants enable row level security;
revoke all on public.event_settings, public.admins, public.participants from anon, authenticated;
grant select on public.participants to authenticated;

create or replace function public.is_santa_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (select 1 from public.admins a where a.user_id = auth.uid()); $$;
revoke all on function public.is_santa_admin() from public, anon;
grant execute on function public.is_santa_admin() to authenticated;

-- Nu permite vizualizarea altor participanți decât pentru administrator.
drop policy if exists participants_self_or_admin on public.participants;
create policy participants_self_or_admin on public.participants for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_santa_admin()));

create or replace function public.get_santa_status()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'name', s.name, 'registration_open', s.registration_open,
    'draw_done', s.draw_done, 'budget_min', s.budget_min,
    'exchange_at', s.exchange_at, 'exchange_place', s.exchange_place,
    'participant_count', (select count(*) from public.participants)
  ) from public.event_settings s where id = 1;
$$;
revoke all on function public.get_santa_status() from public;
grant execute on function public.get_santa_status() to anon, authenticated;

-- TOATE modificările profilului sunt serializate cu închiderea înscrierilor.
create or replace function public.save_santa_profile(
  p_full_name text, p_university text, p_faculty text,
  p_wishlist text, p_avoid_gifts text default ''
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_open boolean;
  v_draw_done boolean;
  v_exists boolean;
begin
  if v_user is null then raise exception 'Autentificarea este necesară'; end if;
  select registration_open, draw_done into v_open, v_draw_done
    from public.event_settings where id = 1 for update;
  select exists(select 1 from public.participants where user_id = v_user) into v_exists;
  if not v_exists and (not v_open or v_draw_done) then
    raise exception 'Înscrierile sunt închise';
  end if;
  if char_length(btrim(coalesce(p_full_name,''))) not between 3 and 90 or
     char_length(btrim(coalesce(p_university,''))) not between 2 and 120 or
     char_length(btrim(coalesce(p_faculty,''))) not between 2 and 120 or
     char_length(btrim(coalesce(p_wishlist,''))) not between 4 and 1000 or
     char_length(coalesce(p_avoid_gifts,'')) > 600 then
    raise exception 'Datele completate nu respectă limitele câmpurilor';
  end if;
  select email into v_email from auth.users where id = v_user;
  if v_email is null then raise exception 'Emailul nu este disponibil'; end if;
  if v_exists then
    if v_draw_done or not v_open then
      update public.participants set wishlist = btrim(p_wishlist),
        avoid_gifts = btrim(coalesce(p_avoid_gifts,'')) where user_id = v_user;
    else
      update public.participants set full_name=btrim(p_full_name),
        university=btrim(p_university),faculty=btrim(p_faculty),
        wishlist=btrim(p_wishlist),avoid_gifts=btrim(coalesce(p_avoid_gifts,''))
        where user_id=v_user;
    end if;
  else
    insert into public.participants(user_id,email,full_name,university,faculty,wishlist,avoid_gifts)
    values(v_user,lower(v_email),btrim(p_full_name),btrim(p_university),btrim(p_faculty),btrim(p_wishlist),btrim(coalesce(p_avoid_gifts,'')));
  end if;
end;
$$;
revoke all on function public.save_santa_profile(text,text,text,text,text) from public, anon;
grant execute on function public.save_santa_profile(text,text,text,text,text) to authenticated;

create or replace function public.leave_santa_event()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_open boolean; v_draw boolean;
begin
  if auth.uid() is null then raise exception 'Autentificare necesară'; end if;
  select registration_open,draw_done into v_open,v_draw
    from public.event_settings where id=1 for update;
  if not v_open or v_draw then raise exception 'Nu poți renunța după închiderea înscrierilor'; end if;
  delete from public.participants where user_id=auth.uid();
end;
$$;
revoke all on function public.leave_santa_event() from public, anon;
grant execute on function public.leave_santa_event() to authenticated;

-- Extragerea se vede doar de participantul care oferă cadoul.
create or replace function public.my_santa_assignment()
returns table(recipient_name text, recipient_university text, recipient_faculty text,
  recipient_wishlist text, recipient_avoid text)
language sql stable security definer set search_path = ''
as $$
  select r.full_name,r.university,r.faculty,r.wishlist,r.avoid_gifts
    from public.participants giver
    join public.participants r on r.user_id=giver.assigned_to
    join public.event_settings s on s.id=1 and s.draw_done
    where giver.user_id=auth.uid();
$$;
revoke all on function public.my_santa_assignment() from public, anon;
grant execute on function public.my_santa_assignment() to authenticated;

create or replace function public.mark_santa_gift_ready(p_ready boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Autentificare necesară'; end if;
  update public.participants set gift_ready=coalesce(p_ready,false)
    where user_id=auth.uid() and assigned_to is not null;
  if not found then raise exception 'Extragerea încă nu a avut loc'; end if;
end;
$$;
revoke all on function public.mark_santa_gift_ready(boolean) from public, anon;
grant execute on function public.mark_santa_gift_ready(boolean) to authenticated;

create or replace function public.configure_santa_event(p_registration_open boolean, p_exchange_at timestamptz, p_exchange_place text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_draw boolean;
begin
  if not public.is_santa_admin() then raise exception 'Acces permis doar organizatorilor'; end if;
  select draw_done into v_draw from public.event_settings where id=1 for update;
  if v_draw and p_registration_open then raise exception 'După extragere nu mai pot fi redeschise înscrierile'; end if;
  if char_length(coalesce(p_exchange_place,''))>220 then raise exception 'Locația este prea lungă'; end if;
  update public.event_settings set registration_open=(case when v_draw then false else coalesce(p_registration_open,false) end),
    exchange_at=p_exchange_at, exchange_place=btrim(coalesce(p_exchange_place,'')) where id=1;
end;
$$;
revoke all on function public.configure_santa_event(boolean,timestamptz,text) from public, anon;
grant execute on function public.configure_santa_event(boolean,timestamptz,text) to authenticated;

-- Fiecărui dăruitor îi este atribuit un destinatar unic, niciodată el însuși.
-- Întâi grupăm aleator facultățile și studenții din interiorul lor.
-- Rotirea listei cu mărimea celei mai mari grupe evită aceeași facultate când este posibil.
-- Dacă o singură facultate are > jumătate din înscriși, maximul de perechi
-- interfacultăți este realizat, iar restul inevitabil sunt din aceeași facultate.
create or replace function public.draw_santa_names()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_n integer;
  v_max integer;
  v_shift integer;
  v_i integer;
  v_cross integer := 0;
  v_same integer := 0;
  v_giver_fac text;
  v_receiver_fac text;
  v_draw boolean;
begin
  if not public.is_santa_admin() then raise exception 'Acces permis doar organizatorilor'; end if;
  perform pg_advisory_xact_lock(2026, 1225);
  select draw_done into v_draw from public.event_settings where id=1 for update;
  if v_draw then raise exception 'Extragerea a avut deja loc'; end if;
  select count(*) into v_n from public.participants;
  if v_n < 2 then raise exception 'Sunt necesari cel puțin doi participanți'; end if;
  select max(c) into v_max from (
    select count(*) c from public.participants group by lower(btrim(faculty))
  ) x;
  select array_agg(shuffled.user_id order by shuffled.grp_rand, shuffled.person_rand)
    into v_ids from (
    select p.user_id, grp.grp_rand, random() as person_rand
      from public.participants p
      join (select lower(btrim(faculty)) fac,random() as grp_rand
            from public.participants group by lower(btrim(faculty))) grp
        on lower(btrim(p.faculty)) = grp.fac
  ) shuffled;
  v_shift := least(v_max, v_n - 1);
  -- Marcați înscrierile ca închise în aceeași tranzacție.
  update public.event_settings set registration_open=false where id=1;
  for v_i in 1..v_n loop
    select lower(btrim(faculty)) into v_giver_fac
      from public.participants where user_id = v_ids[v_i];
    select lower(btrim(faculty)) into v_receiver_fac
      from public.participants where user_id = v_ids[((v_i + v_shift - 1) % v_n) + 1];
    if v_giver_fac = v_receiver_fac then v_same := v_same+1;
    else v_cross := v_cross+1; end if;
    update public.participants
      set assigned_to = v_ids[((v_i + v_shift - 1) % v_n) + 1],gift_ready=false
      where user_id=v_ids[v_i];
  end loop;
  update public.event_settings set draw_done=true,drawn_at=now() where id=1;
  return jsonb_build_object('participants',v_n,'cross_faculty',v_cross,'same_faculty',v_same);
end;
$$;
revoke all on function public.draw_santa_names() from public, anon;
grant execute on function public.draw_santa_names() to authenticated;

-- Din SQL Editor, DUPĂ ce organizatorul se autentifică o dată,
-- adaugă-l ca administrator (înlocuiește emailul cu cel real):
-- insert into public.admins(user_id)
-- select id from auth.users where email = 'organizator@universitate.md'
-- on conflict (user_id) do nothing;
-- Păstrează SQL Editor inaccesibil studenților; cheia service_role nu se pune pe site.
