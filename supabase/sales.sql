-- Trang sales (giai đoạn 1): lead, tương tác, yêu cầu nhận lead, vai trò cộng tác viên (ctv).
-- Thiết kế: /mnt/project-files/sales-portal/thiet-ke-trang-sales.md (chủ doanh nghiệp duyệt 16/11/2026).
-- Quy tắc: nhân viên (staff), quản lý thấy mọi lead; ctv chỉ thấy lead mình phụ trách và không đọc được bảng docs.

create extension if not exists unaccent with schema extensions;

-- 1. Vai trò ctv
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner','manager','staff','viewer','ctv'));

-- 2. Chuẩn hóa số điện thoại: '0901694999, 0977469999 (danh bạ)' -> {0901694999,0977469999}; '+84 983 408 009' -> {0983408009}
create or replace function public.sales_norm_phones(s text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct p), '{}') from (
    select case when d ~ '^84\d{9,10}$' then '0'||substr(d,3) else d end p
    from (select regexp_replace(t, '\D', '', 'g') d
          from regexp_split_to_table(coalesce(s,''), '[,;/]|[[:alpha:]]+') t) a
  ) b where length(p) between 9 and 11
$$;

create or replace function public.sales_norm_name(s text) returns text
language sql stable set search_path = public, extensions as $$
  select nullif(trim(regexp_replace(lower(extensions.unaccent(coalesce(s,''))), '\s+', ' ', 'g')), '')
$$;

-- 3. Bảng
create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  ext_id text unique,
  name text not null,
  segment text, org_type text, province text, area text, address text, crops text, scale text, tax_id text, is_customer text,
  org_phone text, org_email_web text, contact_name text, contact_title text, contact_phone text, contact_zalo text, contact_email text,
  priority text, need_signal text, offer text, approach text, verify text, source text, source_url text,
  stage int not null default 1 check (stage between 0 and 7),
  temp text check (temp in ('cold','warm','hot')),
  fit text check (fit in ('low','mid','high')),
  needs text[] not null default '{}', need_note text, est_value text,
  next_type text, next_at date, next_note text, lost_reason text,
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid(), brought_by uuid, referrer text,
  created_at timestamptz not null default now(), assigned_at timestamptz,
  first_touch_at timestamptz, last_touch_at timestamptz, touch_count int not null default 0,
  updated_at timestamptz not null default now(),
  lat double precision, lng double precision,
  phones text[] not null default '{}',
  name_key text
);
create index if not exists sales_leads_owner on public.sales_leads(owner_id);
create index if not exists sales_leads_stage on public.sales_leads(stage);
create index if not exists sales_leads_next on public.sales_leads(next_at);
create index if not exists sales_leads_phones on public.sales_leads using gin(phones);
create index if not exists sales_leads_tax on public.sales_leads(tax_id);
create index if not exists sales_leads_namekey on public.sales_leads(name_key);

create table if not exists public.sales_acts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  by uuid not null default auth.uid(),
  at timestamptz not null default now(),
  kind text not null default 'act' check (kind in ('act','assign','claim','note')),
  channel text check (channel in ('call','zalo','meet','email','other')),
  result text check (result in ('noans','later','talked','interested','sent','refused')),
  minutes int, note text,
  temp_after text check (temp_after in ('cold','warm','hot')),
  fit_after text check (fit_after in ('low','mid','high')),
  stage_after int check (stage_after between 0 and 7),
  needs_after text[],
  next_type text, next_at date, next_note text,
  photos text[] not null default '{}',
  lat double precision, lng double precision, acc double precision, place text
);
create index if not exists sales_acts_lead on public.sales_acts(lead_id, at desc);
create index if not exists sales_acts_at on public.sales_acts(at desc);
create index if not exists sales_acts_by on public.sales_acts(by, at desc);

create table if not exists public.sales_claims (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.sales_leads(id) on delete cascade,
  by uuid not null default auth.uid(),
  at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','ok','no')),
  decided_by uuid, decided_at timestamptz, note text,
  unique (lead_id, by, status)
);

-- 4. Trigger
create or replace function public.sales_leads_bi() returns trigger
language plpgsql set search_path = public as $$
begin
  new.phones := sales_norm_phones(concat_ws(',', new.org_phone, new.contact_phone, new.contact_zalo));
  new.name_key := sales_norm_name(new.name);
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if my_role() = 'ctv' then
      new.owner_id := old.owner_id; new.brought_by := old.brought_by; new.created_by := old.created_by;
    end if;
    if new.owner_id is distinct from old.owner_id then new.assigned_at := now(); end if;
  else
    if my_role() = 'ctv' then new.brought_by := auth.uid(); new.created_by := auth.uid(); end if;
    if new.owner_id is not null and new.assigned_at is null then new.assigned_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists sales_leads_bi on public.sales_leads;
create trigger sales_leads_bi before insert or update on public.sales_leads for each row execute function public.sales_leads_bi();

-- Ghi tương tác thì cập nhật lead (chạy với quyền máy chủ để ctv không cần quyền sửa các cột thống kê)
create or replace function public.sales_acts_ai() returns trigger
language plpgsql security definer set search_path = public as $$
declare st int;
begin
  if new.kind <> 'act' then return new; end if;
  select stage into st from sales_leads where id = new.lead_id;
  st := coalesce(new.stage_after, st);
  if new.result = 'refused' then st := 7;
  elsif st <= 1 and new.result is not null and new.result <> 'noans' then st := 2;
  end if;
  update sales_leads set
    last_touch_at = new.at,
    first_touch_at = coalesce(first_touch_at, new.at),
    touch_count = touch_count + 1,
    stage = st,
    temp = coalesce(new.temp_after, temp),
    fit = coalesce(new.fit_after, fit),
    needs = coalesce(new.needs_after, needs),
    next_type = case when new.next_at is not null or new.next_type is not null then new.next_type else next_type end,
    next_at = case when new.next_at is not null or new.next_type is not null then new.next_at else next_at end,
    next_note = case when new.next_at is not null or new.next_type is not null then new.next_note else next_note end,
    lat = coalesce(lat, case when new.channel = 'meet' then new.lat end),
    lng = coalesce(lng, case when new.channel = 'meet' then new.lng end)
  where id = new.lead_id;
  return new;
end $$;
drop trigger if exists sales_acts_ai on public.sales_acts;
create trigger sales_acts_ai after insert on public.sales_acts for each row execute function public.sales_acts_ai();

-- 5. Phân quyền theo dòng
alter table public.sales_leads enable row level security;
alter table public.sales_acts enable row level security;
alter table public.sales_claims enable row level security;

create or replace function public.sales_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('owner','manager','staff'), false)
$$;
create or replace function public.sales_mgr() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('owner','manager'), false)
$$;

drop policy if exists sl_read on public.sales_leads;
create policy sl_read on public.sales_leads for select to authenticated
  using ((select sales_staff()) or (select my_role()) = 'viewer' or ((select my_role()) = 'ctv' and owner_id = (select auth.uid())));
drop policy if exists sl_ins on public.sales_leads;
create policy sl_ins on public.sales_leads for insert to authenticated
  with check ((select sales_staff()) or ((select my_role()) = 'ctv' and owner_id = (select auth.uid())));
drop policy if exists sl_upd on public.sales_leads;
create policy sl_upd on public.sales_leads for update to authenticated
  using ((select sales_staff()) or ((select my_role()) = 'ctv' and owner_id = (select auth.uid())))
  with check ((select sales_staff()) or ((select my_role()) = 'ctv' and owner_id = (select auth.uid())));
drop policy if exists sl_del on public.sales_leads;
create policy sl_del on public.sales_leads for delete to authenticated using ((select sales_mgr()));

drop policy if exists sa_read on public.sales_acts;
create policy sa_read on public.sales_acts for select to authenticated
  using ((select sales_staff()) or (select my_role()) = 'viewer'
         or ((select my_role()) = 'ctv' and exists (select 1 from public.sales_leads l where l.id = lead_id and l.owner_id = (select auth.uid()))));
drop policy if exists sa_ins on public.sales_acts;
create policy sa_ins on public.sales_acts for insert to authenticated
  with check (by = (select auth.uid()) and ((select sales_staff())
         or ((select my_role()) = 'ctv' and kind in ('act','note') and exists (select 1 from public.sales_leads l where l.id = lead_id and l.owner_id = (select auth.uid())))));
drop policy if exists sa_upd on public.sales_acts;
create policy sa_upd on public.sales_acts for update to authenticated
  using ((select sales_mgr()) or (by = (select auth.uid()) and at > now() - interval '24 hours'))
  with check ((select sales_mgr()) or (by = (select auth.uid()) and at > now() - interval '24 hours'));
drop policy if exists sa_del on public.sales_acts;
create policy sa_del on public.sales_acts for delete to authenticated
  using ((select sales_mgr()) or (by = (select auth.uid()) and at > now() - interval '24 hours'));

drop policy if exists sc_read on public.sales_claims;
create policy sc_read on public.sales_claims for select to authenticated
  using (by = (select auth.uid()) or (select sales_mgr()) or (select my_role()) = 'viewer');

-- 6. Hàm kiểm tra trùng, xin nhận và duyệt
create or replace function public.sales_dup(p_phone text, p_tax text, p_name text) returns text
language plpgsql stable security definer set search_path = public as $$
declare ph text[] := sales_norm_phones(p_phone); nk text := sales_norm_name(p_name); tx text := nullif(trim(coalesce(p_tax,'')),''); l record;
begin
  if not is_active() then return 'none'; end if;
  for l in select id, owner_id from sales_leads
           where (cardinality(ph) > 0 and phones && ph) or (tx is not null and tax_id = tx) or (nk is not null and name_key = nk)
           order by (owner_id = auth.uid()) desc nulls last, (owner_id is null) desc
  loop
    if l.owner_id = auth.uid() then return 'mine'; end if;
    if l.owner_id is null then return 'pool:' || l.id; end if;
    return 'owned';
  end loop;
  return 'none';
end $$;

create or replace function public.sales_claim(p_lead uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if my_role() is null then raise exception 'not_active'; end if;
  if not exists (select 1 from sales_leads where id = p_lead and owner_id is null) then raise exception 'not_in_pool'; end if;
  select id into cid from sales_claims where lead_id = p_lead and by = auth.uid() and status = 'pending';
  if cid is null then insert into sales_claims(lead_id, by) values (p_lead, auth.uid()) returning id into cid; end if;
  return cid;
end $$;

create or replace function public.sales_claim_decide(p_claim uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c_lead uuid; c_by uuid;
begin
  if not sales_mgr() then raise exception 'manager_only'; end if;
  select sc.lead_id, sc."by" into c_lead, c_by from sales_claims sc where sc.id = p_claim and sc.status = 'pending';
  if c_lead is null then raise exception 'no_claim'; end if;
  update sales_claims set status = case when p_ok then 'ok' else 'no' end, decided_by = auth.uid(), decided_at = now() where id = p_claim;
  if p_ok then
    update sales_leads set owner_id = c_by, brought_by = c_by where id = c_lead;
    insert into sales_acts(lead_id, "by", kind, note) values (c_lead, auth.uid(), 'claim', 'Duyệt yêu cầu nhận lead');
    update sales_claims set status = 'no', decided_by = auth.uid(), decided_at = now() where lead_id = c_lead and status = 'pending';
  end if;
end $$;

revoke all on function public.sales_dup(text,text,text), public.sales_claim(uuid), public.sales_claim_decide(uuid,boolean) from public, anon;
grant execute on function public.sales_dup(text,text,text), public.sales_claim(uuid), public.sales_claim_decide(uuid,boolean) to authenticated;
grant select, insert, update, delete on public.sales_leads, public.sales_acts to authenticated;
grant select on public.sales_claims to authenticated;

-- 7. Chặn ctv khỏi dữ liệu nội bộ
drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated
  using ((select is_active()) and coalesce((select my_role()), '') <> 'ctv');

-- 8. Ảnh check-in, tài liệu: bucket riêng tư 'sales'
insert into storage.buckets (id, name, public) values ('sales', 'sales', false) on conflict (id) do nothing;
drop policy if exists sales_obj_read on storage.objects;
create policy sales_obj_read on storage.objects for select to authenticated using (bucket_id = 'sales' and (
  (select sales_staff()) or (select my_role()) = 'viewer'
  or ((select my_role()) = 'ctv' and ((storage.foldername(name))[1] = (select auth.uid())::text or ((storage.foldername(name))[1] = 'kb' and (storage.foldername(name))[2] = 'ctv')))));
drop policy if exists sales_obj_ins on storage.objects;
create policy sales_obj_ins on storage.objects for insert to authenticated with check (bucket_id = 'sales' and (
  ((storage.foldername(name))[1] = 'kb' and (select sales_mgr()))
  or ((storage.foldername(name))[1] = (select auth.uid())::text and ((select sales_staff()) or (select my_role()) = 'ctv'))));
drop policy if exists sales_obj_del on storage.objects;
create policy sales_obj_del on storage.objects for delete to authenticated using (bucket_id = 'sales' and (
  (select sales_mgr()) or (storage.foldername(name))[1] = (select auth.uid())::text));

-- 9. Danh sách người dùng trang sales (tên hiển thị). Nhân viên, quản lý: mọi tài khoản đang hoạt động; ctv: chỉ chính mình.
create or replace function public.sales_people() returns table(id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.name,''), p.email), p.role from profiles p
  where p.active and is_active() and (sales_staff() or my_role() = 'viewer' or p.id = auth.uid())
$$;
revoke all on function public.sales_people() from public, anon;
grant execute on function public.sales_people() to authenticated;
