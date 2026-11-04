-- Instalare separată: cod de organizator + eliminare înainte de extragere.
-- Codul privat NU apare în acest repository; este stocat doar hash-ul SHA-256.
create table if not exists public.organizer_access (
  id integer primary key default 1 check (id = 1),
  code_hash text not null check (char_length(code_hash) = 64)
);
insert into public.organizer_access(id, code_hash) values (1, 'c57f4aad47a8a1ee2793da2c1aebdd8304ed3a4c7abaf26258c6067dfc2bac9d')
on conflict (id) do update set code_hash = excluded.code_hash;
alter table public.organizer_access enable row level security;
revoke all on public.organizer_access from public, anon, authenticated;

create or replace function public.claim_santa_admin(p_code text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_hash text;
begin
  if auth.uid() is null then raise exception 'Autentificarea este necesară'; end if;
  select code_hash into v_hash from public.organizer_access where id = 1;
  if v_hash is null or p_code is null or char_length(p_code) < 20
     or encode(sha256(convert_to(p_code, 'UTF8')), 'hex') <> v_hash then
    raise exception 'Codul de organizator nu este valid';
  end if;
  insert into public.admins(user_id) values(auth.uid())
  on conflict (user_id) do nothing;
end;
$$;
revoke all on function public.claim_santa_admin(text) from public, anon;
grant execute on function public.claim_santa_admin(text) to authenticated;

create or replace function public.remove_santa_participant(p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_open boolean; v_draw boolean;
begin
  if not public.is_santa_admin() then raise exception 'Acces permis doar organizatorilor'; end if;
  select registration_open, draw_done into v_open, v_draw
    from public.event_settings where id=1 for update;
  if not v_open or v_draw then raise exception 'Nu poți elimina persoane după închiderea înscrierilor'; end if;
  delete from public.participants where user_id = p_user_id;
end;
$$;
revoke all on function public.remove_santa_participant(uuid) from public, anon;
grant execute on function public.remove_santa_participant(uuid) to authenticated;
